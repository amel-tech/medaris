"use server";

import {
  type ActionOutcome,
  authenticatedAction,
  outcomeOf,
} from "~/lib/authenticated-action";

/**
 * "Haftayı gizle" (`POST /courses/:courseId/weeks/:weekId/hide`): the week and
 * its live sessions leave the course together; nothing is deleted. The API
 * decides by `week.hide`, so a refusal is its code and the page words it.
 */
export async function hideWeek(
  courseId: string,
  weekId: string
): Promise<ActionOutcome<{ hiddenSessions: number }>> {
  const result = await authenticatedAction(async (api) => {
    const { hiddenSessions } = await api.lessons.hideCourseWeek({
      courseId,
      weekId,
    });
    return { hiddenSessions };
  });
  if (!result.success) console.error("Error hiding a week:", result.error);
  return outcomeOf(result);
}

/** "Celseyi gizle" (`DELETE /lessons/:id`): the session is archived, never deleted; `week.hide` or `session.manage`. */
export async function hideSession(
  lessonId: string
): Promise<ActionOutcome<null>> {
  const result = await authenticatedAction(async (api) => {
    await api.lessons.archiveLesson({ id: lessonId });
    return null;
  });
  if (!result.success) console.error("Error hiding a session:", result.error);
  return outcomeOf(result);
}
