"use server";

import type { Unauthenticated } from "@medaris/auth/server";
import {
  type ActionOutcome,
  authenticatedAction,
  outcomeOf,
} from "~/lib/authenticated-action";

/**
 * A session's note from its müderris: one call of tedrisat's `teacher-note`
 * endpoint with the caller's token. A refusal is its code; the page words it.
 * The API decides the write (`session.manage`).
 */

export type TeacherNoteOutcome =
  | ActionOutcome<{ body: string | null }>
  | Unauthenticated;

/** "Notu kaydet" (`PUT /lessons/:id/teacher-note`); a null body removes the note. */
export async function saveTeacherNote(
  lessonId: string,
  body: string | null
): Promise<TeacherNoteOutcome> {
  const result = await authenticatedAction(async (api) => {
    const saved = await api.lessons.saveLessonTeacherNote({
      id: lessonId,
      saveLessonTeacherNoteDto: { body },
    });
    return { body: saved.body };
  });
  if (!result.success) {
    console.error("Error saving a session's note:", result.error);
  }
  return outcomeOf(result);
}
