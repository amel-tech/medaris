import type {
  CourseDetailResponse,
  LessonResponse,
} from "@medaris/services/tedrisat";
import { canWriteNotes } from "./lesson-note-model";

/**
 * The homework marks of the course page's programme. The owner, 2026-10-12:
 * "ödevin ödev olduğu anlaşılsın ve yapılmamış ödevin vurgulanması
 * sağlansın". A celse the müderris set homework on is marked "Ödev"; for a
 * talebe who may hand in and has not, the mark is the warning "Ödev teslim
 * edilmedi", and the page counts those celses. Pure, so a spec pins each
 * rule.
 *
 * The homework is course content: a caller who may not read it is sent no
 * `assignment` and sees no mark. Whether the talebe handed in is
 * `GET /courses/:id/my-submissions` (a note or a file, as the celse page
 * says "Teslim edildi"). Only a live celse that stands is marked: a
 * cancelled one has no homework card to hand in on.
 */

/** A celse's mark: homework still to hand in, homework, or none. */
export type AssignmentMark = "pending" | "set" | null;

/** What the marks read besides the course: who is looking, and where they handed in. */
export interface AssignmentViewer {
  /** the viewer may hand homework in on this course (the celse page's terms) */
  mayHandIn: boolean;
  /** the celses they handed in on; null when that could not be read */
  handedIn: ReadonlySet<string> | null;
}

/** Whether the viewer may hand homework in: enrolled or completed, the content open. */
export const mayHandInOn = (
  course: Pick<CourseDetailResponse, "contentLocked" | "enrollment">
): boolean => !course.contentLocked && canWriteNotes(course.enrollment?.status);

/** Whether any celse of the course has homework the viewer is told of. */
export const hasAssignments = (
  course: Pick<CourseDetailResponse, "weeks">
): boolean =>
  course.weeks.some((week) => week.lessons.some((lesson) => lesson.assignment));

export const assignmentMark = (
  lesson: Pick<LessonResponse, "id" | "type" | "cancelledAt" | "assignment">,
  viewer: AssignmentViewer
): AssignmentMark => {
  if (!lesson.assignment || lesson.cancelledAt != null) return null;
  if (
    viewer.mayHandIn &&
    viewer.handedIn !== null &&
    lesson.type === "LIVE" &&
    !viewer.handedIn.has(lesson.id)
  ) {
    return "pending";
  }
  return "set";
};

/** How many celses of the course have homework the viewer has not handed in. */
export const pendingAssignments = (
  course: Pick<CourseDetailResponse, "weeks">,
  viewer: AssignmentViewer
): number =>
  course.weeks
    .flatMap((week) => week.lessons)
    .filter((lesson) => assignmentMark(lesson, viewer) === "pending").length;
