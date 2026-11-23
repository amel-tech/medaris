import type { CourseDetailResponse } from "@medaris/services/tedrisat";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { inviteHrefs } from "~/lib/invite-hrefs";
import { getCourse } from "./actions";
import { isSignedIn } from "./public-reads";

/**
 * One read of the course per request, shared by the segment layout (which
 * answers a real 404 before any byte streams) and the page.
 */
export const loadCourse = cache(getCourse);

/**
 * The course, or the way out when the API gives none. An unlisted course, or a
 * course of an unlisted köşk, opens by its link to a signed-in caller only
 * (MDRS-248, MDRS-122), and the API answers a signed-out one as it answers a
 * missing course. So the link a müderris shares sends a signed-out talebe to
 * sign in and back here, not to 404. A course that is truly missing is 404
 * after sign-in as before.
 *
 * The segment layout must call this, not only the page: the layout reads the
 * course first, and a `notFound()` there ends the request before the page's
 * own check runs.
 */
export const loadCourseOrLeave = async (
  courseId: string
): Promise<CourseDetailResponse> => {
  const course = await loadCourse(courseId);
  if (course) return course;
  if (!(await isSignedIn()))
    redirect(inviteHrefs(`/courses/${courseId}`).signIn);
  notFound();
};
