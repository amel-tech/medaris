"use server";

import type {
  LessonAssignmentResponse,
  ReplaceCourseDto,
} from "@medaris/services/tedrisat";
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

/**
 * A celse's homework on Müfredat, apart from its resources: "Bu celsenin
 * ödevi var" turned on (`PUT /lessons/:id/assignment` with no description),
 * its description saved, the homework taken off, a file removed. Each is
 * stored at once, under `session.manage`, outside the curriculum's
 * "Kaydet": the homework is no part of the whole-course save. A file is
 * added through this app's upload route (`fileRoutes.lessonAssignment`). A
 * refusal is its code and the editor words it.
 */
export async function saveLessonAssignment(
  lessonId: string,
  description: string | null
): Promise<ActionOutcome<LessonAssignmentResponse>> {
  return outcomeOf(
    await authenticatedAction((api) =>
      api.lessonAssignments.saveLessonAssignment({
        id: lessonId,
        saveLessonAssignmentDto: { description },
      })
    )
  );
}

/** The description and every file go; the talebe's submissions stay. */
export async function deleteLessonAssignment(
  lessonId: string
): Promise<ActionOutcome<void>> {
  return outcomeOf(
    await authenticatedAction((api) =>
      api.lessonAssignments.deleteLessonAssignment({ id: lessonId })
    )
  );
}

/** The file goes from storage too; tedrisat writes the removal to the audit log. */
export async function deleteLessonAssignmentFile(
  lessonId: string,
  fileId: string
): Promise<ActionOutcome<void>> {
  return outcomeOf(
    await authenticatedAction((api) =>
      api.lessonAssignments.deleteLessonAssignmentFile({
        id: lessonId,
        fileId,
      })
    )
  );
}
