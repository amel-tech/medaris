import type { CourseDetailResponse } from "@medaris/services/tedrisat";

/** Which call to action a locked lesson offers (design B8, MDRS-103). */
export type LessonLockReason = "signIn" | "apply" | "pending";

/**
 * B8's call to action, or null when the lesson is not locked.
 *
 * The API decides access and reports it as `contentLocked`; this only picks
 * what to offer. PENDING is not enrolled (MDRS-103), so a pending caller sees
 * the locked card with "awaiting approval" rather than the lesson.
 */
export function lessonLockReason(
  course: Pick<CourseDetailResponse, "contentLocked" | "enrollment">,
  signedIn: boolean
): LessonLockReason | null {
  if (!course.contentLocked) return null;
  if (!signedIn) return "signIn";
  return course.enrollment?.status === "PENDING" ? "pending" : "apply";
}
