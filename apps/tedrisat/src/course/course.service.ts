import {
  AuthenticatedUser,
  AuthzService,
  ENTITIES,
  SCOPES,
} from "@medaris/common";
import { Injectable } from "@nestjs/common";
import { BanService } from "../ban/ban.service";
import { KoskForbiddenError } from "../kosk/errors/kosk-forbidden.error";
import { KoskService } from "../kosk/kosk.service";
import { CourseRepository } from "./course.repository";
import {
  ICourse,
  ICourseBadgeCounts,
  ICourseDetail,
  ICourseDetailView,
  ICourseSummary,
  ICreateCourse,
  ICreateLesson,
  ICreateMuderris,
  IEnrolledCourse,
  IEnrollment,
  ILesson,
  ILessonMutation,
  IMuderris,
  IPendingEnrollment,
  IReplaceCourse,
  IRosterEnrollment,
  ISessionBatchResult,
  IUpdateCourse,
  IUpdateLesson,
} from "./course.repository.interface";
import {
  isCourseParticipant,
  withContent,
  withoutContent,
} from "./domain/course-content";
import { CourseStatus } from "./domain/course-status.enum";
import { EnrollmentStatus } from "./domain/enrollment-status.enum";
import {
  duplicateUserId,
  muderrisListChanged,
  newlyLinkedUserIds,
} from "./domain/muderris-list";
import { buildSessionView, type ISessionView } from "./domain/session-view";
import { withCanonicalTimeZone } from "./domain/time-zone";
import {
  expandWeeklyPattern,
  IPlannedSession,
  IsoWeekday,
  IWeeklyPattern,
  WeeklyPatternInvalid,
} from "./domain/weekly-pattern";
import { CourseNotFoundError } from "./errors/course-not-found.error";
import { EnrollmentNotFoundError } from "./errors/enrollment-not-found.error";
import { EnrollmentStateError } from "./errors/enrollment-state.error";
import { EnrollmentStatusForbiddenError } from "./errors/enrollment-status-forbidden.error";
import { InvalidSessionPatternError } from "./errors/invalid-session-pattern.error";
import { LessonNotFoundError } from "./errors/lesson-not-found.error";
import { LessonNotScheduledError } from "./errors/lesson-not-scheduled.error";
import { MuderrisAssignmentForbiddenError } from "./errors/muderris-assignment-forbidden.error";
import { MuderrisDuplicateUserError } from "./errors/muderris-duplicate-user.error";
import { MuderrisUnknownUserError } from "./errors/muderris-unknown-user.error";

/** A weekly pattern as the API takes it; `timeZone` defaults to the course's. */
export type SessionPatternInput = Omit<
  IWeeklyPattern,
  "weekdays" | "timeZone"
> & { weekdays: number[]; timeZone?: string };

export interface SessionBatchInput extends SessionPatternInput {
  title: string;
  durationMinutes: number;
  meetingUrl?: string;
}

export interface StudentIdentity {
  name?: string | null;
  email?: string | null;
}

@Injectable()
export class CourseService {
  constructor(
    private readonly courseRepo: CourseRepository,
    private readonly koskService: KoskService,
    private readonly authz: AuthzService,
    private readonly banService: BanService
  ) {}

  /**
   * The köşk's courses. With `archived`, its hidden ones instead — the
   * "Arşiv" view (MDRS-124), for the köşk manager and SYSTEM_ADMIN only;
   * anyone else asking for it gets 403.
   *
   * `user` null is a caller with no token (MDRS-122): the published shelf,
   * with no enrollment. The controller refuses them `archived` before this.
   */
  async findSummariesByKosk(
    koskId: string,
    user: AuthenticatedUser | null,
    archived = false
  ): Promise<ICourseSummary[]> {
    if (user === null) {
      if (archived) throw new KoskForbiddenError();
      await this.koskService.findById(koskId, null); // throws if köşk is missing
      return this.courseRepo.findSummariesByKosk(koskId, null, false);
    }
    await this.koskService.findById(koskId, user.sub); // throws if köşk is missing
    const isManager = await this.koskService.isManager(koskId, user.sub);
    if (archived) {
      if (!isManager && !this.authz.isSystemAdmin(user)) {
        throw new KoskForbiddenError();
      }
      return this.courseRepo.findSummariesByKosk(koskId, user.sub, true, true);
    }
    // Only the köşk's managers see DRAFT courses; everyone else gets PUBLISHED only.
    return this.courseRepo.findSummariesByKosk(koskId, user.sub, isManager);
  }

