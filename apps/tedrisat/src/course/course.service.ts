import {
  ASSIGNED_ROLES,
  AuthenticatedUser,
  AuthzForbiddenError,
  AuthzService,
  ENTITIES,
  PERMISSIONS,
  type PermissionCode,
  SelfGrantGuard,
} from "@medaris/common";
import { Injectable } from "@nestjs/common";
import {
  ArchiveParentHiddenError,
  ArchiveRestoreLevelError,
} from "../archive/errors/archive-errors";
import {
  actingLevel,
  COURSE_HIDE_LADDER,
  type HideLevel,
} from "../archive/hide-level";
import { UserDirectoryService } from "../assignment/user-directory.service";
import { BanService } from "../ban/ban.service";
import { BunnyStreamClient } from "../bunny-stream/bunny-stream.client";
import { SCOPE_TYPES } from "../database/schema/scope-type.schema";
import { KoskForbiddenError } from "../kosk/errors/kosk-forbidden.error";
import { KoskNotFoundError } from "../kosk/errors/kosk-not-found.error";
import { KoskService } from "../kosk/kosk.service";
import {
  PlatformPolicyLockedError,
  PlatformPolicyService,
} from "../platform-policy/platform-policy.service";
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
  IWeekHide,
} from "./course.repository.interface";
import { CourseNotifier } from "./course-notifier";
import {
  isCourseMuderris,
  isEnrolledTalebe,
  type RosterRead,
  withContent,
  withoutContent,
} from "./domain/course-content";
import { CourseStatus } from "./domain/course-status.enum";
import { EnrollmentStatus } from "./domain/enrollment-status.enum";
import {
  boundAccountIds,
  boundAccountsAfterSave,
  duplicateUserId,
  imamOfNewCourse,
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
import { sessionWorkChanged } from "./domain/session-work";
import { withCanonicalTimeZone } from "./domain/time-zone";
import {
  expandWeeklyPattern,
  IPlannedSession,
  IsoWeekday,
  IWeeklyPattern,
  placeInWeeks,
  WeeklyPatternInvalid,
} from "./domain/weekly-pattern";
import {
  CourseAlreadyHiddenError,
  CourseNotHiddenError,
} from "./errors/course-hide-state.error";
import { CourseNotFoundError } from "./errors/course-not-found.error";
import { CourseVersionConflictError } from "./errors/course-version-conflict.error";
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
    private readonly selfGrant: SelfGrantGuard,
    private readonly bunny: BunnyStreamClient
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
      const kosk = await this.koskService.findById(koskId, null); // throws if köşk is missing
      // Hidden, the köşk is one that does not exist to someone with no token.
      if (kosk.archivedAt !== null) throw new KoskNotFoundError(koskId);
      return this.courseRepo.findSummariesByKosk(koskId, null, false);
    }
    const kosk = await this.koskService.findById(koskId, user.sub); // throws if köşk is missing
    // A hidden köşk closes its courses in every list (MDRS-143): not-found to
    // everyone but the people above it.
    if (
      kosk.archivedAt !== null &&
      !(await this.authz.can(user, { entity: ENTITIES.KOSK, id: koskId }, [
        PERMISSIONS.KOSK_MANAGE,
        PERMISSIONS.PLATFORM_KOSK_EDIT,
      ]))
    ) {
      throw new KoskNotFoundError(koskId);
    }
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
    user: AuthenticatedUser | null,
    /**
     * A read (the page, a session, the recordings, a calendar entry): a hidden
     * course also opens to `course.view_unpublished`, "Taslak ya da gizli dersi
     * gör". A write, the müderris list and an enrolment never take it.
     */
    { read = false }: { read?: boolean } = {}
  ): Promise<ICourseDetail> {
    const course = await this.courseRepo.findDetailById(id, user?.sub ?? null);
    if (!course) {
      throw new CourseNotFoundError(id);
    }
    // A course of a hidden köşk is closed to all but the people above it
    // (MDRS-143). `AuthzGuard` asks the same of every signed-in route; this
    // is for the reads and writes that reach `getDetail` without a guard on
    // the course, and for a caller with no token.
    await this.authz.assertOpen(user, { entity: ENTITIES.COURSE, id });
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
    // which is what the `ARCHIVE` scope says. A read also opens it to whoever
    // was given `course.view_unpublished`, as its sentence says ("Taslak ya da
    // gizli dersi gör"); its müderris holds that code by role and still does
    // not see the course the köşk hid.
    if (
      course.archivedAt !== null &&
      !(await this.authz.can(user, { entity: ENTITIES.COURSE, id }, [
        PERMISSIONS.COURSE_HIDE,
        PERMISSIONS.MADRASAH_COURSE_HIDE,
        PERMISSIONS.PLATFORM_COURSE_HIDE,
      ])) &&
      !(
        read &&
        !isCourseMuderris(course, user.sub) &&
        (await this.authz.can(
          user,
          { entity: ENTITIES.COURSE, id },
          PERMISSIONS.COURSE_VIEW_UNPUBLISHED
        ))
      )
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
      !(await this.authz.can(user, { entity: ENTITIES.COURSE, id }, [
        PERMISSIONS.COURSE_EDIT,
        PERMISSIONS.COURSE_VIEW_UNPUBLISHED,
      ]))
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
    options: { audit: boolean; via?: string } = { audit: true }
  ): Promise<ICourseDetailView> {
    return this.present(
      await this.getDetail(id, user, { read: true }),
      user,
      options
    );
  }

  /**
   * The content rule alone, for a detail the caller is already allowed. A
   * caller with no token (MDRS-122) never reads content: the anonymous
   * codes hold no `course.view_details`, so they get exactly the body a
   * signed-in stranger gets.
   */
  async present(
    course: ICourseDetail,
    user: AuthenticatedUser | null,
    { audit, via }: { audit: boolean; via?: string }
  ): Promise<ICourseDetailView> {
    if (user === null) return withoutContent(course);
    const mayReadContent = await this.authz.can(
      user,
      { entity: ENTITIES.COURSE, id: course.id },
      PERMISSIONS.COURSE_VIEW_DETAILS
    );
    if (!mayReadContent) return withoutContent(course);

    if (audit && (await this.readIsAudited(course, user))) {
      await this.courseRepo.recordContentRead({
        actorId: user.sub,
        courseId: course.id,
        details: {
          title: course.title,
          ...(via ? { via } : {}),
          // Who read it: the başnazım through the realm bypass, anyone else
          // through the permission named here (a köşk nazımı's course
          // permissions, a başmüderris's, a grant).
          systemAdmin: this.authz.isSystemAdmin(user),
          permission: PERMISSIONS.COURSE_VIEW_DETAILS,
        },
      });
    }
    return withContent(course);
  }

  /**
   * Whether this content read goes on the record: everyone but the course's
   * müderrisler and its enrolled talebe. An enrolled talebe who also holds a
   * role in the course's chain (a köşk nazımı, a başmüderris, a nazır, the
   * başnazım who enrolled themselves) is not off the record: enrolling is not
   * a way out of the audit (review L3).
   */
  private async readIsAudited(
    course: ICourseDetail,
    user: AuthenticatedUser
  ): Promise<boolean> {
    return this.readerIsAudited(course.id, user, {
      muderris: isCourseMuderris(course, user.sub),
      enrolled: isEnrolledTalebe(course, user.sub),
    });
  }

  /** The rule behind `readIsAudited`, for a reader whose standing is already known. */
  private async readerIsAudited(
    courseId: string,
    user: AuthenticatedUser,
    standing: { muderris: boolean; enrolled: boolean }
  ): Promise<boolean> {
    if (standing.muderris) return false;
    if (!standing.enrolled) return true;
    if (this.authz.isSystemAdmin(user)) return true;
    return this.courseRepo.holdsRoleOnCourse(user.sub, courseId);
  }

  /**
   * A read of a course's roster goes on the record like a read of its content
   * (MDRS-135; owner, d-1003-09 "Kayda alınsın"): the talebe list carries names
   * and e-mail addresses, and its numbers, its removals and its waiting requests
   * are the same list summarised. The rule is the content read's: the course's
   * müderrisler and its enrolled talebe are not written; everyone else is, the
   * başnazım through the realm bypass included, and an enrolled talebe who also
   * holds a role in the course's chain.
   *
   * Call it after the caller is authorized and before the data is read. The row
   * is awaited, so a write that fails fails the read instead of leaving it
   * unrecorded.
   */
  async auditRosterRead(
    courseId: string,
    user: AuthenticatedUser,
    via: RosterRead
  ): Promise<void> {
    const [muderris, enrollment] = await Promise.all([
      this.courseRepo.isMuderris(courseId, user.sub),
      this.courseRepo.findEnrollment(user.sub, courseId),
    ]);
    const audited = await this.readerIsAudited(courseId, user, {
      muderris,
      enrolled:
        enrollment?.status === EnrollmentStatus.ENROLLED ||
        enrollment?.status === EnrollmentStatus.COMPLETED,
    });
    if (!audited) return;
    await this.courseRepo.recordRosterRead({
      actorId: user.sub,
      entity: "course",
      entityId: courseId,
      details: {
        via,
        systemAdmin: this.authz.isSystemAdmin(user),
        permission: PERMISSIONS.COURSE_STAFF_READ,
      },
    });
  }

  /**
   * The course a session belongs to, for a caller who may see that course
   * (`getDetail`: a hidden köşk, a hidden course, a draft). A session that is
   * not there and one in a course the caller may not see are one answer,
   * LESSON_NOT_FOUND, as on the session's calendar entry (`getScheduledLesson`),
   * so a hidden course is not told apart from a session that never existed.
   * For what a talebe writes on a session (MDRS-150): archived sessions count,
   * like `findLessonCourseId`.
   */
  async findVisibleLessonCourse(
    lessonId: string,
    user: AuthenticatedUser
  ): Promise<string> {
    const courseId = await this.courseRepo.findLessonCourseId(lessonId);
    if (!courseId) throw new LessonNotFoundError(lessonId);
    try {
      await this.getDetail(courseId, user, { read: true });
    } catch (error) {
      if (error instanceof CourseNotFoundError) {
        throw new LessonNotFoundError(lessonId);
      }
      throw error;
    }
    return courseId;
  }

  /**
   * Whether the person may write on the course as a talebe (a note, a
   * question; MDRS-150): an ENROLLED or COMPLETED enrollment that no ban bars,
   * and the course's content open to them. The enrollment is what the engine
   * cannot say, because no catalogue code means "enrolled and not staff": the
   * başnazım passes every decision and the course team holds
   * `course.view_details` without being talebe. The open content is the
   * engine's: a passive scope closes it to the enrolled talebe too, and a
   * pending, removed or barred talebe never held it.
   */
  async mayWriteAsTalebe(
    user: AuthenticatedUser,
    courseId: string
  ): Promise<boolean> {
    const enrollment = await this.courseRepo.findEnrollment(user.sub, courseId);
    const active =
      enrollment?.status === EnrollmentStatus.ENROLLED ||
      enrollment?.status === EnrollmentStatus.COMPLETED;
    return (
      active &&
      !(await this.banService.isBarred(user.sub, courseId)) &&
      (await this.contentIsOpen(user, courseId))
    );
  }

  /**
   * Whether the person may still reach what they wrote on the course as a
   * talebe (MDRS-150): read it and delete it. The content is open to them, or
   * no scope closes the course. A talebe who was removed or barred holds no
   * content code for a passive scope to take away, so the scope itself is
   * asked: an open course lets them reach their own writing, a passive one
   * closes it like the rest of its content.
   */
  async mayReachOwnWriting(
    user: AuthenticatedUser,
    courseId: string
  ): Promise<boolean> {
    if (await this.contentIsOpen(user, courseId)) return true;
    return (await this.courseRepo.findPassiveScope(courseId)) === null;
  }

  private contentIsOpen(
    user: AuthenticatedUser,
    courseId: string
  ): Promise<boolean> {
    return this.authz.can(
      user,
      { entity: ENTITIES.COURSE, id: courseId },
      PERMISSIONS.COURSE_VIEW_DETAILS
    );
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
      course = await this.getDetail(courseId, user, { read: true });
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
    // The recording links are course content: a reader who is neither a
    // müderris nor an enrolled talebe goes on the record like a page read
    // (review M6).
    const detail = await this.viewDetail(courseId, user, {
      audit: true,
      via: "recordings",
    });
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
  // Authorization is the engine's, on CourseController: `course.edit` for the
  // course's fields and syllabus — the köşk nazımı and the course's
  // müderrisler — and, inside a whole-course save, `course.open_standalone`
  // (or the medrese's `madrasah.muderris_manage`) for the müderris list, which
  // a müderris does not hold. The `assertCourseOwner` that narrowed every write
  // to the köşk manager is gone.

  /**
   * Opens a course of the köşk's own together with its müderrisler (MDRS-136).
   * Who may is the route's `course.open_standalone` on the köşk, the köşk
   * nazımı's by default and the başnazım's through the realm bypass; no role
   * is asked again here, so that the başnazım is not turned away by a check on
   * who manages the köşk.
   */
  async create(
    koskId: string,
    author: AuthenticatedUser,
    course: Omit<ICreateCourse, "koskId" | "authorId">
  ): Promise<ICourseDetailView> {
    const authorId = author.sub;
    if (!(await this.koskService.exists(koskId))) {
      throw new KoskNotFoundError(koskId);
    }
    const muderris = course.muderris ?? [];
    const imamUserId = imamOfNewCourse(muderris, course.imamUserId);
    await this.assertMuderrisLinks([], muderris);
    const created = await this.courseRepo.create({
      ...withCanonicalTimeZone(course),
      koskId,
      authorId,
      imamUserId,
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
    const stored = await this.getDetail(id, user);
    // A PATCH names the fields it means to set: a switch-off it carries is
    // refused while a policy holds the rule on, even when the stored value is
    // already off (a policy that came on later), as the platform policy always
    // did.
    await this.assertMayChangeSettings(id, user, stored, updates, true);
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
   * The fields of a save that need more than `course.edit` (MDRS-135, review
   * H3): publishing or unpublishing needs `course.publish`; the enrollment and
   * openness settings need `course.settings`; switching "requires approval" or
   * "closed" off needs the ability a policy on the köşk, the medrese or the
   * platform may have closed (`setting.approval_off`, `setting.course_open`).
   * The engine decides, so a grant from an authority above the policy opens
   * the ability for the person it was made to, and no other.
   *
   * A ability a policy closes answers 409 PLATFORM_POLICY_LOCKED, as the
   * platform policy always did; a missing `course.publish` or `course.settings`
   * is a plain 403.
   */
  private async assertMayChangeSettings(
    id: string,
    user: AuthenticatedUser,
    stored: Pick<ICourse, "status" | "requiresApproval" | "isClosed">,
    change: {
      status?: CourseStatus;
      requiresApproval?: boolean;
      isClosed?: boolean;
    },
    /** A PATCH: a field it carries is a change. A whole-course save: only a field that differs from what is stored. */
    carried: boolean
  ): Promise<void> {
    const resource = { entity: ENTITIES.COURSE, id };
    const needs: PermissionCode[] = [];
    if (change.status !== undefined && change.status !== stored.status) {
      needs.push(PERMISSIONS.COURSE_PUBLISH);
    }
    const approval =
      change.requiresApproval !== undefined &&
      (carried || change.requiresApproval !== stored.requiresApproval);
    const closed =
      change.isClosed !== undefined &&
      (carried || change.isClosed !== stored.isClosed);
    if (approval || closed) needs.push(PERMISSIONS.COURSE_SETTINGS);
    for (const code of needs) {
      if (!(await this.authz.can(user, resource, code))) {
        throw new AuthzForbiddenError(
          `This change needs the permission ${code}`,
          { courseId: id, permission: code }
        );
      }
    }
    if (approval && change.requiresApproval === false) {
      if (
        !(await this.authz.can(
          user,
          resource,
          PERMISSIONS.SETTING_APPROVAL_OFF
        ))
      ) {
        throw new PlatformPolicyLockedError("ALWAYS_REQUIRE_APPROVAL");
      }
    }
    if (closed && change.isClosed === false) {
      if (
        !(await this.authz.can(user, resource, PERMISSIONS.SETTING_COURSE_OPEN))
      ) {
        throw new PlatformPolicyLockedError("CLOSED_COURSE_REQUIRED");
      }
    }
  }

  /**
   * The whole-course save. A caller with `course.edit` but not the permission
   * to choose müderrisler — a müderris — may save everything but the müderris
   * list: if the list in
   * the payload differs from the stored one in any way the save would write,
   * the save is refused whole with 403 before anything is written.
   *
   * Every comparison here (the müderris list, the sessions, the policy
   * settings) reads the course outside the save's transaction, so the save is
   * held to the version those reads saw: the editor's own when it sends one
   * (409, MDRS-95), otherwise the one read here. A change by someone else in
   * between — a session added, a list changed — is then a 409 under the row
   * lock instead of being hidden or written back by a caller who was let
   * through because it was not there yet.
   */
  async replace(
    id: string,
    user: AuthenticatedUser,
    data: IReplaceCourse
  ): Promise<ICourseDetailView> {
    const stored = await this.getDetail(id, user); // a hidden course is not saved by a müderris
    // A stale editor is told to reload (409) before anything is compared with
    // what it sends: its sessions or its müderris list differ from the stored
    // ones because someone saved in between, not because it asks for work it
    // may not do. The save's own conditional UPDATE still decides under the
    // row lock.
    if (data.version !== undefined && data.version !== stored.version) {
      throw new CourseVersionConflictError(id, data.version);
    }
    // The whole-course save carries every field, so only a field that differs
    // from what is stored is a change; an unrelated save of a course must still
    // go through.
    await this.assertMayChangeSettings(id, user, stored, data, false);
    await this.assertMayChangeSessions(id, user, stored, data);
    // A save that leaves `muderris` out means "the team as it is", not "no
    // team": it used to empty the course and leave it with nobody (MDRS-136).
    const next = data.muderris;
    const current = await this.courseRepo.findMuderris(id);
    if (next !== undefined) {
      if (
        muderrisListChanged(current, next) &&
        !(await this.authz.can(user, { entity: ENTITIES.COURSE, id }, [
          PERMISSIONS.COURSE_OPEN_STANDALONE,
          PERMISSIONS.MADRASAH_MUDERRIS_MANAGE,
        ]))
      ) {
        throw new MuderrisAssignmentForbiddenError(id);
      }
      // The accounts this save seats: the ones it links anew. One already on
      // the list keeps the seat it has, none if it lapsed or was revoked
      // (`syncMuderrisAssignments`), so the list unchanged seats nobody.
      await this.assertNotNamingSelf(
        user,
        stored,
        newlyLinkedUserIds(current, next),
        "course.replace.muderris"
      );
      // Owner decision d-1004-13: a course never loses its last müderris by
      // accident. Making it passive on purpose is MDRS-201's flow.
      if (
        boundAccountIds(current).length > 0 &&
        boundAccountsAfterSave(current, next).length === 0
      ) {
        throw new MuderrisListInvalidError(
          "A course keeps at least one müderris who has an account"
        );
      }
      await this.assertMuderrisLinks(current, next);
    }
    const replaced = await this.courseRepo.replace(
      id,
      user.sub,
      withCanonicalTimeZone({ ...data, version: stored.version }),
      // The weeks and sessions the save drops are hidden at the saver's level.
      await this.courseLevel(user, id)
    );
    return this.present(replaced, user, { audit: false });
  }

  /**
   * The sessions inside a whole-course save (MDRS-135): adding or dropping a
   * session, or changing a kept one's time, meeting link, agenda or preview
   * flag, needs `session.manage`, exactly as the session routes on
   * LessonController do. A caller holding only `course.edit` keeps the
   * titles, texts, order and weeks, so a save that leaves every session as
   * stored still goes through. Refused whole with 403 before anything is
   * written.
   */
  private async assertMayChangeSessions(
    id: string,
    user: AuthenticatedUser,
    stored: Pick<ICourseDetail, "weeks">,
    data: Pick<IReplaceCourse, "weeks">
  ): Promise<void> {
    if (!sessionWorkChanged(stored.weeks, data.weeks ?? [])) return;
    const resource = { entity: ENTITIES.COURSE, id };
    if (await this.authz.can(user, resource, PERMISSIONS.SESSION_MANAGE)) {
      return;
    }
    throw new AuthzForbiddenError(
      `This change needs the permission ${PERMISSIONS.SESSION_MANAGE}`,
      { courseId: id, permission: PERMISSIONS.SESSION_MANAGE }
    );
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

  /**
   * Naming yourself müderris is for someone who already holds every course
   * permission here (the köşk nazımı, the medrese's başmüderris), not for a
   * grantee of `madrasah.muderris_manage`, as on the medrese's own route.
   *
   * A medrese course is asked in its medrese, exactly as that route asks
   * (`PUT /madrasahs/:id/courses/:courseId/muderrises`), so the two answer
   * alike. On the course itself a passive course would close the content codes
   * to its başmüderris, though naming a müderris is what ends that state.
   */
  private assertNotNamingSelf(
    user: AuthenticatedUser,
    course: Pick<ICourseDetail, "id" | "madrasah">,
    userIds: readonly string[],
    action: string
  ): Promise<void> {
    return this.selfGrant.assertNotSelf(
      user,
      userIds,
      { entity: ENTITIES.COURSE, id: course.id },
      {
        role: ASSIGNED_ROLES.MUDERRIS,
        heldAt: course.madrasah
          ? { entity: ENTITIES.MADRASAH, id: course.madrasah.id }
          : undefined,
      },
      action
    );
  }

  // ---- session-level writes (MDRS-95) ----
  // Authorization for these is `@Authz(PERMISSIONS.SESSION_MANAGE, …)` on
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
    return cancelled;
  }

  /**
   * Replaces the muderris list and picks the imam (MDRS-176, nizam/33). The
   * list is never empty and the imam is one of its accounts. Authorization is
   * `course.open_standalone` (or `madrasah.muderris_manage`) on the route.
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
    const course = await this.getDetail(courseId, user);
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
    // Only an account this save seats is asked about: one listed with no
    // MUDERRIS seat here (`syncMuderrisAssignments` seats it, a lapsed one
    // again). Keeping yourself on the list of a course you already teach
    // seats nobody, as on `PUT /courses/:id`.
    const me = user.sub.toLowerCase();
    const keepsOwnSeat =
      list.some((m) => m.userId === me) &&
      (await this.courseRepo.isMuderris(courseId, me));
    await this.assertNotNamingSelf(
      user,
      course,
      list.map((m) => m.userId).filter((id) => !keepsOwnSeat || id !== me),
      "course.muderris.set"
    );
    const current = await this.courseRepo.findMuderris(courseId);
    const asRows = list.map((m) => ({ userId: m.userId, name: m.name }));
    const duplicate = duplicateUserId(asRows);
    if (duplicate) throw new MuderrisDuplicateUserError(duplicate);
    await this.assertMuderrisLinks(current, asRows);
    return this.courseRepo.setMuderris(
      courseId,
      input.version,
      list,
      imam,
      user.sub
    );
  }

  /** Hides the lesson; nothing attached to it is deleted (MDRS-124). */
  async archiveLesson(
    lessonId: string,
    user: AuthenticatedUser
  ): Promise<ILessonMutation> {
    const courseId = await this.courseRepo.findLessonCourseId(lessonId);
    const level = courseId
      ? await this.courseLevel(user, courseId)
      : SCOPE_TYPES.COURSE;
    return this.courseRepo.archiveLesson(lessonId, user.sub, level);
  }

  /**
   * Hides a week with its live sessions, at the level the caller acts at
   * (MDRS-143). Authorization is `week.hide` on the route.
   */
  async archiveWeek(
    courseId: string,
    weekId: string,
    user: AuthenticatedUser
  ): Promise<IWeekHide> {
    return this.courseRepo.archiveWeek(
      courseId,
      weekId,
      user.sub,
      await this.courseLevel(user, courseId)
    );
  }

  // ---- weekly pattern → sessions (MDRS-109) ----
  // Authorized by `@Authz(SESSION_MANAGE, …)` on LessonController, like the
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
  // Authorization is `@Authz` on CourseController: `course.hide`,
  // `madrasah.course_hide` or `platform.course_hide` for hide and restore,
  // `DELETE` (SYSTEM_ADMIN only — it is on no role row) for the real delete.
  // Nothing is re-checked here.

  /**
   * The level the caller hides and restores a course at (`COURSE_HIDE_LADDER`):
   * platform management holding `platform.course_hide` and the başnazım as the
   * platform, the köşk's nazımı (`course.hide`) as the köşk, a başmüderris or a
   * nazır given `madrasah.course_hide` as the medrese; whoever merely runs the
   * course acts at the course.
   */
  private courseLevel(
    user: AuthenticatedUser,
    courseId: string
  ): Promise<HideLevel> {
    return actingLevel(
      this.authz,
      user,
      { entity: ENTITIES.COURSE, id: courseId },
      COURSE_HIDE_LADDER,
      SCOPE_TYPES.COURSE
    );
  }

  /** Hides the course at the caller's level; a hidden one is refused (409), not echoed back. */
  async archive(id: string, user: AuthenticatedUser): Promise<void> {
    const level = await this.courseLevel(user, id);
    const outcome = await this.courseRepo.archive(id, user.sub, level);
    if (outcome === "not-found") throw new CourseNotFoundError(id);
    if (outcome === "already-hidden") throw new CourseAlreadyHiddenError(id);
  }

  /**
   * Brings a hidden course back, by the level that hid it or one above it
   * (MDRS-135, the ban rule): a medrese's başmüderris cannot bring back what the
   * köşk's nazımı hid, and the other way round it can be done. A course hidden
   * before the level was recorded counts as hidden at the lowest level that
   * could have hidden it. A course whose köşk or medrese is still hidden comes
   * back with them (409 ARCHIVE_PARENT_HIDDEN), as on the archive route; a shown
   * course is refused (409), not echoed back. All of it is decided under the
   * row lock.
   */
  async restore(id: string, user: AuthenticatedUser): Promise<void> {
    const restorer = await this.courseLevel(user, id);
    const outcome = await this.courseRepo.restore(id, restorer, user.sub);
    switch (outcome.status) {
      case "not-found":
        throw new CourseNotFoundError(id);
      case "not-hidden":
        throw new CourseNotHiddenError(id);
      case "level":
        throw new ArchiveRestoreLevelError(outcome.hiddenAt, restorer);
      case "parent-hidden":
        throw new ArchiveParentHiddenError("course", id);
      default:
        return;
    }
  }

  /**
   * The course as a hide or a restore leaves it, for the caller who did it.
   * The read rules of `viewDetail` are not asked again: whoever may hide a
   * course gets the answer to what they did, a draft included (platform
   * management holding `platform.course_hide` and a nazır holding
   * `madrasah.course_hide` may edit neither). The content rule still is: the
   * content goes to who may read it and is on the record like any read, since
   * a hide and a restore that hand it out are reads too.
   */
  async viewAfterHide(
    id: string,
    user: AuthenticatedUser,
    via: "course.hide" | "course.restore"
  ): Promise<ICourseDetailView> {
    const course = await this.courseRepo.findDetailById(id, user.sub);
    if (!course) throw new CourseNotFoundError(id);
    return this.present(course, user, { audit: true, via });
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
    return this.courseRepo.enroll(userId, courseId, {
      status,
      studentName: student.name ?? null,
      studentEmail: student.email ?? null,
    });
  }

  async findPendingEnrollments(
    koskId: string,
    user: AuthenticatedUser
  ): Promise<IPendingEnrollment[]> {
    await this.koskService.assertManager(koskId, user.sub); // köşk managers only
    // The köşk-wide list belongs to no one course, so it has no müderris and
    // no enrolled talebe to leave out: every read of it is written.
    await this.courseRepo.recordRosterRead({
      actorId: user.sub,
      entity: "kosk",
      entityId: koskId,
      details: {
        via: "pending" satisfies RosterRead,
        systemAdmin: this.authz.isSystemAdmin(user),
        permission: PERMISSIONS.COURSE_MANAGE_ALL,
      },
    });
    return this.courseRepo.findPendingByKosk(koskId);
  }

  // ---- the course team's enrollment actions (MDRS-105) ----
  // Authorization is `@Authz(ENROLLMENT_DECIDE, …)` on
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
    if (updated) return updated;
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
