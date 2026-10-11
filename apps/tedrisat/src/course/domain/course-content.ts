import type {
  ICourseDetail,
  ICourseDetailView,
  ILesson,
  ILessonResource,
  ILessonResourceView,
  ILessonView,
  IResource,
  IResourceView,
} from "../course.repository.interface";
import { EnrollmentStatus } from "./enrollment-status.enum";

/**
 * The content rule of a course response (MDRS-103), as pure functions so the
 * service and its tests share one implementation.
 *
 * Public: the course, its weeks, and each lesson's title, type, schedule and
 * length — the programme a visitor needs in order to decide to enroll.
 * Content: a lesson's `meetingUrl`, `agenda`, `kaynak` and `cancelReason`, how
 * it is attended (`inPerson`, `inPersonOverride`, `hasLiveStream`, MDRS-283),
 * when its recording opens (`recordingAvailableAt`, MDRS-288), and a
 * resource's `url`, the course's or a session's own (MDRS-286). A caller
 * without `course.view_details` gets the programme only, and the content keys
 * are removed rather than nulled. A resource's name is programme: "Adlarını
 * herkes görür; bağlantıları derse kayıtlı talebeler açar."
 *
 * A meeting link is never public (MDRS-103 "What to build" 3). A sample
 * session (`isPreview`, "Örnek celse", tedris/05) is the one exception to the
 * rest of the content (MDRS-161): its source line and its agenda stay, so a
 * visitor can read what a session is like before applying. Its meeting link,
 * a cancellation's reason and its resources' links never do.
 */

const lessonResourceWithoutContent = ({
  url: _url,
  ...listing
}: ILessonResource): ILessonResourceView => listing;

const lessonWithoutContent = ({
  kaynak,
  meetingUrl: _meetingUrl,
  agenda,
  cancelReason: _cancelReason,
  // How the session is attended goes where the meeting link goes (MDRS-283).
  inPerson: _inPerson,
  inPersonOverride: _inPersonOverride,
  hasLiveStream: _hasLiveStream,
  // So does when its recording opens (MDRS-288): a PUBLIC recording carries
  // its own `availableAt` to whoever it is shown to.
  recordingAvailableAt: _recordingAvailableAt,
  resources,
  ...rest
}: ILesson): ILessonView => {
  const programme = {
    ...rest,
    resources: resources.map(lessonResourceWithoutContent),
  };
  return programme.isPreview ? { ...programme, kaynak, agenda } : programme;
};

const resourceWithoutContent = ({
  url: _url,
  ...listing
}: IResource): IResourceView => listing;

/** The detail with every content field removed, marked `contentLocked`. */
export function withoutContent(course: ICourseDetail): ICourseDetailView {
  return {
    ...course,
    weeks: course.weeks.map((week) => ({
      ...week,
      lessons: week.lessons.map(lessonWithoutContent),
    })),
    resources: course.resources.map(resourceWithoutContent),
    contentLocked: true,
  };
}

/**
 * A session write's answer for a caller who may not read the content: its
 * resources' links removed, as `withoutContent` removes them (MDRS-286). Only
 * `DELETE /lessons/:id` has such a caller, as `week.hide` alone may hide a
 * session; the other session writes ask for `session.manage`, which opens the
 * content.
 */
export function withoutResourceLinks<
  T extends { resources: ILessonResource[] },
>(lesson: T): Omit<T, "resources"> & { resources: ILessonResourceView[] } {
  return {
    ...lesson,
    resources: lesson.resources.map(lessonResourceWithoutContent),
  };
}

/**
 * The detail for a caller who may read the content. A cancelled session's
 * meeting link is not sent even to them (nizam/56): the session page already
 * answers `meetingUrl: null` for it, and the course body must say the same.
 */
export function withContent(course: ICourseDetail): ICourseDetailView {
  return {
    ...course,
    weeks: course.weeks.map((week) => ({
      ...week,
      lessons: week.lessons.map((lesson) =>
        lesson.cancelledAt ? { ...lesson, meetingUrl: null } : lesson
      ),
    })),
    contentLocked: false,
  };
}

/**
 * Whether the caller is one of the two groups whose content reads are not
 * audited: the course's enrolled talebe (ENROLLED or COMPLETED — PENDING is
 * not enrolled) and its müderrisler. Everyone else who reads content — the
 * köşk manager, SYSTEM_ADMIN — goes to `audit_log`.
 *
 * Read off the detail itself: `enrollment` is the caller's own row
 * (`findDetailById` filters by user) and `muderris` lists the course's.
 */
export function isCourseParticipant(
  course: ICourseDetail,
  userId: string
): boolean {
  return isEnrolledTalebe(course, userId) || isCourseMuderris(course, userId);
}

/**
 * What `audit_log.action` says of a read of a roster: the talebe list with
 * e-mail addresses, the numbers behind it, who was taken out, the requests
 * waiting. Written for everyone but the course's enrolled talebe and müderrisler
 * (MDRS-135).
 */
export const ROSTER_READ_ACTION = "course.roster_read";

/** Which roster a row of `ROSTER_READ_ACTION` is about (its `details.via`). */
export type RosterRead =
  | "enrollments"
  | "removed"
  | "stats"
  | "badge-counts"
  | "pending"
  | "kosk-dashboard";

/** The caller's own row says ENROLLED or COMPLETED (PENDING is not enrolled). */
export function isEnrolledTalebe(
  course: ICourseDetail,
  userId: string
): boolean {
  const status = course.enrollment?.status;
  return (
    course.enrollment?.userId === userId &&
    (status === EnrollmentStatus.ENROLLED ||
      status === EnrollmentStatus.COMPLETED)
  );
}

/** One of the course's listed müderrisler. */
export function isCourseMuderris(
  course: ICourseDetail,
  userId: string
): boolean {
  return course.muderris.some((m) => m.userId === userId);
}
