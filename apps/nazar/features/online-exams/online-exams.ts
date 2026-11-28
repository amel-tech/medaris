import type { ExamKind } from "@medaris/services/tedrisat";

/** The course page a kind is prepared under: "Sınavlar", or "Çalışma Soruları" for a set (MDRS-248). */
export const segmentOf = (kind: ExamKind): string =>
  kind === "PRACTICE" ? "calisma-sorulari" : "sinavlar";

/** The option fields a new question shows (the owner: five). */
export const OPTION_FIELDS = 5;

/** The most options a question takes: the API's `@ArrayMaxSize(50)` on them. */
export const OPTIONS_MAX = 50;

/** An option's longest text: the API's `OPTION_TEXT_MAX`. */
export const OPTION_TEXT_MAX = 1000;

/** "A", "B", … "Z", "AA", "AB": the option's mark, as `<ol type="A">` counts. */
export const optionLetter = (index: number): string => {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
};

// "A) ", "b. ", "(3) ", "12. ", "Ç) ": the mark a list copied from a document starts each line with.
const LINE_MARK = /^\(?(\d{1,2}|\p{L})[.)]\s+/u;
const TURKISH = "ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ";

/** Whether the marks count on one by one: 1, 2, 3… or A, B, C… (Latin or Turkish order). */
function counting(marks: readonly string[]): boolean {
  const steps = (order: (mark: string) => number, of = marks) =>
    of.every(
      (mark, k) => k === 0 || order(mark) === order(of[k - 1] ?? "") + 1
    );
  if (marks.every((mark) => /^\d+$/.test(mark))) return steps(Number);
  if (marks.every((mark) => /^[A-Za-z]$/.test(mark)))
    return steps((mark) => mark.charCodeAt(0));
  const upper = marks.map((mark) => mark.toLocaleUpperCase("tr-TR"));
  return (
    upper.every((mark) => TURKISH.includes(mark)) &&
    steps((mark) => TURKISH.indexOf(mark), upper)
  );
}

/**
 * The lines of a paste, one option each: blank lines dropped, cut to an
 * option's longest text, and the marks taken off only when every line
 * carries one and they count on (A, B, C… or 1, 2, 3…), so "I. Dünya
 * Savaşı" and "V. Murad" keep theirs. One line or none is not a list: the
 * caller lets the paste through.
 */
export function pastedOptions(text: string): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
  if (lines.length < 2) return lines;
  const marks = lines.map((line) => LINE_MARK.exec(line)?.[1]);
  const strip =
    marks.every((mark) => mark !== undefined) && counting(marks as string[]);
  return lines.map((line) =>
    (strip ? line.replace(LINE_MARK, "").trim() : line).slice(
      0,
      OPTION_TEXT_MAX
    )
  );
}

/**
 * The options after `lines` are pasted into the empty one at `at`: the
 * lines go, in order, into it and the empty options after it, skipping any
 * that already hold text (nothing typed is overwritten), then into new
 * options, up to `max`; lines past it are left out. `last` is the option
 * the last line went into.
 */
export function spreadOptions<O extends { text: string; correct: boolean }>(
  options: readonly O[],
  at: number,
  lines: readonly string[],
  max: number = OPTIONS_MAX
): { options: Array<O | { text: string; correct: boolean }>; last: number } {
  const next: Array<O | { text: string; correct: boolean }> = [...options];
  let i = at;
  let last = at;
  for (const line of lines) {
    while (i < next.length && next[i]?.text.trim() !== "") i += 1;
    if (i >= max) break;
    next[i] =
      i < next.length
        ? { ...(next[i] as O), text: line }
        : { text: line, correct: false };
    last = i;
    i += 1;
  }
  return { options: next, last };
}

/**
 * What saving does to the options as typed (MDRS-248): the empty ones are
 * left out, each correct mark going with its own option, so the letters
 * after an empty one move up. `gaps` is true when an empty option stands
 * before a typed one (the letters will move); `blankCorrect` is the index of
 * the first empty option marked correct, which blocks the save, or -1.
 */
export function optionsToSave(
  options: ReadonlyArray<{ text: string; correct: boolean }>
): {
  kept: Array<{ text: string; correct: boolean }>;
  gaps: boolean;
  blankCorrect: number;
} {
  const blank = (o: { text: string }) => o.text.trim() === "";
  let last = -1;
  options.forEach((o, i) => {
    if (!blank(o)) last = i;
  });
  return {
    kept: options
      .filter((o) => !blank(o))
      .map((o) => ({ text: o.text.trim(), correct: o.correct })),
    gaps: last > 0 && options.slice(0, last).some(blank),
    blankCorrect: options.findIndex((o) => blank(o) && o.correct),
  };
}

/** The catalog key that words a refusal. */
export function onlineExamErrorKey(code: string): string {
  switch (code) {
    case "EXAM_STALE":
      return "OnlineExams.stale";
    case "TOPIC_EXISTS":
      return "OnlineExams.topicExists";
    case "TOPIC_NUMBER_TAKEN":
      return "OnlineExams.topicNumberTaken";
    case "TOPIC_TOO_LONG":
      return "OnlineExams.topicTooLong";
    case "EXAM_NOT_READY":
      return "OnlineExams.notReadyRefused";
    case "EXAM_TIME_PASSED":
      return "OnlineExams.timePassed";
    case "EXAM_LOCKED":
      return "OnlineExams.locked";
    case "EXAM_NOT_PUBLISHED":
      return "OnlineExams.notPublished";
    case "QUESTION_MODE_INVALID":
      return "OnlineExams.modeInvalid";
    case "VALIDATION_ERROR":
      return "OnlineExams.pointsInvalid";
    case "AUTHZ_FORBIDDEN":
      return "Problems.actionForbidden";
    default:
      return "Problems.actionGeneric";
  }
}

