/**
 * The pure rules of the exam page (MDRS-299, `graphs/tedris/exams/take`):
 * the countdown's text and its last five minutes, where "Sonraki" goes after
 * the last question, what the list says of each question, and the id this
 * tab holds the attempt by.
 */

/** The countdown turns red, and says so, in the last five minutes. */
export const LAST_FIVE_SECONDS = 5 * 60;

/** How often the page counts the clock with the server, in milliseconds. */
export const TICK_MS = 10_000;

/** "12:05", or "1:02:05" past an hour. */
export const clockText = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${rest}` : `${m}:${rest}`;
};

export interface LocalAnswer {
  optionIds: string[];
  skipped: boolean;
}

export type QuestionState = "answered" | "skipped" | "unseen";

export const stateOf = (answer: LocalAnswer | undefined): QuestionState => {
  if (!answer) return "unseen";
  if (answer.optionIds.length > 0) return "answered";
  return answer.skipped ? "skipped" : "unseen";
};

/**
 * Where "Sonraki" or "Soruyu atla" goes from question `index`: the next one,
 * and after the last the first skipped one left unanswered, which then come
 * back in order. Null when nothing is left to go to.
 */
export const nextIndex = (
  ids: readonly string[],
  answers: ReadonlyMap<string, LocalAnswer>,
  index: number
): number | null => {
  if (index + 1 < ids.length) return index + 1;
  const skipped = ids.findIndex(
    (id, i) => i !== index && stateOf(answers.get(id)) === "skipped"
  );
  return skipped === -1 ? null : skipped;
};

/** The id this tab holds the attempt by: drawn once per tab, kept for the tab's life. */
export const holderIdFor = (lessonId: string, storage: Storage): string => {
  const key = `exam-holder:${lessonId}`;
  const held = storage.getItem(key);
  if (held) return held;
  const drawn = `tab-${crypto.randomUUID()}`;
  storage.setItem(key, drawn);
  return drawn;
};

export type TakeErrorKey =
  | "errorNotOpen"
  | "startHint"
  | "alreadyTaken"
  | "errorZerothLocked"
  | "errorFailed";

/** The message key, under `tedrisLearn.OnlineExam`, for a refusal of the API. */
export const takeErrorKey = (code: string | undefined): TakeErrorKey => {
  switch (code) {
    case "EXAM_NOT_OPEN":
      return "errorNotOpen";
    case "ZEROTH_UNANSWERED":
      return "startHint";
    case "EXAM_ALREADY_TAKEN":
      return "alreadyTaken";
    case "ZEROTH_ANSWER_LOCKED":
      return "errorZerothLocked";
    default:
      return "errorFailed";
  }
};
