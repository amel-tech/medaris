import { Injectable } from "@nestjs/common";
import { BanService } from "../ban/ban.service";
import {
  BulkEnrollmentService,
  type CourseClosedReason,
  type SeatOutcome,
} from "../course/bulk-enrollment.service";
import { CourseRepository } from "../course/course.repository";
import type { IEnrollment } from "../course/course.repository.interface";
import { CourseService } from "../course/course.service";
import { SKIP_BARRED, SKIP_REVOKED } from "../course/domain/bulk-enrollment";
import { EnrollmentStatus } from "../course/domain/enrollment-status.enum";
import { EnrollmentNotFoundError } from "../course/errors/enrollment-not-found.error";
import { EnrollmentStateError } from "../course/errors/enrollment-state.error";
import {
  type IDirectoryAccount,
  KeycloakAdminNotConfiguredError,
  KeycloakAdminService,
} from "../keycloak-admin/keycloak-admin.service";
import { LessonInvitationService } from "../lesson-invitation/lesson-invitation.service";
import { partnerActorDetails } from "./domain/partner-actor";
import {
  type PartnerEnrollStatus,
  type PartnerRefusalReason,
  type PartnerUnenrollStatus,
  partnerRemovalReason,
} from "./domain/partner-enrollment";
import {
  PartnerCourseUnknownError,
  PartnerEnrollmentRefusedError,
  PartnerRegistrationUserMismatchError,
  PartnerUserUnknownError,
  PartnerUserUnverifiedError,
} from "./errors/partner-errors";
import type { IPartnerLink } from "./partner.repository";
import { PartnerRepository } from "./partner.repository";
import type { IPartnerCaller } from "./partner-request";

/** A registration as the partner names it: its id and its course code. */
export interface IRegistrationKey {
  registrationRef: string;
  courseCode: string;
}

const REFUSAL_OF_CLOSED: Record<CourseClosedReason, PartnerRefusalReason> = {
  COURSE_NOT_FOUND: "COURSE_NOT_FOUND",
  COURSE_NOT_PUBLISHED: "COURSE_NOT_PUBLISHED",
  COURSE_HIDDEN: "COURSE_HIDDEN",
  KOSK_HIDDEN: "KOSK_HIDDEN",
};

/** `bulk-enrollment`'s skip reasons, as the partner reads them. */
function refusalOf(reason: string): PartnerRefusalReason {
  if (reason === SKIP_BARRED) return "BANNED";
  if (reason === SKIP_REVOKED) return "REMOVED_BY_COURSE_TEAM";
  return "CHANGED";
}

const sameInstant = (a: Date | null, b: Date | null): boolean =>
  a !== null && b !== null && a.getTime() === b.getTime();

/**
 * A partner application's registrations as Medaris enrollments (partner
 * enrollments, `/integrations/*`). A person approved on the partner's site
 * becomes a talebe of the course the partner's code maps to; cancelling there
 * takes away only the seat the integration added.
 *
 * Seats are written through the course team's own paths, so the audit log,
 * the session invitations and the notifications are what the team's actions
 * produce: a new seat or an approved request as "Toplu talebe ekle" makes it
 * (`BulkEnrollmentService.place`), a removal as "Talebeyi dersten çıkar" does
 * (`CourseService.removeEnrollment`, REVOKED, with a reason naming the
 * partner). The partner's service account is the actor; each audit row names
 * the partner in its details (`partnerActorDetails`).
 *
 * Whose seat it is. A link owns the seat when it made the person a talebe: a
 * new seat, an approved request, or a seat the integration itself had taken
 * away given back. A person who was enrolled already, on their own or through
 * another registration, is ALREADY_ENROLLED and the link owns nothing; a
 * DELETE of it keeps the seat. A seat stops being the link's when the person
 * takes one again on their own after leaving (the enrollment row is a new
 * one, so its `created_at` differs from the one the link recorded), and when
 * the course is completed (a completion is the talebe's record). When the
 * owning link is cancelled while another registration still stands for the
 * same seat, the seat passes to that one and stays.
 */
@Injectable()
export class PartnerEnrollmentService {
  // Value imports all: `import type` erases them from `design:paramtypes`
  // and Nest can no longer inject them.
  constructor(
    private readonly repo: PartnerRepository,
    private readonly courseRepo: CourseRepository,
    private readonly courseService: CourseService,
    private readonly bulk: BulkEnrollmentService,
    private readonly bans: BanService,
    private readonly keycloak: KeycloakAdminService,
    private readonly invitations: LessonInvitationService
  ) {}