  async findEnrolledCourses(
    userId: string,
    includePending = false
  ): Promise<IEnrolledCourse[]> {
    return this.courseRepo.findEnrolledByUser(userId, includePending);
  }

  async getDetail(
    id: string,
    user: AuthenticatedUser | null
  ): Promise<ICourseDetail> {
    const course = await this.courseRepo.findDetailById(id, user?.sub ?? null);
    if (!course) {
      throw new CourseNotFoundError(id);
    }
    // A caller with no token (MDRS-122) holds neither `ARCHIVE` nor `EDIT`,
    // so a hidden course and a draft are both not-found to them, as below.
    // `resolveAnonymous` has already said so in front of the handler, and
    // also refused every course of an unlisted köşk; this repeats the two
    // rules a detail read can see for itself, so the answer does not rest on
    // the guard alone.
    if (user === null) {
      if (course.archivedAt !== null || course.status === CourseStatus.DRAFT) {
        throw new CourseNotFoundError(id);
      }
      return course;
    }
    // A hidden course (MDRS-124) is not-found, exactly like a draft, to all
    // but the people who may restore it: the köşk manager and SYSTEM_ADMIN,
    // which is what the `ARCHIVE` scope says.
    if (
      course.archivedAt !== null &&
      !(await this.authz.can(
        user,
        { entity: ENTITIES.COURSE, id },
        SCOPES.ARCHIVE
      ))
    ) {
      throw new CourseNotFoundError(id);
    }
    // A DRAFT course is invisible to anyone who may not edit it — surface it
    // as not-found rather than forbidden so its existence isn't leaked. Since
    // MDRS-105 that is the köşk manager, the course's müderrisler (who edit
    // it through `EDIT`, and could not open the draft they were editing
    // while this read "köşk manager only") and SYSTEM_ADMIN.
    if (
      course.status === CourseStatus.DRAFT &&
      !(await this.authz.can(
        user,
        { entity: ENTITIES.COURSE, id },
        SCOPES.EDIT
      ))
    ) {
      throw new CourseNotFoundError(id);
    }
    return course;
  }

  /**
   * The course as a caller may see it (MDRS-103): `getDetail`'s visibility
   * rules, then the content rule. This — not `getDetail` — is what a route
   * returns.
   *
   * `audit` is for reads. A content read by anyone who is neither an enrolled
   * talebe nor one of the course's müderrisler is written to `audit_log`
   * before the body is returned, so a failed write fails the read rather than
   * leaving it unrecorded. The write routes echo the course back with
   * `audit: false`: the caller has just written it, and the write is the
   * event.
   */
  async viewDetail(
    id: string,
    user: AuthenticatedUser | null,
    options: { audit: boolean } = { audit: true }
  ): Promise<ICourseDetailView> {
    return this.present(await this.getDetail(id, user), user, options);
  }

  /**
   * The content rule alone, for a detail the caller is already allowed. A
   * caller with no token (MDRS-122) never reads content: the ANONYMOUS row
   * holds no `VIEW_DETAILS`, so they get exactly the body a signed-in
   * stranger gets.
   */
  async present(
    course: ICourseDetail,
    user: AuthenticatedUser | null,
    { audit }: { audit: boolean }
  ): Promise<ICourseDetailView> {
    if (user === null) return withoutContent(course);
    const mayReadContent = await this.authz.can(
      user,
      { entity: ENTITIES.COURSE, id: course.id },
      SCOPES.VIEW_DETAILS
    );
    if (!mayReadContent) return withoutContent(course);

    if (audit && !isCourseParticipant(course, user.sub)) {
      await this.courseRepo.recordContentRead({
        actorId: user.sub,
        courseId: course.id,
        details: {
          title: course.title,
          // Who read it, as far as today's model can say. Role model v2
          // (MDRS-135) will name the permission the read went through.
          systemAdmin: this.authz.isSystemAdmin(user),
        },
      });
    }
    return withContent(course);
  }

