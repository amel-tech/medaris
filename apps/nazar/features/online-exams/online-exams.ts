import type {
  DraftCourseTopicResponse,
  ExamKind,
} from "@medaris/services/tedrisat";

/** The course page a kind is prepared under: "Sınavlar", or "Çalışma Soruları" for a set (MDRS-248). */
export const segmentOf = (kind: ExamKind): string =>
  kind === "PRACTICE" ? "calisma-sorulari" : "sinavlar";

/** The option fields a new question shows (the owner: five). */
export const OPTION_FIELDS = 5;

/** "3, 7" → the topics of those numbers, and the numbers no topic has. */
export function topicsByNumbers(
  text: string,
  topics: readonly DraftCourseTopicResponse[]
): { ids: string[]; unknown: number[] } {
  const ids: string[] = [];
  const unknown: number[] = [];
  for (const part of text.split(/[\s,;]+/).filter(Boolean)) {
    const n = Number(part);
    const topic = topics.find((t) => t.number === n);
    if (!Number.isInteger(n) || !topic) unknown.push(n);
    else if (!ids.includes(topic.id)) ids.push(topic.id);
  }
  return { ids, unknown };
}

/** The topics' numbers as the field shows them: "3, 7". */
export const numbersOf = (
  ids: readonly string[],
  topics: readonly DraftCourseTopicResponse[]
): string =>
  topics
    .filter((t) => ids.includes(t.id))
    .map((t) => t.number)
    .join(", ");

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

/** What a question still lacks, as the API says it (text, a second option, a correct one, a topic). */
export function lacksOf(q: {
  text: string;
  options: ReadonlyArray<{ text: string; correct: boolean }>;
  topicIds: readonly string[];
}): Lack[] {
  const lacks: Lack[] = [];
  if (q.text.trim() === "") lacks.push("text");
  if (q.options.length < 2) lacks.push("option");
  if (!q.options.some((o) => o.correct)) lacks.push("correct");
  if (q.topicIds.length === 0) lacks.push("topic");
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
