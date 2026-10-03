"use server";

import type {
  CourseDetailResponse,
  LessonMutationResponse,
  MuderrisListResponse,
  ReplaceCourseDto,
  SetMuderrisDto,
  UpdateCourseDto,
  UpdateLessonDto,
} from "@medaris/services/tedrisat";
import { revalidatePath } from "next/cache";
import {
  type AuthenticatedActionResult,
  authenticatedAction,
} from "~/lib/authenticated-action";

/** Every page that shows a course's programme, refreshed after a write. */
const revalidateCourse = (koskId: string, courseId: string) => {
  revalidatePath(`/kosks/${koskId}`, "layout");
  revalidatePath(`/kosks/${koskId}/dersler`);
  revalidatePath(`/kosks/${koskId}/courses/${courseId}`, "layout");
};

/**
 * "Müderrisleri düzenle" (nizam 33): the list and the imam in one audited
 * write. `version` is the course version the dialog was opened on; a 409 means
 * somebody saved the course since.
 */
export const setCourseMuderris = async (
  koskId: string,
  courseId: string,
  body: SetMuderrisDto
): Promise<AuthenticatedActionResult<MuderrisListResponse>> => {
  const result = await authenticatedAction((api) =>
    api.courses.setCourseMuderris({ id: courseId, setMuderrisDto: body })
  );
  if (result.success) revalidateCourse(koskId, courseId);
  return result;
};

/** The course as the dialog needs it (the müderris list and its version). */
export const readCourse = async (
  courseId: string
): Promise<AuthenticatedActionResult<CourseDetailResponse>> =>
  authenticatedAction((api) => api.courses.getCourseById({ id: courseId }));

/** "Ders ayarları" (nizam 34): the course-level fields. */
export const patchCourse = async (
  koskId: string,
  courseId: string,
  body: UpdateCourseDto
): Promise<AuthenticatedActionResult<CourseDetailResponse>> => {
  const result = await authenticatedAction((api) =>
    api.courses.updateCourse({ id: courseId, updateCourseDto: body })
  );
  if (result.success) revalidateCourse(koskId, courseId);
  return result;
};

/** Changes one session (its link, its time, its sample flag). */
export const patchLesson = async (
  koskId: string,
  courseId: string,
  lessonId: string,
  body: UpdateLessonDto
): Promise<AuthenticatedActionResult<LessonMutationResponse>> => {
  const result = await authenticatedAction((api) =>
    api.lessons.updateLesson({ id: lessonId, updateLessonDto: body })
  );
  if (result.success) revalidateCourse(koskId, courseId);
  return result;
};

/** "İptal et" (nizam 56): the session stays in the programme, marked cancelled. */
export const cancelSession = async (
  koskId: string,
  courseId: string,
  lessonId: string,
  version: number,
  reason?: string
): Promise<AuthenticatedActionResult<LessonMutationResponse>> => {
  const result = await authenticatedAction((api) =>
    api.lessons.cancelLesson({
      id: lessonId,
      cancelLessonDto: { version, ...(reason ? { reason } : {}) },
    })
  );
  if (result.success) revalidateCourse(koskId, courseId);
  return result;
};

/** "Kaydet" on the curriculum (nizam 54): the whole course, as the form holds it. */
export const saveCurriculum = async (
  koskId: string,
  courseId: string,
  body: ReplaceCourseDto
): Promise<AuthenticatedActionResult<CourseDetailResponse>> => {
  const result = await authenticatedAction((api) =>
    api.courses.replaceCourse({ id: courseId, replaceCourseDto: body })
  );
  if (result.success) revalidateCourse(koskId, courseId);
  return result;
};