  /**
   * A scheduled session and its course, for a calendar entry (MDRS-117).
   *
   * Authorized exactly like the session page, which is rendered from
   * `GET /courses/:id`: whoever `getDetail` shows the course to may have the
   * entry. A lesson that is missing, archived, or in a course the caller may
   * not see is one answer — LESSON_NOT_FOUND — so the route does not tell
   * a hidden course apart from a lesson that never existed.
   */
  async getScheduledLesson(
    lessonId: string,
    user: AuthenticatedUser
  ): Promise<{
    course: ICourseDetail;
    lesson: ILesson & { scheduledAt: Date };
  }> {
    const courseId = await this.courseRepo.findLessonCourseId(lessonId);
    if (!courseId) throw new LessonNotFoundError(lessonId);

    let course: ICourseDetail;
    try {
      course = await this.getDetail(courseId, user);
    } catch (error) {
      if (error instanceof CourseNotFoundError) {
        throw new LessonNotFoundError(lessonId);
      }
      throw error;
    }

    // The detail carries live lessons only, so an archived one is not here.
    const lesson = course.weeks
      .flatMap((week) => week.lessons)
      .find((l) => l.id === lessonId);
    if (!lesson) throw new LessonNotFoundError(lessonId);
    if (!lesson.scheduledAt) throw new LessonNotScheduledError(lessonId);

    return { course, lesson: { ...lesson, scheduledAt: lesson.scheduledAt } };
  }

  /**
   * One live session of a course, for its page (MDRS-158): its status, the
   * cancellation and the replacement, the neighbouring sessions, and — only
   * for a caller who may read course content — the meeting link and agenda.
   *
   * Authorized and filtered exactly like `GET /courses/:id`: it is built from
   * `viewDetail`, so a hidden course, a draft and the content rule all behave
   * the same, and a content read is audited the same way. A session that is
   * missing, archived, not live or in another course is LESSON_NOT_FOUND.
   * `now` is a parameter so a spec can pin the clock.
   */
  async getSession(
    courseId: string,
    sessionId: string,
    user: AuthenticatedUser | null,
    now: Date = new Date()
  ): Promise<ISessionView> {
    const detail = await this.viewDetail(courseId, user);
    const view = buildSessionView(
      detail,
      sessionId,
      now,
      await this.courseRepo.findImamUserId(courseId)
    );
    if (!view) throw new LessonNotFoundError(sessionId);
    return view;
  }

  // ---- course writes (MDRS-105) ----
  // Authorization is the matrix's, on CourseController: `EDIT` for the
  // course's fields and syllabus — the köşk manager and the course's
  // müderrisler — and, inside a whole-course save, `ASSIGN_MUDERRIS` for the
  // müderris list, which only the köşk manager holds. The `assertCourseOwner`
  // that narrowed every write to the köşk manager is gone.

  async create(
    koskId: string,
    author: AuthenticatedUser,
    course: Omit<ICreateCourse, "koskId" | "authorId">
  ): Promise<ICourseDetailView> {
    const authorId = author.sub;
    await this.koskService.assertManager(koskId, authorId); // köşk managers only
    await this.assertMuderrisLinks([], course.muderris ?? []);
    const created = await this.courseRepo.create({
      ...withCanonicalTimeZone(course),
      koskId,
      authorId,
    });
    return this.present(created, author, { audit: false });
  }

  /**
   * Course-level fields. The course must be visible to the caller first, so
   * that a müderris — who holds `EDIT` but not `ARCHIVE` — cannot write to a
   * course the köşk manager has hidden and then be told it does not exist.
   */
  async update(
    id: string,
    user: AuthenticatedUser,
    updates: IUpdateCourse
  ): Promise<ICourse> {
    await this.getDetail(id, user);
    const updated = await this.courseRepo.update(
      id,
      withCanonicalTimeZone(updates)
    );
    if (!updated) {
      throw new CourseNotFoundError(id);
    }
    return updated;
  }

  /**
   * The whole-course save. A caller with `EDIT` but not `ASSIGN_MUDERRIS` —
   * a müderris — may save everything but the müderris list: if the list in
   * the payload differs from the stored one in any way the save would write,
   * the save is refused whole with 403 before anything is written.
   *
   * The comparison reads the list outside the save's transaction. A list
   * changed by the köşk manager in between is caught by `version` when the
   * editor sends it (409, MDRS-95); without it the müderris' save would put
   * the old list back, which is the lost update `version` exists to stop.
   */
  async replace(
    id: string,
    user: AuthenticatedUser,
    data: IReplaceCourse
  ): Promise<ICourseDetailView> {
    await this.getDetail(id, user); // a hidden course is not saved by a müderris
    const next = data.muderris ?? [];
    const current = await this.courseRepo.findMuderris(id);
    if (
      muderrisListChanged(current, next) &&
      !(await this.authz.can(
        user,
        { entity: ENTITIES.COURSE, id },
        SCOPES.ASSIGN_MUDERRIS
      ))
    ) {
      throw new MuderrisAssignmentForbiddenError(id);
    }
    await this.assertMuderrisLinks(current, next);
    const replaced = await this.courseRepo.replace(
      id,
      user.sub,
      withCanonicalTimeZone(data)
    );
    return this.present(replaced, user, { audit: false });
  }

