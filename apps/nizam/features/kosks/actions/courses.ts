"use server";

import type {
  CourseDetailResponse,
  CreateCourseDto,
  EnrollmentResponse,
  ReplaceCourseDto,
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

export const approveEnrollment = async (
  koskId: string,
  courseId: string,
  userId: string
): Promise<AuthenticatedActionResult<EnrollmentResponse>> => {
  const result = await authenticatedAction((api) =>
    api.courses.approveEnrollment({ id: courseId, userId })
  );
  if (result.success) revalidatePath(`/kosks/${koskId}`);
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
  if (result.success) revalidatePath(`/kosks/${koskId}`);
  return result;
};