  /** `PUT /integrations/enrollments/{registrationRef}/{courseCode}`. */
  async enroll(
    partner: IPartnerCaller,
    key: IRegistrationKey,
    userId: string
  ): Promise<{ status: PartnerEnrollStatus; courseId: string }> {
    const person = userId.toLowerCase();
    const mapped = await this.repo.findCodeCourse(
      partner.clientId,
      key.courseCode
    );
    if (!mapped) throw new PartnerCourseUnknownError(key.courseCode);

    const existing = await this.repo.findLink(
      partner.clientId,
      key.registrationRef,
      key.courseCode
    );
    if (existing && existing.userId !== person) {
      throw new PartnerRegistrationUserMismatchError();
    }
    // An open registration stays with the course it seated the person in,
    // even when its code has been mapped elsewhere since.
    const courseId =
      existing && existing.closedAt === null ? existing.courseId : mapped;

    const account = await this.account(person);
    const closed = await this.bulk.closedReason(courseId);
    if (closed) {
      throw new PartnerEnrollmentRefusedError(REFUSAL_OF_CLOSED[closed]);
    }

    // Claimed before anything is seated, so two calls racing for one
    // registration with two people cannot both seat theirs.
    const { link, inserted } = existing
      ? { link: existing, inserted: false }
      : await this.repo.claimLink({
          partnerClientId: partner.clientId,
          registrationRef: key.registrationRef,
          courseCode: key.courseCode,
          courseId,
          userId: person,
        });
    if (link.userId !== person) {
      throw new PartnerRegistrationUserMismatchError();
    }

    let outcome: SeatOutcome;
    try {
      outcome = await this.seat(partner, courseId, account);
    } catch (error) {
      if (inserted) await this.repo.deleteLink(link.id);
      throw error;
    }
    if (outcome.kind === "skipped") {
      // A completion is a seat they hold: nothing to add.
      if (outcome.reason !== EnrollmentStatus.COMPLETED) {
        // A refused registration links nothing; one that stood before stays
        // as it was.
        if (inserted) await this.repo.deleteLink(link.id);
        throw new PartnerEnrollmentRefusedError(refusalOf(outcome.reason));
      }
      outcome = { kind: "already", account: person };
    }

    const created = outcome.kind !== "already";
    const seat = created
      ? await this.courseRepo.findEnrollment(person, courseId)
      : null;
    if (link.closedAt !== null) {
      await this.repo.reopenLink(
        link.id,
        courseId,
        seat ? { enrollmentCreatedAt: seat.createdAt } : null
      );
    } else if (seat) {
      await this.repo.markCreated(link.id, seat.createdAt);
    }

    if (created) {
      this.invitations.kick();
      await this.repo.recordEnrollment({
        partner,
        actorId: partner.actorId,
        courseId,
        details: {
          userId: person,
          registrationRef: key.registrationRef,
          courseCode: key.courseCode,
          outcome: outcome.kind,
        },
      });
    }
    return { status: created ? "ENROLLED" : "ALREADY_ENROLLED", courseId };
  }

  /** `DELETE /integrations/enrollments/{registrationRef}/{courseCode}`. */
  async unenroll(
    partner: IPartnerCaller,
    key: IRegistrationKey
  ): Promise<{ status: PartnerUnenrollStatus }> {
    const link = await this.repo.findLink(
      partner.clientId,
      key.registrationRef,
      key.courseCode
    );
    if (!link) return { status: "NOT_FOUND" };
    // Answered again as it was the first time.
    if (link.closedAt !== null) {
      return { status: link.createdEnrollment ? "REMOVED" : "KEPT" };
    }
    if (!link.createdEnrollment) {
      await this.repo.closeLink(link.id, { createdEnrollment: false });
      return { status: "KEPT" };
    }

    const seat = await this.courseRepo.findEnrollment(
      link.userId,
      link.courseId
    );
    const verdict = this.ownedSeat(link, seat);
    if (verdict !== "owned") {
      await this.repo.closeLink(link.id, {
        createdEnrollment: verdict === "gone",
      });
      return { status: verdict === "gone" ? "REMOVED" : "KEPT" };
    }

    const other = await this.repo.findOtherOpenLink(
      link.courseId,
      link.userId,
      link.id
    );
    if (other && seat) {
      await this.repo.handOver(link.id, other.id, seat.createdAt);
      return { status: "KEPT" };
    }

    try {
      await this.courseService.removeEnrollment(
        link.courseId,
        partner.actorId,
        link.userId,
        partnerRemovalReason(partner.name),
        {
          ...partnerActorDetails(partner),
          registrationRef: key.registrationRef,
          courseCode: key.courseCode,
        }
      );
    } catch (error) {
      if (
        !(error instanceof EnrollmentStateError) &&
        !(error instanceof EnrollmentNotFoundError)
      ) {
        throw error;
      }
      // The seat moved while this ran (left, completed, removed by the team):
      // decided as it is now.
      const now = await this.courseRepo.findEnrollment(
        link.userId,
        link.courseId
      );
      const gone = this.ownedSeat(link, now) === "gone";
      await this.repo.closeLink(link.id, { createdEnrollment: gone });
      return { status: gone ? "REMOVED" : "KEPT" };
    }

    const after = await this.courseRepo.findEnrollment(
      link.userId,
      link.courseId
    );
    await this.repo.closeLink(link.id, {
      createdEnrollment: true,
      enrollmentRemovedAt:
        after?.status === EnrollmentStatus.REVOKED ? after.updatedAt : null,
    });
    return { status: "REMOVED" };
  }

