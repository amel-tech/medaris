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
 * Content: a lesson's `meetingUrl`, `agenda` and `kaynak`, and a resource's
 * `url`. A caller without `VIEW_DETAILS` gets the programme only, and the
 * content keys are removed rather than nulled.
 *
 * `isPreview` does not open anything here: a meeting link is never public
 * (MDRS-103 "What to build" 3), and the sample-lesson rule for closed courses
 * belongs to role model v2 (MDRS-133).
 */

const lessonWithoutContent = ({
  kaynak: _kaynak,
  meetingUrl: _meetingUrl,
  agenda: _agenda,
  ...programme
}: ILesson): ILessonView => programme;

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

/** The detail unchanged, for a caller who may read the content. */
export function withContent(course: ICourseDetail): ICourseDetailView {
  return { ...course, contentLocked: false };
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
  const status = course.enrollment?.status;
  if (
    course.enrollment?.userId === userId &&
    (status === EnrollmentStatus.ENROLLED ||
      status === EnrollmentStatus.COMPLETED)
  ) {
    return true;
  }
  return course.muderris.some((m) => m.userId === userId);
}
