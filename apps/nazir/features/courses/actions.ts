"use server";

import type {
  OpenMadrasahCourseDto,
  SetMadrasahCourseMuderrisDto,
} from "@medaris/services/tedrisat";
import {
  type ActionOutcome,
  authenticatedAction,
  outcomeOf,
} from "~/lib/authenticated-action";

/**
 * "Dersi aç" of nazir 08 (`POST /madrasahs/:id/courses`): the course is a
 * draft of the medrese in the köşk chosen. The medrese's policies are applied
 * by the API whatever is sent. A refusal is its code (HOSTING_RIGHT_REQUIRED,
 * MUDERRIS_UNKNOWN_USER, COURSE_IMAM_REQUIRED, …) and the page words it.
 */
export async function openCourse(
  madrasahId: string,
  request: OpenMadrasahCourseDto
): Promise<ActionOutcome<{ id: string; title: string }>> {
  const result = await authenticatedAction(async (api) => {
    const { id, title } = await api.madrasahs.openMadrasahCourse({
      id: madrasahId,
      openMadrasahCourseDto: request,
    });
    return { id, title };
  });
  if (!result.success) console.error("Error opening a course:", result.error);
  return outcomeOf(result);
}

/**
 * "Kaydet" of nazir 17 (`PUT /madrasahs/:id/courses/:courseId/muderrises`):
 * the accounts sent are every müderris the course is to have, so "Çıkar" is a
 * list without them. A müderris shown by name alone is left as it is.
 */
export async function replaceMuderris(
  madrasahId: string,
  courseId: string,
  request: SetMadrasahCourseMuderrisDto
): Promise<ActionOutcome<null>> {
  const result = await authenticatedAction(async (api) => {
    await api.madrasahs.setMadrasahCourseMuderris({
      id: madrasahId,
      courseId,
      setMadrasahCourseMuderrisDto: request,
    });
    return null;
  });
  if (!result.success)
    console.error("Error replacing the müderrisler:", result.error);
  return outcomeOf(result);
}

/** "Gizle" of nazir 18 (`POST /madrasahs/:id/courses/:courseId/hide`): nothing is deleted; the Arşiv brings the course back. */
export async function hideCourse(
  madrasahId: string,
  courseId: string
): Promise<ActionOutcome<null>> {
  const result = await authenticatedAction(async (api) => {
    await api.madrasahs.hideMadrasahCourse({ id: madrasahId, courseId });
    return null;
  });
  if (!result.success) console.error("Error hiding a course:", result.error);
  return outcomeOf(result);
}