  /** `GET /integrations/courses`: this partner's codes and their courses. */
  listCourses(
    partner: IPartnerCaller
  ): Promise<{ code: string; courseId: string; title: string }[]> {
    return this.repo.listPartnerCodes(partner.clientId);
  }

  /**
   * The account behind the subject the partner sent, which must exist, be
   * able to sign in and have a verified e-mail. Read with the `view-users`
   * right tedrisat's service account already has.
   */
  private async account(userId: string): Promise<IDirectoryAccount> {
    if (!this.keycloak.isConfigured()) {
      throw new KeycloakAdminNotConfiguredError();
    }
    const account = await this.keycloak.findAccount(userId);
    if (!account || !account.enabled) throw new PartnerUserUnknownError();
    if (!account.emailVerified) throw new PartnerUserUnverifiedError();
    return { ...account, id: account.id.toLowerCase() };
  }

  /**
   * Seats the person through the team's path; a seat the integration itself
   * took away, and nobody has touched since, is given back through the
   * approve route's path (a REVOKED seat is the one way back in, MDRS-161),
   * which the team's list would refuse.
   */
  private async seat(
    partner: IPartnerCaller,
    courseId: string,
    account: IDirectoryAccount
  ): Promise<SeatOutcome> {
    const held = await this.courseRepo.findEnrollment(account.id, courseId);
    if (
      held?.status === EnrollmentStatus.REVOKED &&
      (await this.removedByIntegration(courseId, held))
    ) {
      if (await this.bans.isBarred(account.id, courseId)) {
        return { kind: "skipped", reason: SKIP_BARRED };
      }
      try {
        await this.courseService.approveEnrollment(
          courseId,
          account.id,
          partner.actorId,
          { kick: false }
        );
        return { kind: "approved", account: account.id };
      } catch (error) {
        if (
          !(error instanceof EnrollmentStateError) &&
          !(error instanceof EnrollmentNotFoundError)
        ) {
          throw error;
        }
        // Moved meanwhile: seated as it stands now.
      }
    }
    return this.bulk.place(courseId, partner.actorId, account.email ?? "", {
      id: account.id,
      givenName: account.givenName,
      familyName: account.familyName,
      email: account.email,
    });
  }

  /** The REVOKED seat is still exactly as an integration removal left it. */
  private async removedByIntegration(
    courseId: string,
    held: IEnrollment
  ): Promise<boolean> {
    const removals = await this.repo.findRemovals(courseId, held.userId);
    return removals.some((at) => sameInstant(at, held.updatedAt));
  }

  /**
   * Whether the link still owns the seat it made: `gone` when there is none
   * left to take away (they left, or the team removed them), `theirs` when
   * the seat is no longer the one the link made (they took one again on their
   * own) or is a completion, the talebe's record.
   */
  private ownedSeat(
    link: IPartnerLink,
    seat: IEnrollment | null
  ): "owned" | "gone" | "theirs" {
    if (!seat || seat.status === EnrollmentStatus.REVOKED) return "gone";
    if (!sameInstant(seat.createdAt, link.enrollmentCreatedAt)) return "theirs";
    return seat.status === EnrollmentStatus.ENROLLED ? "owned" : "theirs";
  }
}