export type Lack = "text" | "option" | "correct" | "topic";

/**
 * What a question still lacks, as the API's `lacksOf(q, kind)` says it: a
 * text, a second option, a correct one, and in an exam a topic. A çalışma
 * seti's question needs no topic (MDRS-248).
 */
export function lacksOf(
  q: {
    text: string;
    options: ReadonlyArray<{ text: string; correct: boolean }>;
    topicIds: readonly string[];
  },
  kind: ExamKind = "EXAM"
): Lack[] {
  const lacks: Lack[] = [];
  if (q.text.trim() === "") lacks.push("text");
  if (q.options.length < 2) lacks.push("option");
  if (!q.options.some((o) => o.correct)) lacks.push("correct");
  if (kind === "EXAM" && q.topicIds.length === 0) lacks.push("topic");
  return lacks;
}

/** The smallest number from 1 up that no topic holds, as the API gives a new topic. */
export const nextFreeNumber = (taken: Iterable<number>): number => {
  const held = new Set(taken);
  let n = 1;
  while (held.has(n)) n += 1;
  return n;
};

/** The refusals that mean the page no longer shows the exam as it stands: it is read again. */
export const READS_AGAIN = new Set([
  "EXAM_STALE",
  "EXAM_NOT_READY",
  "EXAM_LOCKED",
  "EXAM_NOT_PUBLISHED",
]);

export type AnswerModeValue = "SINGLE" | "MULTIPLE";
export type ScoringValue = "ALL_OR_NOTHING" | "IN_SHARES" | "ANY_CORRECT";

/**
 * As the API's `modeFits`: check boxes (MULTIPLE) only with two correct
 * options or more, and a scoring only with check boxes, where it is required.
 * Radio buttons fit any number of correct options.
 */
export const modeFits = (
  mode: AnswerModeValue,
  scoring: ScoringValue | null,
  correctCount: number
): boolean =>
  mode === "MULTIPLE"
    ? correctCount >= 2 && scoring !== null
    : scoring === null;

/** The points of an exam, in hundredths: 100 points. */
export const TOTAL_HUNDREDTHS = 10_000;

/**
 * As the API's `pointsFromText`: "12", "12,5" or "12.50" in hundredths; null
 * when it is not a number with at most two decimals from 0.01 to 100.
 */
export const pointsFromText = (text: string): number | null => {
  const m = /^([0-9]{1,3})(?:[.,]([0-9]{1,2}))?$/.exec(text.trim());
  if (!m) return null;
  const hundredths =
    Number(m[1]) * 100 + (m[2] ? Number(m[2].padEnd(2, "0")) : 0);
  return hundredths >= 1 && hundredths <= TOTAL_HUNDREDTHS ? hundredths : null;
};

/** Hundredths as the API takes points: "12.50". */
export const pointsText = (hundredths: number): string =>
  `${Math.floor(hundredths / 100)}.${String(hundredths % 100).padStart(2, "0")}`;

/** The API's own points ("12.50", or null) in hundredths. */
export const ownHundredthsOf = (points: string | null): number | null =>
  points === null ? null : pointsFromText(points);

/**
 * As the API's `sharePoints` and `shareText`: every question's points in
 * hundredths, its own or an equal share of what the own points leave of
 * 100, the share rounded half up to two decimals.
 */
export function sharesOf(
  questions: ReadonlyArray<{ key: string; own: number | null }>
): Map<string, { hundredths: number; own: boolean }> {
  const own = questions.reduce((sum, q) => sum + (q.own ?? 0), 0);
  const sharing = questions.filter((q) => q.own === null).length;
  const left = Math.max(TOTAL_HUNDREDTHS - own, 0);
  const denominator = Math.max(sharing, 1);
  const share = Math.floor((2 * left + denominator) / (2 * denominator));
  return new Map(
    questions.map((q) => [
      q.key,
      q.own === null
        ? { hundredths: share, own: false }
        : { hundredths: q.own, own: true },
    ])
  );
}

/** A length typed in minutes: a whole number above zero, with no upper bound; null when it is not one. */
export function minutesFromText(text: string): number | null {
  const typed = text.trim();
  if (!/^\d+$/.test(typed)) return null;
  const minutes = Number(typed);
  return Number.isSafeInteger(minutes) && minutes >= 1 ? minutes : null;
}

/** A question typed on the page that the server has not taken yet. */
export type UnsavedQuestion = {
  /** The server's id when the question exists there; "" for a new one. */
  id: string;
  text: string;
  options: Array<{ text: string; correct: boolean }>;
  topicIds: string[];
  answerMode: AnswerModeValue;
  scoring: ScoringValue | null;
  /** Own points in hundredths; null shares what the others leave. */
  points: number | null;
  /** Whether its talebe may write a note on it (MDRS-248); left out by an older page. */
  talebeNotes?: boolean;
};

const unsavedKey = (examId: string) => `exam-unsaved:${examId}`;

/**
 * The questions not yet saved, kept in the browser so a reload (a new
 * version of Medaris, a closed tab) does not lose what was typed.
 */
export function readUnsaved(
  examId: string,
  storage: Pick<Storage, "getItem">
): UnsavedQuestion[] {
  try {
    const raw = storage.getItem(unsavedKey(examId));
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as UnsavedQuestion[]) : [];
  } catch {
    return [];
  }
}

export function writeUnsaved(
  examId: string,
  questions: UnsavedQuestion[],
  storage: Pick<Storage, "setItem" | "removeItem">
): void {
  try {
    if (questions.length === 0) storage.removeItem(unsavedKey(examId));
    else storage.setItem(unsavedKey(examId), JSON.stringify(questions));
  } catch {
    // A full or blocked storage keeps the page working; nothing is kept.
  }
}
