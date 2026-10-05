"use server";

import type { ReplaceCourseDto } from "@medaris/services/tedrisat";
import {
  type ActionOutcome,
  authenticatedAction,
  outcomeOf,
} from "~/lib/authenticated-action";

/**
 * "Kaydet" on Müfredat (`PUT /courses/:id`): the whole course, as the form
 * holds it, with the course version the page was read at. A 409
 * (`COURSE_VERSION_CONFLICT`) means somebody saved the course since and
 * nothing was written. A refusal is its code and the page words it; the
 * server's message never reaches the browser, and the saved course is read
 * again by the page, so only its new version comes back.
 */
export async function saveCurriculum(
  courseId: string,
  body: ReplaceCourseDto
): Promise<ActionOutcome<{ courseVersion: number }>> {
  const result = await authenticatedAction(async (api) => {
    const saved = await api.courses.replaceCourse({
      id: courseId,
      replaceCourseDto: body,
    });
    return { courseVersion: saved.version };
  });
  if (!result.success)
    console.error("Error saving the curriculum:", result.error);
  return outcomeOf(result);
}
