import type { HideLevel } from "../archive/hide-level";
import type { CourseRestoreOutcome } from "../archive/restore-course";
import type { IPurgeCounts } from "./course-purge";
import { CourseLevel } from "./domain/course-level.enum";
import { CourseStatus } from "./domain/course-status.enum";
import { EnrollmentStatus } from "./domain/enrollment-status.enum";
import { LessonType } from "./domain/lesson-type.enum";

/** One step of a live lesson's müzakere akışı (agenda). */
export interface IAgendaStep {
  time: string;
  title: string;
}

export interface ILesson {
  id: string;
  weekId: string;
  title: string;
  type: LessonType;
  /** Length in minutes (MDRS-110); null when not set. */
  durationMinutes: number | null;
  kaynak: string | null;
  scheduledAt: Date | null;
  meetingUrl: string | null;
  agenda: IAgendaStep[] | null;
  isPreview: boolean;
  orderIndex: number;
  /** When the session was cancelled (MDRS-158); null while it stands. */
  cancelledAt: Date | null;
  /** Why it was cancelled — course content, like the meeting link. */
  cancelReason: string | null;
  /** The session that makes up for a cancelled one, if there is one. */
  replacementLessonId: string | null;
}

export interface IWeek {
  id: string;
  courseId: string;
  weekNumber: number;
  title: string;
  summary: string | null;
  orderIndex: number;
  lessons: ILesson[];
}

export interface IMuderris {
  id: string;
  courseId: string;
  userId: string | null;
  name: string;
  title: string | null;
  bio: string | null;
  avatarHue: number;
  orderIndex: number;
  /** Whether the account is the course's imam (MDRS-133). */
  isImam: boolean;
}

export interface IResource {
  id: string;
  courseId: string;
  name: string;
  meta: string | null;
  type: string | null;
  url: string | null;
  orderIndex: number;
}