  /**
   * A müderris row links an account (MDRS-105) — that link is what makes the
   * person MUDERRIS on the course. Each account at most once, and every
   * account this save links anew must have signed in at least once, so that
   * a mistyped id cannot hand the role to whoever signs in under it later.
   */
  private async assertMuderrisLinks(
    current: readonly IMuderris[],
    next: readonly ICreateMuderris[]
  ): Promise<void> {
    const duplicate = duplicateUserId(next);
    if (duplicate) throw new MuderrisDuplicateUserError(duplicate);
    const linking = newlyLinkedUserIds(current, next);
    if (linking.length === 0) return;
    const known = new Set(await this.courseRepo.findKnownUserIds(linking));
    const unknown = linking.find((userId) => !known.has(userId));
    if (unknown) throw new MuderrisUnknownUserError(unknown);
  }

  // ---- session-level writes (MDRS-95) ----
  // Authorization for these three is `@Authz(SCOPES.EDIT, …)` on
  // LessonController, resolved against the lesson's parent course, so no
  // ownership assertion is repeated here.

  async createLesson(
    courseId: string,
    weekId: string,
    data: ICreateLesson
  ): Promise<ILessonMutation> {
    return this.courseRepo.createLesson(courseId, weekId, data);
  }

  async updateLesson(
    lessonId: string,
    expectedVersion: number,
    data: IUpdateLesson
  ): Promise<ILessonMutation> {
    return this.courseRepo.updateLesson(lessonId, expectedVersion, data);
  }

  /** Hides the lesson; nothing attached to it is deleted (MDRS-124). */
  async archiveLesson(
    lessonId: string,
    actorId: string | null = null
  ): Promise<ILessonMutation> {
    return this.courseRepo.archiveLesson(lessonId, actorId);
  }

  // ---- weekly pattern → sessions (MDRS-109) ----
  // Authorized by `@Authz(SCOPES.EDIT, …)` on LessonController, like the
  // three writes above.

  /** The sessions a pattern would create; nothing is written. */
  async previewSessionBatch(
    courseId: string,
    pattern: SessionPatternInput
  ): Promise<{ timeZone: string; sessions: IPlannedSession[] }> {
    return this.planSessions(courseId, pattern);
  }

  /** Expands the pattern and inserts every session in one transaction. */
  async createSessionBatch(
    courseId: string,
    input: SessionBatchInput
  ): Promise<ISessionBatchResult & { timeZone: string }> {
    const { title, durationMinutes, meetingUrl, ...pattern } = input;
    let timeZone = "";
    const result = await this.courseRepo.createSessionBatch(courseId, {
      title,
      durationMinutes,
      meetingUrl,
      plan: (courseZone) => {
        const planned = this.expand(pattern, courseZone);
        timeZone = planned.timeZone;
        return planned.sessions;
      },
    });
    return { ...result, timeZone };
  }

  private async planSessions(
    courseId: string,
    pattern: SessionPatternInput
  ): Promise<{ timeZone: string; sessions: IPlannedSession[] }> {
    const courseZone = await this.courseRepo.findTimeZone(courseId);
    if (courseZone === null) throw new CourseNotFoundError(courseId);
    return this.expand(pattern, courseZone);
  }

  /** The pattern in its own zone, or the course's when it names none. */
  private expand(
    pattern: SessionPatternInput,
    courseZone: string
  ): { timeZone: string; sessions: IPlannedSession[] } {
    const timeZone = pattern.timeZone ?? courseZone;
    try {
      const sessions = expandWeeklyPattern({
        ...pattern,
        weekdays: pattern.weekdays as IsoWeekday[],
        timeZone,
      });
      return { timeZone, sessions };
    } catch (error) {
      if (error instanceof WeeklyPatternInvalid) {
        throw new InvalidSessionPatternError(error.problem);
      }
      throw error;
    }
  }

