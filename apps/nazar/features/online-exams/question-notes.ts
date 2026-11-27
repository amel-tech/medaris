import type { ExamKind } from "@medaris/services/tedrisat";
import { segmentOf } from "./online-exams";

/**
 * Talebe notları (MDRS-248) without a browser: where a set's notes are on
 * its page, whether a question takes notes, and the order the hoca reads
 * them in. See docs/migration/mdrs-248-soru-notlari.md for the API.
 */

/** The id of the notes part of a set's or an exam's page: the badge and the notification lead here. */
export const NOTES_ANCHOR = "talebe-notlari";

/** The notes of a set or an exam, on its own page. */
export const notesHref = (
  courseId: string,
  kind: ExamKind,
  examId: string
): string => `/ders/${courseId}/${segmentOf(kind)}/${examId}#${NOTES_ANCHOR}`;

/**
 * Whether a question takes notes. An older server leaves the field out:
 * then it is the API's default for a new question, on in a çalışma seti and
 * off in an exam.
 */
export const takesNotes = (
  question: { talebeNotes?: boolean },
  kind: ExamKind
): boolean => question.talebeNotes ?? kind === "PRACTICE";

/** What the order reads of a note. */
export interface OrderedNote {
  teacherReply: string | null;
  sharedAt: Date | string;
  repliedAt: Date | string | null;
}

const time = (at: Date | string | null): number =>
  at === null ? 0 : new Date(at).getTime();

/**
 * The hoca's order, as the API's `teacherOrder`: the notes waiting for an
 * answer first, the longest waiting first; then the answered ones, the
 * latest answered first. The page sorts again after an answer, so a note
 * just answered moves down without a read.
 */
export const teacherOrder = (a: OrderedNote, b: OrderedNote): number => {
  const aWaits = a.teacherReply === null;
  const bWaits = b.teacherReply === null;
  if (aWaits !== bWaits) return aWaits ? -1 : 1;
  if (aWaits) return time(a.sharedAt) - time(b.sharedAt);
  return time(b.repliedAt) - time(a.repliedAt);
};

/** The notes still waiting for an answer. */
export const unansweredOf = (
  notes: ReadonlyArray<{ teacherReply: string | null }>
): number => notes.filter((n) => n.teacherReply === null).length;

/** A note's and an answer's longest text: the API's 1000. */
export const NOTE_TEXT_MAX = 1000;
