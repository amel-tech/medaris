/**
 * A talebe's sitting of an online exam (MDRS-299): the window they may start
 * in, the server's clock, their own order of the questions and options, what
 * an answer may be, and the score. The contract is
 * `graphs/domain/planned-exams.yaml`; the screens are `graphs/tedris/exams/take`.
 *
 * Everything here is pure.
 */
import { AnswerMode, Scoring, sharePoints } from "./online-exam";

/** Who or what ended an attempt: the talebe ("Sınavı bitir"), the time, or the team closing the exam early. */
export enum FinishedBy {
  TALEBE = "TALEBE",
  TIME = "TIME",
  CLOSED_EARLY = "CLOSED_EARLY",
}

/** An attempt is in progress until it is finished. */
export enum AttemptStatus {
  IN_PROGRESS = "IN_PROGRESS",
  FINISHED = "FINISHED",
}

/** Before the earliest start, between it and the latest start, or after. */
export enum ExamWindow {
  BEFORE = "BEFORE",
  OPEN = "OPEN",
  CLOSED = "CLOSED",
}

/** When the latest start is not set, it is this long after the earliest (nazar.exams.publish D1, 22 Nov 2026). */
export const LATEST_START_DEFAULT_MINUTES = 10;

/** How often the holding page counts the clock, in seconds. */
export const CLOCK_TICK_SECONDS = 10;

/**
 * The most one call of the holding page adds to the clock. The clock does
 * not run while the connection is lost (the owner, 21 Nov 2026): a page that
 * lost it takes the attempt back with `resume`, which adds nothing, and a
 * page that has not called for longer than this was not connected. It is
 * well above the tick because a browser slows the timers of a hidden tab to
 * about once a minute.
 */
export const CLOCK_CREDIT_MAX_SECONDS = 90;

/** The holder id a page draws for itself: 8 to 64 characters. */
export const HOLDER_ID_MIN = 8;
export const HOLDER_ID_MAX = 64;

/** The latest start the exam keeps, or its default after the earliest. */
export const latestStartOf = (
  startsAt: Date,
  latestStartAt: Date | null
): Date =>
  latestStartAt ??
  new Date(startsAt.getTime() + LATEST_START_DEFAULT_MINUTES * 60_000);

/** Where the exam stands for starting it: an early close closes it at once. */
export const examWindow = (
  now: Date,
  startsAt: Date,
  latestStartAt: Date,
  closedEarlyAt: Date | null
): ExamWindow => {
  if (closedEarlyAt !== null && closedEarlyAt.getTime() <= now.getTime()) {
    return ExamWindow.CLOSED;
  }
  if (now.getTime() < startsAt.getTime()) return ExamWindow.BEFORE;
  if (now.getTime() > latestStartAt.getTime()) return ExamWindow.CLOSED;
  return ExamWindow.OPEN;
};

/**
 * The seconds a call of the holding page adds to the clock: the time since
 * the last count, whole seconds, at most `cap`.
 */
export const creditedSeconds = (
  countedAt: Date,
  now: Date,
  cap: number = CLOCK_CREDIT_MAX_SECONDS
): number =>
  Math.max(
    0,
    Math.min(Math.floor((now.getTime() - countedAt.getTime()) / 1000), cap)
  );

/** What is left of the exam's length after the seconds used, never below 0. */
export const secondsLeft = (durationMinutes: number, usedSeconds: number) =>
  Math.max(0, durationMinutes * 60 - usedSeconds);

/** The ids in an order of the talebe's own (Fisher–Yates), drawn with `random` in [0, 1). */
export const drawOrder = <T>(ids: readonly T[], random: () => number): T[] => {
  const order = [...ids];
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
};

/**
 * Whether an answer fits its question: only the question's own options, no
 * option twice, and at most one for a SINGLE question. None is a cleared or
 * skipped answer.
 */
export const answerFits = (
  mode: AnswerMode,
  optionIds: readonly string[],
  questionOptionIds: readonly string[]
): boolean => {
  const own = new Set(questionOptionIds);
  if (new Set(optionIds).size !== optionIds.length) return false;
  if (!optionIds.every((id) => own.has(id))) return false;
  return mode === AnswerMode.MULTIPLE || optionIds.length <= 1;
};

export interface ScoredQuestion {
  id: string;
  answerMode: AnswerMode;
  scoring: Scoring | null;
  ownHundredths: number | null;
  options: ReadonlyArray<{ id: string; correct: boolean }>;
}

/**
 * The part of a question's points an answer earns, as a fraction:
 * - SINGLE: all of it when the one option chosen is a correct one; any
 *   correct option gets the points;
 * - MULTIPLE, all or nothing: all of it when exactly the correct options are
 *   marked;
 * - MULTIPLE, in shares: each correct mark an equal share, each wrong mark a
 *   share off, never below 0.
 */
export const earnedPart = (
  q: ScoredQuestion,
  chosen: readonly string[]
): { numerator: number; denominator: number } => {
  const correct = new Set(q.options.filter((o) => o.correct).map((o) => o.id));
  const right = chosen.filter((id) => correct.has(id)).length;
  const wrong = chosen.length - right;
  if (correct.size === 0) return { numerator: 0, denominator: 1 };
  if (q.answerMode === AnswerMode.SINGLE) {
    return {
      numerator: chosen.length === 1 && right === 1 ? 1 : 0,
      denominator: 1,
    };
  }
  if (q.scoring === Scoring.IN_SHARES) {
    return { numerator: Math.max(0, right - wrong), denominator: correct.size };
  }
  return {
    numerator: wrong === 0 && right === correct.size ? 1 : 0,
    denominator: 1,
  };
};

const gcd = (a: bigint, b: bigint): bigint => {
  let x = a < BigInt(0) ? -a : a;
  let y = b < BigInt(0) ? -b : b;
  while (y !== BigInt(0)) [x, y] = [y, x % y];
  return x;
};

/**
 * The score in hundredths (decision 4): every question's exact points (its
 * own, or its share of what the own points leave of 100, a fraction) times
 * the part its answer earns, summed exactly, then rounded half up once.
 */
export const scoreHundredths = (
  questions: readonly ScoredQuestion[],
  answers: ReadonlyMap<string, readonly string[]>
): number => {
  const { points } = sharePoints(
    questions.map((q) => ({ id: q.id, ownHundredths: q.ownHundredths }))
  );
  let num = BigInt(0);
  let den = BigInt(1);
  for (const q of questions) {
    const p = points.get(q.id);
    if (!p) continue;
    const part = earnedPart(q, answers.get(q.id) ?? []);
    if (part.numerator === 0) continue;
    const n = BigInt(p.numerator) * BigInt(part.numerator);
    const d = BigInt(p.denominator) * BigInt(part.denominator);
    num = num * d + n * den;
    den *= d;
    const g = gcd(num, den);
    num /= g;
    den /= g;
  }
  return Number((BigInt(2) * num + den) / (BigInt(2) * den));
};
