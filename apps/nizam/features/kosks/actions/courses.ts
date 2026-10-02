"use server";

import type {
  CourseDetailResponse,
  CreateCourseDto,
  CreateSessionBatchDto,
  EnrollmentResponse,
  ReplaceCourseDto,
  SessionBatchPreviewResponse,
  SessionBatchResponse,
  TeamSettableEnrollmentStatus,
  UserSummaryResponse,
  WeeklyPatternDto,
} from "@medaris/services/tedrisat";
import { revalidatePath } from "next/cache";
import {
  type AuthenticatedActionResult,
  authenticatedAction,
} from "~/lib/authenticated-action";

export const createKoskCourse = async (
  koskId: string,
  course: CreateCourseDto
): Promise<AuthenticatedActionResult<CourseDetailResponse>> => {
  const result = await authenticatedAction((api) =>
    api.courses.createCourse({ koskId, createCourseDto: course })
  );
  if (result.success) revalidatePath(`/kosks/${koskId}`);
  return result;
};

/**
 * Saves the whole course form. `course.version` must be the version the form
 * was loaded with: tedrisat answers 409 `COURSE_VERSION_CONFLICT` if anyone
 * saved the course since, instead of overwriting their changes (MDRS-95).
 */
export const updateKoskCourse = async (
  koskId: string,
  courseId: string,
  course: ReplaceCourseDto
): Promise<AuthenticatedActionResult<CourseDetailResponse>> => {
  const result = await authenticatedAction((api) =>
    api.courses.replaceCourse({ id: courseId, replaceCourseDto: course })
  );
  if (result.success) {
    revalidatePath(`/kosks/${koskId}`);
    revalidatePath(`/kosks/${koskId}/courses/${courseId}/edit`);
  }
  return result;
};

/**
 * The sessions a weekly pattern would create, expanded by tedrisat exactly as
 * `createCourseSessions` will (MDRS-109). Writes nothing.
 */
export const previewCourseSessions = async (
  courseId: string,
  pattern: WeeklyPatternDto
): Promise<AuthenticatedActionResult<SessionBatchPreviewResponse>> =>
  authenticatedAction((api) =>
    api.lessons.previewSessionBatch({ courseId, weeklyPatternDto: pattern })
  );

/**
 * Creates every session of a weekly pattern in one server-side transaction
 * (MDRS-109). It bumps the course version, so a form loaded before it has to
 * reload before its next whole-course save.
 */
export const createCourseSessions = async (
  koskId: string,
  courseId: string,
  batch: CreateSessionBatchDto
): Promise<AuthenticatedActionResult<SessionBatchResponse>> => {
  const result = await authenticatedAction((api) =>
    api.lessons.createSessionBatch({ courseId, createSessionBatchDto: batch })
  );
  if (result.success) {
    revalidatePath(`/kosks/${koskId}`);
    revalidatePath(`/kosks/${koskId}/courses/${courseId}/edit`);
  }
  return result;
};

/** Pages that show a course's enrollments, refreshed after any change. */
const revalidateEnrollments = (koskId: string, courseId: string) => {
  revalidatePath(`/kosks/${koskId}`);
  revalidatePath(`/kosks/${koskId}/courses/${courseId}/students`);
};

export const approveEnrollment = async (
  koskId: string,
  courseId: string,
  userId: string
): Promise<AuthenticatedActionResult<EnrollmentResponse>> => {
  const result = await authenticatedAction((api) =>
    api.courses.approveEnrollment({ id: courseId, userId })
  );
  if (result.success) revalidateEnrollments(koskId, courseId);
  return result;
};

export const rejectEnrollment = async (
  koskId: string,
  courseId: string,
  userId: string
): Promise<AuthenticatedActionResult<boolean>> => {
  const result = await authenticatedAction((api) =>
    api.courses.rejectEnrollment({ id: courseId, userId })
  );
  if (result.success) revalidateEnrollments(koskId, courseId);
  return result;
};

/**
 * Completes the course for a talebe, or reopens it (MDRS-105). Only the
 * course team does this; the talebe's own progress never does.
 */
export const setEnrollmentStatus = async (
  koskId: string,
  courseId: string,
  userId: string,
  status: TeamSettableEnrollmentStatus
): Promise<AuthenticatedActionResult<EnrollmentResponse>> => {
  const result = await authenticatedAction((api) =>
    api.courses.setEnrollmentStatus({
      id: courseId,
      userId,
      setEnrollmentStatusDto: { status },
    })
  );
  if (result.success) revalidateEnrollments(koskId, courseId);
  return result;
};

/**
 * Takes a talebe out of the course with a reason, which tedrisat keeps in
 * its audit log (MDRS-105). Not a ban: they may apply again.
 */
export const removeEnrollment = async (
  koskId: string,
  courseId: string,
  userId: string,
  reason: string
): Promise<AuthenticatedActionResult<boolean>> => {
  const result = await authenticatedAction((api) =>
    api.courses.removeEnrollment({
      id: courseId,
      userId,
      removeEnrollmentDto: { reason },
    })
  );
  if (result.success) revalidateEnrollments(koskId, courseId);
  return result;
};

/**
 * Exact, case-insensitive e-mail lookup for the müderris picker (MDRS-104,
 * MDRS-105): zero or one account. Only SYSTEM_ADMIN and köşk managers may
 * ask; anyone else gets USER_LOOKUP_FORBIDDEN.
 */
export const findUserByEmail = async (
  email: string
): Promise<AuthenticatedActionResult<UserSummaryResponse[]>> =>
  authenticatedAction((api) => api.users.findUserByEmail({ email }));
