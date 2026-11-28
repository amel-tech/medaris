/**
 * A session's note from its müderris (ders notu): one Markdown text a
 * session, which the talebe reads on the session's page. What the editor
 * checks before it sends one. Pure.
 */

/** The API's limit (`PUT /lessons/:id/teacher-note`), in characters. */
export const TEACHER_NOTE_MAX = 20_000;

/**
 * The body as it is sent: the tail trimmed, and a note of only whitespace is
 * null, which removes it. Leading whitespace stays: it is Markdown's.
 */
export function teacherNoteBody(draft: string): string | null {
  return draft.trim() === "" ? null : draft.trimEnd();
}

/** How long the note is as the API counts it. */
export const teacherNoteLength = (draft: string): number =>
  teacherNoteBody(draft)?.length ?? 0;

/** Whether the API would refuse the note for its length. */
export const teacherNoteTooLong = (draft: string): boolean =>
  teacherNoteLength(draft) > TEACHER_NOTE_MAX;

/** Whether saving the draft would change what is kept. */
export const teacherNoteChanged = (
  draft: string,
  saved: string | null
): boolean => teacherNoteBody(draft) !== saved;