export interface ICourse {
  id: string;
  koskId: string;
  authorId: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  category: string | null;
  level: CourseLevel;
  language: string | null;
  coverHue: number;
  durationWeeks: number;
  status: CourseStatus;
  grantsCertificate: boolean;
  requiresApproval: boolean;
  /** Content and recordings never public (MDRS-176). */
  isClosed: boolean;
  /** The word printed on the cover; null when none (MDRS-176). */
  coverLabel: string | null;
  /** IANA zone the sessions are authored in (MDRS-110). */
  timeZone: string;
  /** Optimistic-concurrency token; bumped by every course or syllabus write. */
  version: number;
  /** When the köşk manager hid the course (MDRS-124); null while live. */
  archivedAt: Date | null;
  /** Who hid it; null while live. */
  archivedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICourseDetail extends ICourse {
  /** The medrese that opened the course, or null; read by `findDetailById` (MDRS-161). */
  madrasah?: { id: string; name: string } | null;
  weeks: IWeek[];
  muderris: IMuderris[];
  resources: IResource[];
  enrollment: IEnrollment | null;
}

/**
 * The lesson fields that are course content rather than programme (MDRS-103):
 * only a caller holding `VIEW_DETAILS` on the course receives them. Everyone
 * else gets the lesson without these keys — absent, not null, so no body
 * sent to a non-enrolled caller names them at all.
 */
export type LessonContentField =
  | "kaynak"
  | "meetingUrl"
  | "agenda"
  | "cancelReason";

/** A lesson as a response carries it: the content fields may be absent. */
export type ILessonView = Omit<ILesson, LessonContentField> &
  Partial<Pick<ILesson, LessonContentField>>;

/** A resource as a response carries it: `url` is content (MDRS-103). */
export type IResourceView = Omit<IResource, "url"> &
  Partial<Pick<IResource, "url">>;

export type IWeekView = Omit<IWeek, "lessons"> & { lessons: ILessonView[] };

/**
 * A course detail as it leaves the API (MDRS-103). `contentLocked` is true
 * when the caller lacks `VIEW_DETAILS` and the content fields were removed;
 * a client renders the locked state (tedris B8) from it rather than guessing
 * from the enrollment.
 */
export type ICourseDetailView = Omit<ICourseDetail, "weeks" | "resources"> & {
  weeks: IWeekView[];
  resources: IResourceView[];
  contentLocked: boolean;
};

export interface ICourseSummary extends ICourse {
  weekCount: number;
  lessonCount: number;
  resourceCount: number;
  muderris: (IMuderris & { isImam: boolean })[];
  enrollment: IEnrollment | null;
  /** The medrese the course is opened by, or null (MDRS-159). */
  madrasah: { id: string; name: string } | null;
  /** The earliest standing session still ahead, or null (MDRS-159). */
  nextSessionAt: Date | null;
}

export interface IEnrolledCourse extends ICourse {
  koskName: string;
  /** The medrese that opened the course, or null (MDRS-159). */
  madrasahName: string | null;
  weekCount: number;
  lessonCount: number;
  muderris: (IMuderris & { isImam: boolean })[];
  /** The next standing session, or null when none is scheduled ahead. */
  nextSession: { at: Date; weekNumber: number } | null;
  enrollment: IEnrollment & { completedAt: Date | null };
}

export interface IEnrollment {
  userId: string;
  courseId: string;
  studentName: string | null;
  studentEmail: string | null;
  progress: number;
  status: EnrollmentStatus;
  createdAt: Date;
  updatedAt: Date;
}

/** An enrollment on the team's roster, with the ban that bars the talebe, if any (MDRS-177). */
export interface IRosterEnrollment extends IEnrollment {
  ban: { id: string; scope: "COURSE" | "KOSK" } | null;
}

/** A talebe the team took out of a course, from the audit log (MDRS-178). */
export interface IRemovedEnrollment {
  userId: string;
  name: string | null;
  email: string | null;
  reason: string;
  progress: number;
  removedAt: Date;
  removedBy: { id: string; name: string | null };
}

export interface IPendingEnrollment extends IEnrollment {
  courseTitle: string;
}

/** What the nazır portal's course menu badges count (MDRS-183). */
export interface ICourseBadgeCounts {
  /** Live sessions still ahead, not cancelled, that have no meeting link. */
  missingMeetingLinks: number;
  /** PENDING enrollments of the course. */
  pendingApplications: number;
}

/** A pending request the course team refused (MDRS-182, nizam/02). */
export interface IRejectEnrollment {
  userId: string;
  courseId: string;
  /** Who refused it: a köşk manager, a müderris or SYSTEM_ADMIN. */
  actorId: string;
  /** The team's reason, when it gave one; kept in `audit_log`. */
  reason: string | null;
}

/** A talebe taken out of a course by its team (MDRS-105). */
export interface IRemoveEnrollment {
  userId: string;
  courseId: string;
  /** Who removed them — a köşk manager, a müderris or SYSTEM_ADMIN. */
  actorId: string;
  /** The team's reason, as typed; kept in `audit_log`. */
  reason: string;
  /** Only an enrollment still in this state is removed. */
  expectedStatus: EnrollmentStatus;
}

export interface IEnrollOptions {
  status?: EnrollmentStatus;
  studentName?: string | null;
  studentEmail?: string | null;
}

export interface ICreateLesson {
  id?: string;
  title: string;
  type: LessonType;
  durationMinutes?: number;
  kaynak?: string;
  scheduledAt?: Date;
  meetingUrl?: string;
  agenda?: IAgendaStep[];
  isPreview?: boolean;
}

export interface ICreateWeek {
  id?: string;
  weekNumber: number;
  title: string;
  summary?: string;
  lessons: ICreateLesson[];
}

export interface ICreateMuderris {
  id?: string;
  userId?: string;
  name: string;
  title?: string;
  bio?: string;
  avatarHue?: number;
}

export interface ICreateResource {
  id?: string;
  name: string;
  meta?: string;
  type?: string;
  url?: string;
}

export interface ICreateCourse {
  koskId: string;
  authorId: string;
  title: string;
  subtitle?: string;
  description?: string;
  category?: string;
  level?: CourseLevel;
  language?: string;
  coverHue?: number;
  durationWeeks?: number;
  status?: CourseStatus;
  grantsCertificate?: boolean;
  requiresApproval?: boolean;
  isClosed?: boolean;
  coverLabel?: string | null;
  timeZone?: string;
  weeks?: ICreateWeek[];
  muderris?: ICreateMuderris[];
  /** The imam, one of the accounts in `muderris` (MDRS-136); the first listed when absent. */
  imamUserId?: string;
  resources?: ICreateResource[];
}

export interface IUpdateCourse {
  title?: string;
  subtitle?: string;
  description?: string;
  category?: string;
  level?: CourseLevel;
  language?: string;
  coverHue?: number;
  durationWeeks?: number;
  status?: CourseStatus;
  grantsCertificate?: boolean;
  requiresApproval?: boolean;
  isClosed?: boolean;
  coverLabel?: string | null;
  timeZone?: string;
}

export type IReplaceCourse = Omit<
  ICreateCourse,
  "koskId" | "authorId" | "imamUserId"
> & {
  /**
   * The course `version` the editor loaded. When given, the replace is
   * refused with a conflict if the course has been written since.
   */
  version?: number;
};

/** Fields a single-lesson PATCH may change; `weekId` moves the lesson. */
export interface IUpdateLesson {
  weekId?: string;
  title?: string;
  type?: LessonType;
  /** null clears it. */
  durationMinutes?: number | null;
  kaynak?: string;
  scheduledAt?: Date;
  meetingUrl?: string;
  agenda?: IAgendaStep[];
  isPreview?: boolean;
  orderIndex?: number;
}

/** A lesson as returned by the session-level endpoints, with the course
 *  version the write produced so the client can send it with its next one. */
export interface ILessonMutation extends ILesson {
  courseVersion: number;
}

/** What hiding a week produced: the course version, and how many live sessions went with it (MDRS-143). */
export interface IWeekHide {
  id: string;
  courseVersion: number;
  hiddenSessions: number;
}

/** One session of a weekly-pattern batch (MDRS-109), already expanded. */
export interface IBatchSession {
  scheduledAt: Date;
  /** Its calendar date in the pattern's zone, "YYYY-MM-DD". */
  localDate: string;
  /**
   * The week the pattern numbers it into; the repository places it against
   * the course's own weeks by date (nizam/55) and creates "Hafta N" when
   * that week is missing.
   */
  weekNumber: number;
}

export interface ICreateSessionBatch {
  title: string;
  durationMinutes: number;
  /** Set on the first session only. */
  meetingUrl?: string;
  /**
   * Expands the pattern against the course's zone. Called inside the write
   * transaction, after the course row is locked, so a concurrent change of
   * the zone cannot slip between the expansion and the insert.
   */
  plan: (courseTimeZone: string) => IBatchSession[];
}

export interface ISessionBatchWeek {
  id: string;
  weekNumber: number;
  title: string;
  /** Whether this batch created the week. */
  created: boolean;
}

export interface ISessionBatchResult {
  courseVersion: number;
  weeks: ISessionBatchWeek[];
  /** In date order. */
  lessons: (ILesson & { weekNumber: number })[];
}

/** A course as it appears in a caller's role summary (`GET /me`, MDRS-104). */
export interface ICourseRef {
  id: string;
  title: string;
  koskId: string;
}

export interface ICourseRepository {
  /** `userId` null is a caller with no token (MDRS-122): no enrollment. */
  findSummariesByKosk(
    koskId: string,
    userId: string | null,
    includeDrafts: boolean,
    archived?: boolean
  ): Promise<ICourseSummary[]>;
  /** `userId` null is a caller with no token (MDRS-122): no enrollment. */
  findDetailById(
    id: string,
    userId: string | null
  ): Promise<ICourseDetail | null>;
  findEnrolledByUser(
    userId: string,
    includePending?: boolean,
    includeRevoked?: boolean
  ): Promise<IEnrolledCourse[]>;
  create(course: ICreateCourse): Promise<ICourseDetail>;
  findKoskId(id: string): Promise<string | null>;
  /**
   * Whether the course's medrese makes every enrollment wait for approval
   * ("Kayıt her zaman onaylı", nazir/04). False for a course in no medrese.
   */
  forcesApproval(id: string): Promise<boolean>;
  /** The user holding the course's imam grant, or null (MDRS-133). */
  findImamUserId(courseId: string): Promise<string | null>;
  /** Status, hidden, and the köşk's `is_private`; null for no course (MDRS-122). */
  findPublicVisibility(id: string): Promise<{
    status: CourseStatus;
    archived: boolean;
    koskIsPrivate: boolean;
    koskHidden: boolean;
  } | null>;
  update(id: string, updates: IUpdateCourse): Promise<ICourse | null>;
  replace(
    id: string,
    userId: string,
    data: IReplaceCourse,
    /** The level the saver acts at, recorded on the weeks and sessions the save hides. */
    level?: HideLevel
  ): Promise<ICourseDetail>;
  archive(
    id: string,
    userId: string,
    level: HideLevel
  ): Promise<"archived" | "already-hidden" | "not-found">;
  /** The kademe and the hidden parent decided under the row lock (`restoreCourseIn`). */
  restore(
    id: string,
    restorer: HideLevel,
    actorId: string
  ): Promise<CourseRestoreOutcome>;
  /** Whether the course's köşk is hidden, which closes the course (MDRS-143); null for no such course. */
  findHideState(id: string): Promise<{ koskArchivedAt: Date | null } | null>;
  /** SYSTEM_ADMIN's delete: the course, its children and an audit entry. */
  purge(id: string, actorId: string): Promise<IPurgeCounts | null>;
  /** The course a lesson belongs to, archived or not; null if no such lesson. */
  findLessonCourseId(lessonId: string): Promise<string | null>;
  createLesson(
    courseId: string,
    weekId: string,
    data: ICreateLesson
  ): Promise<ILessonMutation>;
  updateLesson(
    lessonId: string,
    expectedVersion: number,
    data: IUpdateLesson
  ): Promise<ILessonMutation>;
  archiveLesson(
    lessonId: string,
    actorId?: string | null,
    level?: HideLevel
  ): Promise<ILessonMutation>;
  archiveWeek(
    courseId: string,
    weekId: string,
    actorId: string,
    level: HideLevel
  ): Promise<IWeekHide>;
  /** Marks the session cancelled, keeping its slot (MDRS-176). */
  cancelLesson(
    lessonId: string,
    expectedVersion: number,
    reason: string | null,
    actorId: string
  ): Promise<ILessonMutation>;
  /**
   * Replaces the muderris list and picks the imam, in one transaction, and
   * writes the change to `audit_log` (MDRS-176).
   */
  setMuderris(
    courseId: string,
    expectedVersion: number,
    list: { userId: string; name: string; title?: string }[],
    imamUserId: string,
    actorId: string
  ): Promise<{ muderris: IMuderris[]; courseVersion: number }>;
  /** The course's IANA zone; null if there is no such course. */
  findTimeZone(courseId: string): Promise<string | null>;
  /** Inserts every session of `batch` in one transaction (MDRS-109). */
  createSessionBatch(
    courseId: string,
    batch: ICreateSessionBatch
  ): Promise<ISessionBatchResult>;
  enroll(
    userId: string,
    courseId: string,
    options?: IEnrollOptions
  ): Promise<IEnrollment>;
  findEnrollment(userId: string, courseId: string): Promise<IEnrollment | null>;
  /** Whether `userId` is listed in `course_muderris` for `courseId`. */
  isMuderris(courseId: string, userId: string): Promise<boolean>;
  findTaughtBy(userId: string): Promise<ICourseRef[]>;
  /**
   * Whether `userId` holds a role in the course's chain right now: in the
   * course, its köşk, its medrese or on the platform. An enrolled talebe who
   * does is not off the record when they read the course (review L3).
   */
  holdsRoleOnCourse(userId: string, courseId: string): Promise<boolean>;
  /** One `audit_log` row for a content read by a non-participant (MDRS-103). */
  recordContentRead(entry: {
    actorId: string;
    courseId: string;
    details: Record<string, unknown>;
  }): Promise<void>;
  /**
   * One `audit_log` row for a read of a roster (the talebe list with e-mail
   * addresses, its numbers, who was taken out, the requests waiting) by someone
   * who is neither an enrolled talebe nor one of the course's müderrisler
   * (MDRS-135; owner, d-1003-09). The entity is the course, or the köşk for the
   * köşk-wide list of requests.
   */
  recordRosterRead(entry: {
    actorId: string;
    entity: "course" | "kosk";
    entityId: string;
    details: Record<string, unknown>;
  }): Promise<void>;
  findPendingByKosk(koskId: string): Promise<IPendingEnrollment[]>;
  /** The counts behind the course menu's badges (MDRS-183). */
  getBadgeCounts(courseId: string): Promise<ICourseBadgeCounts>;
  /** The course's müderris rows in display order (MDRS-105). */
  findMuderris(courseId: string): Promise<IMuderris[]>;
  /** Every enrollment in the course, for its team's roster (MDRS-105). */
  findEnrollmentsByCourse(courseId: string): Promise<IEnrollment[]>;
  /** Deletes the enrollment and audits the reason, in one transaction. */
  removeEnrollment(entry: IRemoveEnrollment): Promise<boolean>;
  /** Deletes a still-pending request and audits the refusal, in one transaction. */
  rejectEnrollment(entry: IRejectEnrollment): Promise<boolean>;
  findRemovedEnrollments(courseId: string): Promise<IRemovedEnrollment[]>;
  /** The row moves only while it still has `expectedStatus`; else null. */
  setEnrollmentStatus(
    userId: string,
    courseId: string,
    status: EnrollmentStatus,
    expectedStatus: EnrollmentStatus
  ): Promise<IEnrollment | null>;
  /** With `onlyStatus`, the row goes only while it still has that status. */
  deleteEnrollment(
    userId: string,
    courseId: string,
    onlyStatus?: EnrollmentStatus
  ): Promise<boolean>;
  /** Writes progress only while the row still has `expectedStatus`; else null. */
  updateProgress(
    userId: string,
    courseId: string,
    progress: number,
    expectedStatus: EnrollmentStatus
  ): Promise<IEnrollment | null>;
}