  // ---- hide / restore / delete (MDRS-124) ----
  // Authorization is `@Authz` on CourseController: `ARCHIVE` (the köşk
  // manager) for hide and restore, `DELETE` (SYSTEM_ADMIN only — it is on no
  // role row) for the real delete. Nothing is re-checked here.

  async archive(id: string, userId: string): Promise<void> {
    if (!(await this.courseRepo.archive(id, userId))) {
      throw new CourseNotFoundError(id);
    }
  }

  async restore(id: string): Promise<void> {
    if (!(await this.courseRepo.restore(id))) {
      throw new CourseNotFoundError(id);
    }
  }

  async delete(id: string, actorId: string): Promise<boolean> {
    const removed = await this.courseRepo.purge(id, actorId);
    if (!removed) throw new CourseNotFoundError(id);
    return true;
  }

  async enroll(
    user: AuthenticatedUser,
    courseId: string,
    student: StudentIdentity = {}
  ): Promise<IEnrollment> {
    const userId = user.sub;
    const course = await this.getDetail(courseId, user); // throws if missing
    // A barred talebe does not apply again (MDRS-177).
    await this.banService.assertNotBarred(userId, courseId);
    // A course of an unlisted köşk always waits for approval (MDRS-122),
    // whatever its own `requires_approval` says: the link is how the köşk is
    // found, and passing a link on must not hand out seats. So does a course
    // of a medrese whose policy is "Kayıt her zaman onaylı" (nazir/04), which
    // its own settings cannot reopen.
    const unlisted =
      (await this.koskService.findVisibility(course.koskId))?.isPrivate ??
      false;
    const status =
      course.requiresApproval ||
      unlisted ||
      (await this.courseRepo.forcesApproval(courseId))
        ? EnrollmentStatus.PENDING
        : EnrollmentStatus.ENROLLED;
    return this.courseRepo.enroll(userId, courseId, {
      status,
      studentName: student.name ?? null,
      studentEmail: student.email ?? null,
    });
  }

  async findPendingEnrollments(
    koskId: string,
    userId: string
  ): Promise<IPendingEnrollment[]> {
    await this.koskService.assertManager(koskId, userId); // köşk managers only
    return this.courseRepo.findPendingByKosk(koskId);
  }

  // ---- the course team's enrollment actions (MDRS-105) ----
  // Authorization is `@Authz(SCOPES.MANAGE_ENROLLMENTS, …)` on
  // CourseController: the köşk manager and the course's müderrisler. Nothing
  // narrows it further here.

  /** The course menu's badges (MDRS-183); the controller has already 404ed an unknown course. */
  async getBadgeCounts(courseId: string): Promise<ICourseBadgeCounts> {
    return this.courseRepo.getBadgeCounts(courseId);
  }

  /** Requests, active seats and completions, for the team's roster. */
  async findEnrollments(courseId: string): Promise<IRosterEnrollment[]> {
    const [rows, koskId] = await Promise.all([
      this.courseRepo.findEnrollmentsByCourse(courseId),
      this.courseRepo.findKoskId(courseId),
    ]);
    // Who is barred, so the roster marks them (MDRS-177). Only the scope
    // travels, never the reason: that is for those who lift the ban.
    const barred =
      koskId === null
        ? new Map()
        : await this.banService.openBansIn(courseId, koskId);
    return rows.map((row) => {
      const ban = barred.get(row.userId);
      return {
        ...row,
        ban: ban ? { id: ban.id, scope: ban.scope } : null,
      };
    });
  }

  /**
   * Approves a request. Approving an active seat again changes nothing; a
   * completion is not turned back into a seat this way (that is
   * `setEnrollmentStatus`), since the team now includes every müderris.
   */
  async approveEnrollment(
    courseId: string,
    studentId: string
  ): Promise<IEnrollment> {
    const existing = await this.courseRepo.findEnrollment(studentId, courseId);
    if (!existing) throw new EnrollmentNotFoundError(courseId);
    if (existing.status === EnrollmentStatus.ENROLLED) return existing;
    if (existing.status === EnrollmentStatus.COMPLETED) {
      throw new EnrollmentStateError(courseId, existing.status);
    }
    const updated = await this.courseRepo.setEnrollmentStatus(
      studentId,
      courseId,
      EnrollmentStatus.ENROLLED
    );
    if (!updated) {
      throw new EnrollmentNotFoundError(courseId);
    }
    return updated;
  }

