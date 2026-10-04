import {
  AuthenticatedUser,
  AuthzService,
  ENTITIES,
  SCOPES,
} from "@medaris/common";
import { Injectable } from "@nestjs/common";
import { UserDirectoryService } from "../assignment/user-directory.service";
import { BanService } from "../ban/ban.service";
import { BunnyStreamClient } from "../bunny-stream/bunny-stream.client";
import { KoskForbiddenError } from "../kosk/errors/kosk-forbidden.error";
import { KoskService } from "../kosk/kosk.service";
import { LessonInvitationService } from "../lesson-invitation/lesson-invitation.service";
import { PlatformPolicyService } from "../platform-policy/platform-policy.service";
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
  IRemovedEnrollment,
  IReplaceCourse,
  IRosterEnrollment,
  ISessionBatchResult,
  IUpdateCourse,
  IUpdateLesson,
} from "./course.repository.interface";
import { CourseNotifier } from "./course-notifier";
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
import {
  type IRecordingRow,
  type IRecordingView,
  liveStreamFor,
  RecordingProvider,
  RecordingStatus,
  visibleRecordings,
} from "./domain/recording";
import { buildSessionView, type ISessionView } from "./domain/session-view";
import { withCanonicalTimeZone } from "./domain/time-zone";
import {
  expandWeeklyPattern,
  IPlannedSession,
  IsoWeekday,
  IWeeklyPattern,
  placeInWeeks,
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
import { MuderrisListInvalidError } from "./errors/muderris-list-invalid.error";
import { MuderrisUnknownUserError } from "./errors/muderris-unknown-user.error";
import {
  type IStoredRecording,
  RecordingRepository,
} from "./recording.repository";

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
    private readonly banService: BanService,
    private readonly recordingRepo: RecordingRepository,
    private readonly platformPolicies: PlatformPolicyService,
    private readonly notifier: CourseNotifier,
    private readonly directory: UserDirectoryService,
    private readonly bunny: BunnyStreamClient,
    // Kicked after every write that can change which sessions a talebe's
    // calendar should hold (MDRS-121); it does nothing without a sender.
    private readonly invitations: LessonInvitationService
  ) {}

  /**
   * The stored recordings without their Bunny video ids, and the ids kept
   * aside by recording id (MDRS-119). Nothing is signed here: a link is built
   * only for a recording the caller's filter (`visibleRecordings`) kept, by
   * `signPlayback`, so no player link is minted for a recording the caller
   * may not see, not even one that is then dropped.
   */
  private withoutVideoIds(stored: IStoredRecording[]): {
    recordings: Omit<IStoredRecording, "bunnyVideoId">[];
    videoIds: Map<string, string>;
  } {
    const videoIds = new Map<string, string>();
    const recordings = stored.map(({ bunnyVideoId, ...rec }) => {
      if (bunnyVideoId) videoIds.set(rec.id, bunnyVideoId);
      return rec;
    });
    return { recordings, videoIds };
  }

  /**
   * The recordings a caller was let see, each BUNNY one READY given its
   * signed player link (MDRS-116, MDRS-119): built now, with a fresh token
   * and expiry when the library has a token key. The Bunny video id itself
   * never reaches a response.
   */
  private signPlayback(
    visible: IRecordingView[],
    videoIds: Map<string, string>,
    now: Date
  ): IRecordingView[] {
    return visible.map((rec) => {
      if (rec.provider !== RecordingProvider.BUNNY) return rec;
      const videoId = videoIds.get(rec.id);
      return {
        ...rec,
        url:
          rec.status === RecordingStatus.READY && videoId
            ? this.bunny.embedUrl(videoId, now)
            : null,
      };
    });
  }

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
    includePending = false,
    includeRevoked = false
  ): Promise<IEnrolledCourse[]> {
    return this.courseRepo.findEnrolledByUser(
      userId,
      includePending,
      includeRevoked
    );
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

    // The stream link and the recording are content (MDRS-162): a caller who
    // may not read content gets neither key, as for the meeting link. The
    // one exception is a sample session (`isPreview`), whose content the
    // müderris opened to everyone: a PUBLIC recording of it is returned to a
    // locked caller too, and nothing else.
    const sample = detail.weeks
      .flatMap((week) => week.lessons)
      .some((lesson) => lesson.id === sessionId && lesson.isPreview);
    if (!detail.contentLocked) {
      view.liveStreamUrl = liveStreamFor(
        view.status,
        await this.recordingRepo.findLiveStreamUrl(sessionId),
        true
      );
    }
    if (!detail.contentLocked || sample) {
      const { recordings, videoIds } = this.withoutVideoIds(
        await this.recordingRepo.findByLessonIds([sessionId])
      );
      const [stored] = recordings;
      const [shown] = stored
        ? this.signPlayback(
            visibleRecordings(
              [
                {
                  ...stored,
                  weekId: view.weekId,
                  weekNumber: view.weekNumber,
                  weekTitle: view.weekTitle,
                },
              ],
              !detail.contentLocked,
              await this.publicRecordingsAllowed(detail)
            ),
            videoIds,
            now
          )
        : [];
      if (shown) {
        const {
          lessonId: _l,
          weekId: _w,
          weekNumber: _n,
          weekTitle: _t,
          ...own
        } = shown;
        view.recording = own;
      } else {
        view.recording = null;
      }
    }
    return view;
  }

  /**
   * The course's lesson recordings (MDRS-162), newest week first. A caller who
   * may read course content sees them all; anyone else, a visitor included,
   * only those marked PUBLIC. A recording that is still PROCESSING is listed
   * with no link. Built from the filtered detail like `getSession`, so a
   * draft, a hidden course or an archived lesson is not listed or is a 404.
   */
  async listRecordings(
    courseId: string,
    user: AuthenticatedUser | null,
    now: Date = new Date()
  ): Promise<IRecordingView[]> {
    const detail = await this.viewDetail(courseId, user, { audit: false });
    const placed = detail.weeks.flatMap((week) =>
      week.lessons.map((lesson) => ({ week, lesson }))
    );
    const { recordings, videoIds } = this.withoutVideoIds(
      await this.recordingRepo.findByLessonIds(placed.map((p) => p.lesson.id))
    );
    const rows: IRecordingRow[] = recordings.flatMap((rec) => {
      const at = placed.find((p) => p.lesson.id === rec.lessonId);
      return at
        ? [
            {
              ...rec,
              weekId: at.week.id,
              weekNumber: at.week.weekNumber,
              weekTitle: at.week.title,
            },
          ]
        : [];
    });
    return this.signPlayback(
      visibleRecordings(
        rows,
        !detail.contentLocked,
        await this.publicRecordingsAllowed(detail)
      ),
      videoIds,
      now
    );
  }

  /**
   * Whether a PUBLIC recording may be shown to someone who cannot read the
   * course's content: not for a closed course (MDRS-176), and not when the
   * köşk's policy says its recordings are never public (nizam/34).
   */
  private async publicRecordingsAllowed(detail: {
    koskId: string;
    isClosed: boolean;
  }): Promise<boolean> {
    if (detail.isClosed) return false;
    if (await this.platformPolicies.isOn("RECORDINGS_NEVER_PUBLIC")) {
      return false;
    }
    const rule = await this.koskService.findVisibility(detail.koskId);
    return !(rule?.recordingsNeverPublic ?? false);
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
    await this.platformPolicies.assertCourseMayChange(updates);
    const updated = await this.courseRepo.update(
      id,
      withCanonicalTimeZone(updates)
    );
    if (!updated) {
      throw new CourseNotFoundError(id);
    }
    this.invitations.kick();
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
    const stored = await this.getDetail(id, user); // a hidden course is not saved by a müderris
    // The whole-course save carries every field, so only a switch-off of a
    // stored "requires approval" is refused; an unrelated save of a course
    // that never required it must still go through.
    if (stored.requiresApproval) {
      await this.platformPolicies.assertCourseMayChange(data);
    }
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
    this.invitations.kick();
    return this.present(replaced, user, { audit: false });
  }

  /**
   * A müderris row links an account (MDRS-105) — that link is what makes the
   * person MUDERRIS on the course. Each account at most once, and every
   * account this save links anew must be a real one, in the users table or in
   * the realm (MDRS-218: a teacher who has not signed in yet can be named, as
   * in nazir's "Dersi aç"), so that a mistyped id cannot hand the role to
   * whoever signs in under it later.
   */
  private async assertMuderrisLinks(
    current: readonly IMuderris[],
    next: readonly ICreateMuderris[]
  ): Promise<void> {
    const duplicate = duplicateUserId(next);
    if (duplicate) throw new MuderrisDuplicateUserError(duplicate);
    const linking = newlyLinkedUserIds(current, next);
    if (linking.length === 0) return;
    const [unknown] = await this.directory.findUnknownAccounts(linking);
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
    const created = await this.courseRepo.createLesson(courseId, weekId, data);
    this.invitations.kick();
    return created;
  }

  async updateLesson(
    lessonId: string,
    expectedVersion: number,
    data: IUpdateLesson,
    actorId?: string
  ): Promise<ILessonMutation> {
    const before =
      data.scheduledAt === undefined
        ? null
        : await this.notifier.sessionStartBefore(lessonId);
    const updated = await this.courseRepo.updateLesson(
      lessonId,
      expectedVersion,
      data
    );
    await this.notifier.sessionRescheduled(before, updated, actorId);
    this.invitations.kick();
    return updated;
  }

  /** Cancels the session; it keeps its slot in the programme (MDRS-176). */
  async cancelLesson(
    lessonId: string,
    expectedVersion: number,
    reason: string | null,
    actorId: string
  ): Promise<ILessonMutation> {
    const cancelled = await this.courseRepo.cancelLesson(
      lessonId,
      expectedVersion,
      reason,
      actorId
    );
    await this.notifier.sessionCancelled(cancelled, actorId);
    this.invitations.kick();
    return cancelled;
  }

  /**
   * Replaces the muderris list and picks the imam (MDRS-176, nizam/33). The
   * list is never empty and the imam is one of its accounts. Authorization is
   * `ASSIGN_MUDERRIS` on the route.
   */
  async setMuderris(
    courseId: string,
    user: AuthenticatedUser,
    input: {
      version: number;
      muderris: { userId: string; name: string; title?: string }[];
      imamUserId: string;
    }
  ): Promise<{ muderris: IMuderris[]; courseVersion: number }> {
    await this.getDetail(courseId, user);
    const list = input.muderris.map((m) => ({
      ...m,
      userId: m.userId.toLowerCase(),
    }));
    if (list.length === 0) {
      throw new MuderrisListInvalidError(
        "A course keeps at least one muderris"
      );
    }
    const imam = input.imamUserId.toLowerCase();
    if (!list.some((m) => m.userId === imam)) {
      throw new MuderrisListInvalidError(
        "The imam must be one of the listed muderris"
      );
    }
    const current = await this.courseRepo.findMuderris(courseId);
    const asRows = list.map((m) => ({ userId: m.userId, name: m.name }));
    const duplicate = duplicateUserId(asRows);
    if (duplicate) throw new MuderrisDuplicateUserError(duplicate);
    await this.assertMuderrisLinks(current, asRows);
    const saved = await this.courseRepo.setMuderris(
      courseId,
      input.version,
      list,
      imam,
      user.sub
    );
    this.invitations.kick();
    return saved;
  }

  /** Hides the lesson; nothing attached to it is deleted (MDRS-124). */
  async archiveLesson(
    lessonId: string,
    actorId: string | null = null
  ): Promise<ILessonMutation> {
    const archived = await this.courseRepo.archiveLesson(lessonId, actorId);
    this.invitations.kick();
    return archived;
  }

  // ---- weekly pattern → sessions (MDRS-109) ----
  // Authorized by `@Authz(SCOPES.EDIT, …)` on LessonController, like the
  // three writes above.

  /** The sessions a pattern would create; nothing is written. */
  async previewSessionBatch(
    courseId: string,
    pattern: SessionPatternInput
  ): Promise<{ timeZone: string; sessions: IPlannedSession[] }> {
    const courseZone = await this.courseRepo.findTimeZone(courseId);
    if (courseZone === null) throw new CourseNotFoundError(courseId);
    const { timeZone, sessions } = this.expand(pattern, courseZone);
    const numbers = placeInWeeks(
      sessions,
      await this.courseRepo.datedWeeks(courseId, courseZone)
    );
    return {
      timeZone,
      sessions: sessions.map((s, i) => ({ ...s, weekNumber: numbers[i] })),
    };
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
    this.invitations.kick();
    return { ...result, timeZone };
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
    this.invitations.kick();
  }

  async restore(id: string): Promise<void> {
    if (!(await this.courseRepo.restore(id))) {
      throw new CourseNotFoundError(id);
    }
    this.invitations.kick();
  }

  async delete(id: string, actorId: string): Promise<boolean> {
    const removed = await this.courseRepo.purge(id, actorId);
    if (!removed) throw new CourseNotFoundError(id);
    // The invitation rows outlive the sessions: send their CANCELs.
    this.invitations.kick();
    return true;
  }

  async enroll(
    user: AuthenticatedUser,
    courseId: string,
    student: StudentIdentity = {}
  ): Promise<IEnrollment> {
    const userId = user.sub;
    const course = await this.getDetail(courseId, user); // throws if missing
    // A barred talebe does not apply again (MDRS-177), nor one the course
    // team took out: the REVOKED row is their record (MDRS-161).
    await this.banService.assertNotBarred(userId, courseId);
    const held = await this.courseRepo.findEnrollment(userId, courseId);
    if (held?.status === EnrollmentStatus.REVOKED) {
      throw new EnrollmentStateError(courseId, held.status);
    }
    // A course of an unlisted köşk always waits for approval (MDRS-122),
    // whatever its own `requires_approval` says: the link is how the köşk is
    // found, and passing a link on must not hand out seats.
    // The köşk's own policy (MDRS-174, nizam/24) says the same for all its
    // courses and a course's setting cannot loosen it.
    // The platform's own policy (MDRS-181, nizam/19) says it for every köşk.
    // So does a course of a medrese whose policy is "Kayıt her zaman onaylı"
    // (nazir/04), which its own settings cannot reopen.
    const koskRule = await this.koskService.findVisibility(course.koskId);
    const unlisted =
      (koskRule?.isPrivate ?? false) ||
      (koskRule?.alwaysRequireApproval ?? false) ||
      (await this.platformPolicies.isOn("ALWAYS_REQUIRE_APPROVAL"));
    const status =
      course.requiresApproval ||
      unlisted ||
      (await this.courseRepo.forcesApproval(courseId))
        ? EnrollmentStatus.PENDING
        : EnrollmentStatus.ENROLLED;
    const enrollment = await this.courseRepo.enroll(userId, courseId, {
      status,
      studentName: student.name ?? null,
      studentEmail: student.email ?? null,
    });
    this.invitations.kick();
    return enrollment;
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

  /** The talebe the team took out, with the reasons (MDRS-178). */
  findRemovedEnrollments(courseId: string): Promise<IRemovedEnrollment[]> {
    return this.courseRepo.findRemovedEnrollments(courseId);
  }

  /**
   * Approves a request. Approving an active seat again changes nothing; a
   * completion is not turned back into a seat this way (that is
   * `setEnrollmentStatus`), since the team now includes every müderris. A
   * revoked seat is the one way back in: approving it reinstates the talebe
   * (MDRS-161).
   */
  async approveEnrollment(
    courseId: string,
    studentId: string,
    actorId?: string
  ): Promise<IEnrollment> {
    const existing = await this.courseRepo.findEnrollment(studentId, courseId);
    if (!existing) throw new EnrollmentNotFoundError(courseId);
    if (existing.status === EnrollmentStatus.ENROLLED) return existing;
    if (existing.status === EnrollmentStatus.COMPLETED) {
      throw new EnrollmentStateError(courseId, existing.status);
    }
    // Conditional on the status read: a revoked seat is the one that may be
    // approved back, and only while it is still revoked.
    const updated = await this.courseRepo.setEnrollmentStatus(
      studentId,
      courseId,
      EnrollmentStatus.ENROLLED,
      existing.status
    );
    if (!updated) {
      return this.lostRace(courseId, studentId, EnrollmentStatus.ENROLLED);
    }
    await this.notifier.enrollmentApproved(courseId, studentId, actorId);
    this.invitations.kick();
    return updated;
  }

  /**
   * Refuses a pending request. With `actorId` the refusal is audited and the
   * optional `reason` kept with it (nizam/02: "Ret gerekçesi (isteğe bağlı)");
   * without it the row is only deleted, as before.
   */
  async rejectEnrollment(
    courseId: string,
    studentId: string,
    actorId?: string,
    reason?: string
  ): Promise<boolean> {
    // Only pending requests can be rejected; an active seat is taken away
    // with `removeEnrollment`, which needs a reason.
    const existing = await this.courseRepo.findEnrollment(studentId, courseId);
    if (!existing || existing.status !== EnrollmentStatus.PENDING) {
      throw new EnrollmentNotFoundError(courseId);
    }
    // Only while it is still pending: an approval that landed since the read
    // makes it a seat, which is not rejected.
    const removed = actorId
      ? await this.courseRepo.rejectEnrollment({
          userId: studentId,
          courseId,
          actorId,
          reason: reason?.trim() || null,
        })
      : await this.courseRepo.deleteEnrollment(
          studentId,
          courseId,
          EnrollmentStatus.PENDING
        );
    if (!removed) throw new EnrollmentNotFoundError(courseId);
    await this.notifier.enrollmentRejected(
      courseId,
      studentId,
      actorId,
      reason?.trim() || null
    );
    return true;
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
    // A revoked seat is reinstated by approving it, not by completing it.
    if (existing.status === EnrollmentStatus.REVOKED) {
      throw new EnrollmentStateError(courseId, existing.status);
    }
    if (existing.status === status) return existing;
    // Only while it is still in the status read: a removal that landed since
    // turned it REVOKED, and completing or reopening must not undo that.
    const updated = await this.courseRepo.setEnrollmentStatus(
      studentId,
      courseId,
      status,
      existing.status
    );
    if (updated) {
      this.invitations.kick();
      return updated;
    }
    return this.lostRace(courseId, studentId, status);
  }

  /**
   * Takes an enrolled talebe out of the course, with the team's reason
   * (MDRS-105). The enrollment turns REVOKED (MDRS-161) and the reason is kept
   * in `audit_log`. It is not a ban (MDRS-177): the team may approve the seat
   * back, but the talebe does not apply again on their own.
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
    await this.notifier.removedFromCourse(
      courseId,
      studentId,
      actorId,
      reason.trim()
    );
    this.invitations.kick();
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
    if (
      existing.status === EnrollmentStatus.COMPLETED ||
      existing.status === EnrollmentStatus.REVOKED
    ) {
      throw new EnrollmentStateError(courseId, existing.status);
    }
    // Only while it is still in the status read: a removal that landed since
    // turned it REVOKED, and that record is not the talebe's to delete.
    const left = await this.courseRepo.deleteEnrollment(
      userId,
      courseId,
      existing.status
    );
    if (!left) await this.lostRace(courseId, userId);
    this.invitations.kick();
    return true;
  }

  /**
   * The caller withdraws a request still awaiting approval. Only a PENDING
   * row goes: once the team has approved it the seat is theirs, and a stale
   * page that still offers "Başvuruyu geri çek" gets a 404 instead of quietly
   * dropping them from the course (design tedris/08, criterion 5).
   */
  async withdraw(userId: string, courseId: string): Promise<boolean> {
    await this.banService.assertNotBarred(userId, courseId);
    const existing = await this.courseRepo.findEnrollment(userId, courseId);
    if (!existing || existing.status !== EnrollmentStatus.PENDING) {
      throw new EnrollmentNotFoundError(courseId);
    }
    const removed = await this.courseRepo.deleteEnrollment(
      userId,
      courseId,
      EnrollmentStatus.PENDING
    );
    if (!removed) throw new EnrollmentNotFoundError(courseId);
    return true;
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
    if (
      !existing ||
      existing.status === EnrollmentStatus.PENDING ||
      existing.status === EnrollmentStatus.REVOKED
    ) {
      throw new EnrollmentNotFoundError(courseId);
    }
    if (status !== undefined && status !== existing.status) {
      throw new EnrollmentStatusForbiddenError(courseId);
    }
    // Only while it is still in the status read: a removal that landed since
    // turned it REVOKED, and a progress write must not turn it back.
    const updated = await this.courseRepo.updateProgress(
      userId,
      courseId,
      progress,
      existing.status
    );
    return updated ?? (await this.lostRace(courseId, userId));
  }

  /**
   * A write conditional on the status that was read changed nothing: the
   * enrollment moved on, or went, between the read and the write. Says what it
   * is now. When it already is `settledAt` (another approval or completion of
   * the same kind got there first) that row is the answer, as it is when the
   * action is repeated on an enrollment already there.
   */
  private async lostRace(
    courseId: string,
    userId: string,
    settledAt?: EnrollmentStatus
  ): Promise<IEnrollment> {
    const now = await this.courseRepo.findEnrollment(userId, courseId);
    if (!now) throw new EnrollmentNotFoundError(courseId);
    if (settledAt !== undefined && now.status === settledAt) return now;
    throw new EnrollmentStateError(courseId, now.status);
  }
}
