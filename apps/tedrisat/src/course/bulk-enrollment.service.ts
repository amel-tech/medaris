import { Injectable } from "@nestjs/common";
import { BanService } from "../ban/ban.service";
import {
  type IDirectoryUser,
  KeycloakAdminNotConfiguredError,
  KeycloakAdminService,
} from "../keycloak-admin/keycloak-admin.service";
import { LessonInvitationService } from "../lesson-invitation/lesson-invitation.service";
import { CourseRepository } from "./course.repository";
import type { IEnrollment } from "./course.repository.interface";
import { CourseService } from "./course.service";
import {
  BULK_LOOKUP_CONCURRENCY,
  type IBulkEnrollmentResult,
  mapWithConcurrency,
  normalizeEmails,
  SKIP_BARRED,
  SKIP_CHANGED,
  SKIP_REVOKED,
} from "./domain/bulk-enrollment";
import { CourseStatus } from "./domain/course-status.enum";
import { EnrollmentStatus } from "./domain/enrollment-status.enum";
import { CourseNotFoundError } from "./errors/course-not-found.error";
import { EnrollmentNotFoundError } from "./errors/enrollment-not-found.error";
import { EnrollmentStateError } from "./errors/enrollment-state.error";

/** Where one address ended up; `account` is set for the ones that name an account. */
export type SeatOutcome =
  | { kind: "enrolled" | "approved" | "already"; account: string }
  | { kind: "skipped"; reason: string };
type Outcome = SeatOutcome;

/**
 * Why no talebe could enrol in a course on their own right now: it is gone,
 * a draft, hidden, or held in a hidden köşk.
 */
export type CourseClosedReason =
  | "COURSE_NOT_FOUND"
  | "COURSE_NOT_PUBLISHED"
  | "COURSE_HIDDEN"
  | "KOSK_HIDDEN";

/**
 * "Toplu talebe ekle" (owner, 2026-10-12): the course team enrols a list of
 * people by e-mail address, everyone who bought the course elsewhere and has
 * an account in the realm. Authorization is the approval's,
 * `enrollment.decide` on the course (`CourseController.bulkEnroll`).
 *
 * The team chooses these people, so the course's approval rules do not apply:
 * someone with no enrollment gets an ENROLLED seat, a waiting request is
 * approved through the approve route's own path. What self-enrolment refuses
 * for every talebe refuses the whole list: a draft, a hidden course, a course
 * of a hidden köşk. A ban and a seat the team took away are kept as they are.
 *
 * Every address is looked up before anything is written, so a realm that
 * stops answering half-way fails the request (503) with nothing enrolled, and
 * is never read as "no such account".
 */
@Injectable()
export class BulkEnrollmentService {
  // Value imports all: `import type` erases them from `design:paramtypes`
  // and Nest can no longer inject them.
  constructor(
    private readonly courseRepo: CourseRepository,
    private readonly courseService: CourseService,
    private readonly banService: BanService,
    private readonly keycloak: KeycloakAdminService,
    private readonly invitations: LessonInvitationService
  ) {}

  async bulkEnroll(
    courseId: string,
    actorId: string,
    rawEmails: readonly string[]
  ): Promise<IBulkEnrollmentResult> {
    if (!this.keycloak.isConfigured()) {
      throw new KeycloakAdminNotConfiguredError();
    }
    await this.assertTakesEnrollments(courseId);

    const { emails, invalid } = normalizeEmails(rawEmails);
    const accounts = await mapWithConcurrency(
      emails,
      BULK_LOOKUP_CONCURRENCY,
      (email) => this.keycloak.findByExactEmail(email)
    );

    const result: IBulkEnrollmentResult = {
      enrolled: [],
      approved: [],
      already: [],
      notFound: [],
      invalid,
      skipped: [],
    };
    const enrolledIds: string[] = [];
    const approvedIds: string[] = [];
    for (const [index, email] of emails.entries()) {
      const account = accounts[index];
      if (!account) {
        result.notFound.push(email);
        continue;
      }
      const outcome = await this.place(courseId, actorId, email, account);
      if (outcome.kind === "skipped") {
        result.skipped.push({ email, reason: outcome.reason });
        continue;
      }
      result[outcome.kind].push(email);
      if (outcome.kind === "enrolled") enrolledIds.push(outcome.account);
      if (outcome.kind === "approved") approvedIds.push(outcome.account);
    }

    // Once for the whole list: a round reconciles every seat at once.
    if (enrolledIds.length > 0 || approvedIds.length > 0) {
      this.invitations.kick();
    }
    await this.courseRepo.recordBulkEnrollment({
      actorId,
      courseId,
      details: {
        counts: {
          submitted: rawEmails.length,
          enrolled: result.enrolled.length,
          approved: result.approved.length,
          already: result.already.length,
          notFound: result.notFound.length,
          invalid: result.invalid.length,
          skipped: result.skipped.length,
        },
        enrolledUserIds: enrolledIds,
        approvedUserIds: approvedIds,
      },
    });
    return result;
  }