  async rejectEnrollment(
    courseId: string,
    studentId: string
  ): Promise<boolean> {
    // Only pending requests can be rejected; an active seat is taken away
    // with `removeEnrollment`, which needs a reason.
    const existing = await this.courseRepo.findEnrollment(studentId, courseId);
    if (!existing || existing.status !== EnrollmentStatus.PENDING) {
      throw new EnrollmentNotFoundError(courseId);
    }
    return this.courseRepo.deleteEnrollment(studentId, courseId);
  }

  /**
   * Marks a talebe's enrollment completed, or reopens a completed one
   * (MDRS-105, the owner's decision of 1 October: only the course team
   * completes a course). A request that is still pending is approved first.
   */
  async setEnrollmentStatus(
    courseId: string,
    studentId: string,
    status: EnrollmentStatus.ENROLLED | EnrollmentStatus.COMPLETED
  ): Promise<IEnrollment> {
    const existing = await this.courseRepo.findEnrollment(studentId, courseId);
    if (!existing) throw new EnrollmentNotFoundError(courseId);
    if (existing.status === EnrollmentStatus.PENDING) {
      throw new EnrollmentStateError(courseId, existing.status);
    }
    if (existing.status === status) return existing;
    return (await this.courseRepo.setEnrollmentStatus(
      studentId,
      courseId,
      status
    )) as IEnrollment;
  }

  /**
   * Takes an enrolled talebe out of the course, with the team's reason
   * (MDRS-105). The seat goes and the reason is kept in `audit_log`. It is
   * not a ban: the talebe may apply again, and a ban is MDRS-113's.
   *
   * Only an active seat: a request is rejected instead, and a completed
   * course is reopened first, so a completion is never removed by accident.
   */
  async removeEnrollment(
    courseId: string,
    actorId: string,
    studentId: string,
    reason: string
  ): Promise<boolean> {
    const existing = await this.courseRepo.findEnrollment(studentId, courseId);
    if (!existing) throw new EnrollmentNotFoundError(courseId);
    if (existing.status !== EnrollmentStatus.ENROLLED) {
      throw new EnrollmentStateError(courseId, existing.status);
    }
    const removed = await this.courseRepo.removeEnrollment({
      userId: studentId,
      courseId,
      actorId,
      reason: reason.trim(),
      expectedStatus: EnrollmentStatus.ENROLLED,
    });
    if (!removed) throw new EnrollmentNotFoundError(courseId);
    return true;
  }

  // ---- the talebe's own enrollment ----

  /**
   * The caller leaves the course, or withdraws a request still awaiting
   * approval (MDRS-105). Either way the row goes and they may apply again.
   * A completed course is not left: the completion is the talebe's record.
   */
  async leave(userId: string, courseId: string): Promise<boolean> {
    // The seat stays while the ban does: leaving would drop the record the
    // ban sits on, and the talebe is barred from applying again (MDRS-177).
    await this.banService.assertNotBarred(userId, courseId);
    const existing = await this.courseRepo.findEnrollment(userId, courseId);
    if (!existing) throw new EnrollmentNotFoundError(courseId);
    if (existing.status === EnrollmentStatus.COMPLETED) {
      throw new EnrollmentStateError(courseId, existing.status);
    }
    return this.courseRepo.deleteEnrollment(userId, courseId);
  }

  /**
   * Records the talebe's own progress. The status is not theirs to set
   * (MDRS-105): reaching 100% no longer completes the course, a completion
   * set by the team survives later progress writes, and a `status` that
   * would change the enrollment's is refused with 403.
   */
  async updateProgress(
    userId: string,
    courseId: string,
    progress: number,
    status?: EnrollmentStatus
  ): Promise<IEnrollment> {
    // Progress can only be recorded against an active enrollment. A pending
    // (awaiting-approval) or missing enrollment must not be silently promoted,
    // otherwise this endpoint would bypass the course team's approval.
    const existing = await this.courseRepo.findEnrollment(userId, courseId);
    if (!existing || existing.status === EnrollmentStatus.PENDING) {
      throw new EnrollmentNotFoundError(courseId);
    }
    if (status !== undefined && status !== existing.status) {
      throw new EnrollmentStatusForbiddenError(courseId);
    }
    const updated = await this.courseRepo.updateProgress(
      userId,
      courseId,
      progress,
      existing.status
    );
    return updated as IEnrollment;
  }
}
