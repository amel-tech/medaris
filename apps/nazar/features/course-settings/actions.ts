"use server";

import type { UpdateCourseDto } from "@medaris/services/tedrisat";
import {
  type ActionOutcome,
  authenticatedAction,
  outcomeOf,
} from "~/lib/authenticated-action";

/**
 * Ders ayarları: each write is one call of tedrisat's course or session
 * endpoints. `PATCH /courses/:id` takes no version (the last save wins) and
 * hands back the version the course is now at; `PATCH /lessons/:id` carries
 * the version the page was read at, and a 409 (`COURSE_VERSION_CONFLICT`)
 * means somebody saved the course since and nothing was written. A refusal is
 * its code and the page words it; the server's message never reaches the
 * browser. The page reads itself again with `router.refresh()`.
 */

/** "Kaydet" (`PATCH /courses/:id`): only the fields in `patch` change. */
export async function saveCourseSettings(
  courseId: string,
  patch: UpdateCourseDto
): Promise<ActionOutcome<{ version: number }>> {
  const result = await authenticatedAction(async (api) => {
    const { version } = await api.courses.updateCourse({
      id: courseId,
      updateCourseDto: patch,
    });
    return { version };
  });
  if (!result.success)
    console.error("Error saving the course settings:", result.error);
  return outcomeOf(result);
}

/** "Yayımla" / "Taslağa çek" (`PATCH /courses/:id`): the status alone. */
export async function setCourseStatus(
  courseId: string,
  status: "DRAFT" | "PUBLISHED"
): Promise<ActionOutcome<{ version: number }>> {
  const result = await authenticatedAction(async (api) => {
    const { version } = await api.courses.updateCourse({
      id: courseId,
      updateCourseDto: { status },
    });
    return { version };
  });
  if (!result.success)
    console.error("Error changing the course's status:", result.error);
  return outcomeOf(result);
}

/** "Örnek ders" (`PATCH /lessons/:id`): one session marked as the sample, or no longer. */
export async function setSampleLesson(
  lessonId: string,
  change: { version: number; isPreview: boolean }
): Promise<ActionOutcome<{ courseVersion: number }>> {
  const result = await authenticatedAction(async (api) => {
    const { courseVersion } = await api.lessons.updateLesson({
      id: lessonId,
      updateLessonDto: { version: change.version, isPreview: change.isPreview },
    });
    return { courseVersion };
  });
  if (!result.success)
    console.error("Error changing the sample session:", result.error);
  return outcomeOf(result);
}
