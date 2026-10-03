import type {
  ICourseDetail,
  ICourseDetailView,
  ILesson,
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
 * Content: a lesson's `meetingUrl`, `agenda`, `kaynak` and `cancelReason`, and a resource's
 * `url`. A caller without `course.view_details` gets the programme only, and the
 * content keys are removed rather than nulled.
 *
 * A meeting link is never public (MDRS-103 "What to build" 3). A sample
 * session (`isPreview`, "Örnek celse", tedris/05) is the one exception to the
 * rest of the content (MDRS-161): its source line and its agenda stay, so a
 * visitor can read what a session is like before applying. Its meeting link
 * and a cancellation's reason never do.
 */

const lessonWithoutContent = ({
  kaynak,
  meetingUrl: _meetingUrl,
  agenda,
  cancelReason: _cancelReason,
  ...programme
}: ILesson): ILessonView =>
  programme.isPreview ? { ...programme, kaynak, agenda } : programme;

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