  /**
   * Refuses the list, with self-enrolment's own answer (404 COURSE_NOT_FOUND),
   * for a course no talebe could enrol in on their own: missing, a draft,
   * hidden, or held in a hidden köşk. Asked here and not through
   * `CourseService.getDetail`, which lets the course team see their own draft
   * and the köşk nazımı their hidden course: these seats are for talebe.
   */
  private async assertTakesEnrollments(courseId: string): Promise<void> {
    if (await this.closedReason(courseId)) {
      throw new CourseNotFoundError(courseId);
    }
  }

  /**
   * Why the course takes no enrolment now, or null when it does. The same
   * question `assertTakesEnrollments` asks, with the answer spelled out: a
   * partner application's registration (`PartnerEnrollmentService`) is
   * refused with it rather than with a bare not-found.
   */
  async closedReason(courseId: string): Promise<CourseClosedReason | null> {
    const course = await this.courseRepo.findPublicVisibility(courseId);
    if (!course) return "COURSE_NOT_FOUND";
    if (course.status !== CourseStatus.PUBLISHED) {
      return "COURSE_NOT_PUBLISHED";
    }
    if (course.archived) return "COURSE_HIDDEN";
    if (course.koskHidden) return "KOSK_HIDDEN";
    return null;
  }

  /**
   * Seats one account, or says why not. Also how a partner application's
   * registration seats its person (`PartnerEnrollmentService`), so a seat
   * the integration adds is the one the team's list adds: the same writes,
   * the same approval of a waiting request and its notification, the same
   * refusals. The caller runs the invitations (`LessonInvitationService.kick`)
   * once it is done, as `bulkEnroll` does for its whole list.
   */
  async place(
    courseId: string,
    actorId: string,
    email: string,
    account: IDirectoryUser
  ): Promise<Outcome> {
    // A barred talebe does not take a seat by any road (MDRS-177), the
    // waiting request of one included.
    if (await this.banService.isBarred(account.id, courseId)) {
      return { kind: "skipped", reason: SKIP_BARRED };
    }
    const held = await this.courseRepo.findEnrollment(account.id, courseId);
    if (held) return this.settleHeld(courseId, actorId, held);
    const created = await this.courseRepo.enroll(account.id, courseId, {
      status: EnrollmentStatus.ENROLLED,
      studentName:
        [account.givenName, account.familyName]
          .filter(Boolean)
          .join(" ")
          .trim() || null,
      studentEmail: account.email ?? email,
    });
    // `enroll` hands back the row that was there when another request (the
    // talebe's own) landed first; that row is decided like any other.
    return created.status === EnrollmentStatus.ENROLLED
      ? { kind: "enrolled", account: account.id }
      : this.settleHeld(courseId, actorId, created);
  }

  /** An account that already has an enrollment in the course. */
  private async settleHeld(
    courseId: string,
    actorId: string,
    held: IEnrollment
  ): Promise<Outcome> {
    switch (held.status) {
      case EnrollmentStatus.ENROLLED:
        return { kind: "already", account: held.userId };
      case EnrollmentStatus.REVOKED:
        return { kind: "skipped", reason: SKIP_REVOKED };
      case EnrollmentStatus.PENDING:
        return this.approve(courseId, actorId, held.userId);
      default:
        return { kind: "skipped", reason: held.status };
    }
  }

  /**
   * A waiting request, approved through the approve route's path: the same
   * conditional write, the same ENROLLMENT_APPROVED notification. A request
   * that moved in the meantime is told as it is now.
   */
  private async approve(
    courseId: string,
    actorId: string,
    studentId: string
  ): Promise<Outcome> {
    try {
      await this.courseService.approveEnrollment(courseId, studentId, actorId, {
        kick: false,
      });
      return { kind: "approved", account: studentId };
    } catch (error) {
      if (
        !(error instanceof EnrollmentStateError) &&
        !(error instanceof EnrollmentNotFoundError)
      ) {
        throw error;
      }
      const now = await this.courseRepo.findEnrollment(studentId, courseId);
      if (!now) return { kind: "skipped", reason: SKIP_CHANGED };
      if (now.status === EnrollmentStatus.PENDING) {
        return { kind: "skipped", reason: SKIP_CHANGED };
      }
      return this.settleHeld(courseId, actorId, now);
    }
  }
}
