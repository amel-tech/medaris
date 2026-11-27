import type { MyQuestionNoteResponse } from "@medaris/services/tedrisat";
import { PRACTICE_HREF } from "~/features/practice/practice-model";

/**
 * The pure parts of the soru notları (MDRS-248): how long a note may be,
 * where a course's notes are, which refusal says what, and how the note icon
 * looks.
 */

/** The API's limit on a note's body (`question_notes.body`, 1..1000). */
export const NOTE_MAX = 1000;

/** "Notlarım" of a course: the notes under Çalışma Soruları. */
export const notesHref = (courseId: string) =>
  `${PRACTICE_HREF}/notlar?ders=${encodeURIComponent(courseId)}`;

/** The course a notes page was asked for: the first `ders`, when there is one. */
export const notesCourseOf = (search: {
  ders?: string | string[];
}): string | null => {
  const raw = Array.isArray(search.ders) ? search.ders[0] : search.ders;
  return raw && raw.trim() !== "" ? raw : null;
};

/** Each refusal of a write in words; anything else is the plain "could not". */
export type NoteError =
  | "disabled"
  | "shareLocked"
  | "notFound"
  | "forbidden"
  | "saveFailed"
  | "deleteFailed";

export const noteErrorOf = (
  failure: { status?: number; code?: string },
  writing: "save" | "delete"
): NoteError => {
  switch (failure.code) {
    case "NOTES_DISABLED":
      return "disabled";
    case "NOTES_SHARE_LOCKED":
      return "shareLocked";
    case "NOTE_QUESTION_NOT_FOUND":
      return "notFound";
    case "QUESTION_NOTES_FORBIDDEN":
      return "forbidden";
  }
  if (failure.status === 403) return "forbidden";
  return writing === "save" ? "saveFailed" : "deleteFailed";
};

/**
 * How a question's note icon looks: none written, written, written and
 * answered by the hoca (a dot), answered and not read yet (the dot, said).
 */
export type NoteLook = "empty" | "written" | "replied" | "newReply";

export const noteLookOf = (
  note: Pick<MyQuestionNoteResponse, "teacherReply" | "newReply"> | null
): NoteLook => {
  if (!note) return "empty";
  if (!note.teacherReply) return "written";
  return note.newReply ? "newReply" : "replied";
};

/**
 * Whether a question shows the note icon: notes on, or a note written before
 * the hoca turned them off (it stays readable and deletable).
 */
export const showsNote = (q: {
  talebeNotes?: boolean;
  myNote?: MyQuestionNoteResponse | null;
}): boolean => q.talebeNotes === true || Boolean(q.myNote);

/** The notes of a screen, by question, as the API sent them. */
export const notesOf = (
  questions: ReadonlyArray<{
    id: string;
    myNote?: MyQuestionNoteResponse | null;
  }>
): Map<string, MyQuestionNoteResponse | null> =>
  new Map(questions.map((q) => [q.id, q.myNote ?? null]));

/**
 * "Notlarım" in order: the answers not read yet first, then the latest
 * written; the API's order between equals.
 */
export const sortNotes = <
  T extends Pick<MyQuestionNoteResponse, "newReply" | "updatedAt">,
>(
  notes: readonly T[]
): T[] =>
  notes
    .map((note, at) => ({ note, at }))
    .sort(
      (a, b) =>
        Number(b.note.newReply) - Number(a.note.newReply) ||
        new Date(b.note.updatedAt).getTime() -
          new Date(a.note.updatedAt).getTime() ||
        a.at - b.at
    )
    .map(({ note }) => note);
