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
  muderris: IMuderris[];
  enrollment: IEnrollment | null;
}

export interface IEnrolledCourse extends ICourse {
  koskName: string;
  weekCount: number;
  lessonCount: number;
  muderris: IMuderris[];
  enrollment: IEnrollment;
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

export interface IPendingEnrollment extends IEnrollment {
  courseTitle: string;
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
  timeZone?: string;
  weeks?: ICreateWeek[];
  muderris?: ICreateMuderris[];
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
  timeZone?: string;
}

export type IReplaceCourse = Omit<ICreateCourse, "koskId" | "authorId"> & {
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

/** One session of a weekly-pattern batch (MDRS-109), already expanded. */
export interface IBatchSession {
  scheduledAt: Date;
  /** The course week it goes into; created as "Hafta N" when missing. */
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
  findEnrolledByUser(userId: string): Promise<IEnrolledCourse[]>;
  create(course: ICreateCourse): Promise<ICourseDetail>;
  findKoskId(id: string): Promise<string | null>;
  /** The user holding the course's imam grant, or null (MDRS-133). */
  findImamUserId(courseId: string): Promise<string | null>;
  /** Status, hidden, and the köşk's `is_private`; null for no course (MDRS-122). */
  findPublicVisibility(id: string): Promise<{
    status: CourseStatus;
    archived: boolean;
    koskIsPrivate: boolean;
  } | null>;
  update(id: string, updates: IUpdateCourse): Promise<ICourse | null>;
  replace(
    id: string,
    userId: string,
    data: IReplaceCourse
  ): Promise<ICourseDetail>;
  archive(id: string, userId: string): Promise<ICourse | null>;
  restore(id: string): Promise<ICourse | null>;
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
  archiveLesson(lessonId: string): Promise<ILessonMutation>;
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
  /** One `audit_log` row for a content read by a non-participant (MDRS-103). */
  recordContentRead(entry: {
    actorId: string;
    courseId: string;
    details: Record<string, unknown>;
  }): Promise<void>;
  findPendingByKosk(koskId: string): Promise<IPendingEnrollment[]>;
  /** The course's müderris rows in display order (MDRS-105). */
  findMuderris(courseId: string): Promise<IMuderris[]>;
  /** Which of `ids` have signed in at least once (have a `users` row). */
  findKnownUserIds(ids: readonly string[]): Promise<string[]>;
  /** Every enrollment in the course, for its team's roster (MDRS-105). */
  findEnrollmentsByCourse(courseId: string): Promise<IEnrollment[]>;
  /** Deletes the enrollment and audits the reason, in one transaction. */
  removeEnrollment(entry: IRemoveEnrollment): Promise<boolean>;
  setEnrollmentStatus(
    userId: string,
    courseId: string,
    status: EnrollmentStatus
  ): Promise<IEnrollment | null>;
  deleteEnrollment(userId: string, courseId: string): Promise<boolean>;
  updateProgress(
    userId: string,
    courseId: string,
    progress: number,
    status: EnrollmentStatus
  ): Promise<IEnrollment | null>;
}
