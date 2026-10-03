"use server";

import {
  type CalendarFeedLinkResponse,
  type CalendarFeedStatusResponse,
  type CourseDetailResponse,
  type CourseSummaryResponse,
  createServerTedrisatAPIs,
  type EnrolledCourseResponse,
  type EnrollmentResponse,
  type KoskResponse,
  ResponseError,
} from "@medaris/services/tedrisat";
import { revalidatePath } from "next/cache";
import { env } from "~/env";
import { getAccessToken } from "~/lib/auth_options";
import {
  type AuthenticatedActionResult,
  authenticatedAction,
} from "~/lib/authenticated-action";

/**
 * The API said no, about this course or köşk: unknown id or a malformed one (400,
 * 404), a draft the caller may not open or a one they may not see (403), a
 * token it did not accept (401). Anything else is a failure to ask.
 */
const isAnswerAboutTheCourse = (error: unknown): boolean =>
  error instanceof ResponseError &&
  [400, 401, 403, 404].includes(error.response.status);

export const getKosk = async (koskId: string): Promise<KoskResponse | null> => {
  try {
    const accessToken = await getAccessToken();
    const { kosks } = await createServerTedrisatAPIs(
      accessToken,
      env.TEDRISAT_API_BASE_URL
    );
    return await kosks.getKoskById({ id: koskId });
  } catch (error) {
    if (isAnswerAboutTheCourse(error)) return null;
    // The API did not answer: that is not "no such köşk" (design tedris/04).
    console.error("Error fetching köşk:", error);
    throw error;
  }
};

export const getKoskCourses = async (
  koskId: string
): Promise<CourseSummaryResponse[]> => {
  try {
    const accessToken = await getAccessToken();
    const { courses } = await createServerTedrisatAPIs(
      accessToken,
      env.TEDRISAT_API_BASE_URL
    );
    return await courses.getCoursesByKosk({ koskId });
  } catch (error) {
    // An empty shelf would read as a köşk with no courses: say so instead.
    console.error("Error fetching köşk courses:", error);
    throw error;
  }
};

export const getCourse = async (
  courseId: string
): Promise<CourseDetailResponse | null> => {
  try {
    const accessToken = await getAccessToken();
    const { courses } = await createServerTedrisatAPIs(
      accessToken,
      env.TEDRISAT_API_BASE_URL
    );
    return await courses.getCourseById({ id: courseId });
  } catch (error) {
    if (isAnswerAboutTheCourse(error)) return null;
    // The API did not answer, or answered 5xx: that is not "no such course".
    // It goes to the error boundary (design tedris/40), not to the 404 page.
    console.error("Error fetching course:", error);
    throw error;
  }
};

export const getMyCourses = async (): Promise<EnrolledCourseResponse[]> => {
  try {
    const accessToken = await getAccessToken();
    const { courses } = await createServerTedrisatAPIs(
      accessToken,
      env.TEDRISAT_API_BASE_URL
    );
    return await courses.getEnrolledCourses();
  } catch (error) {
    console.error("Error fetching enrolled courses:", error);
    return [];
  }
};

/**
 * The caller's courses for Derslerim (MDRS-159): enrolled, completed and the
 * requests still waiting for approval. A failure throws: an empty list would
 * read as "you have no courses" (design tedris/20).
 */
export const getMyCoursesWithApplications = async (): Promise<
  EnrolledCourseResponse[]
> => {
  const accessToken = await getAccessToken();
  const { courses } = await createServerTedrisatAPIs(
    accessToken,
    env.TEDRISAT_API_BASE_URL
  );
  return courses.getEnrolledCourses({ includePending: true });
};

/** Where a köşk's follow state shows: Keşfet and the köşk's own page (MDRS-159). */
const revalidateFollowers = (koskId: string) => {
  revalidatePath("/discover");
  revalidatePath(`/kosks/${koskId}`);
};

export const followKosk = async (
  koskId: string
): Promise<AuthenticatedActionResult<boolean>> => {
  const result = await authenticatedAction((api) =>
    api.kosks.followKosk({ id: koskId })
  );
  if (result.success) revalidateFollowers(koskId);
  return result;
};

export const unfollowKosk = async (
  koskId: string
): Promise<AuthenticatedActionResult<boolean>> => {
  const result = await authenticatedAction((api) =>
    api.kosks.unfollowKosk({ id: koskId })
  );
  if (result.success) revalidateFollowers(koskId);
  return result;
};

export const enrollInCourse = async (
  courseId: string
): Promise<AuthenticatedActionResult<EnrollmentResponse>> => {
  const result = await authenticatedAction((api) =>
    api.courses.enrollInCourse({ id: courseId })
  );
  if (result.success) revalidatePath(`/courses/${courseId}`);
  return result;
};

/**
 * Leaves the course, or withdraws a request still awaiting approval
 * (MDRS-105). The enrollment is deleted; the talebe may apply again. A
 * completed course cannot be left.
 */
export const leaveCourse = async (
  courseId: string
): Promise<AuthenticatedActionResult<boolean>> => {
  const result = await authenticatedAction((api) =>
    api.courses.leaveCourse({ id: courseId })
  );
  if (result.success) {
    revalidatePath(`/courses/${courseId}`);
    revalidatePath("/my-courses");
  }
  return result;
};

export const updateCourseProgress = async (
  courseId: string,
  progress: number
): Promise<AuthenticatedActionResult<EnrollmentResponse>> => {
  const result = await authenticatedAction((api) =>
    api.courses.updateCourseProgress({
      id: courseId,
      updateProgressDto: { progress },
    })
  );
  if (result.success) revalidatePath(`/courses/${courseId}`);
  return result;
};

/**
 * B11 (MDRS-120): whether the viewer has a calendar-feed URL. The URL itself
 * cannot be read back — tedrisat keeps only its hash — so this is all the
 * page can show until a new one is issued. Null when tedrisat cannot answer.
 */
export const getMyCalendarFeed =
  async (): Promise<CalendarFeedStatusResponse | null> => {
    try {
      const accessToken = await getAccessToken();
      const { me } = await createServerTedrisatAPIs(
        accessToken,
        env.TEDRISAT_API_BASE_URL
      );
      return await me.getMyCalendarFeed();
    } catch (error) {
      console.error("Error fetching the calendar feed status:", error);
      return null;
    }
  };

/** Issues a new calendar-feed URL; the previous one stops working. */
export const regenerateMyCalendarFeed = async (): Promise<
  AuthenticatedActionResult<CalendarFeedLinkResponse>
> => authenticatedAction((api) => api.me.regenerateMyCalendarFeed());
