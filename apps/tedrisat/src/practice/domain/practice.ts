/**
 * Çalışma soruları (MDRS-248): a talebe solves a published çalışma seti of a
 * course whenever they like, as often as they like, and sees at once how it
 * went and the correct options. Every question weighs the same; the part of
 * a question an answer gets is the exam's own (`earnedPart`).
 *
 * Everything here is pure.
 */
import {
  earnedPart,
  type ScoredQuestion,
} from "../../online-exam/domain/exam-attempt";
import {
  ExamKind,
  lacksOf,
  pointsText,
} from "../../online-exam/domain/online-exam";

/**
 * How a solving of the course's question pool was drawn (MDRS-248 Faz 4):
 * every question of the course's published sets, or some at random.
 */
export enum PoolMode {
  ALL = "ALL",
  RANDOM = "RANDOM",
}

/** How one question of a finished attempt went. */
export enum PracticeOutcome {
  CORRECT = "CORRECT",
  WRONG = "WRONG",
  BLANK = "BLANK",
}

/** A practice attempt is in progress until the talebe finishes it. */
export enum PracticeAttemptStatus {
  IN_PROGRESS = "IN_PROGRESS",
  FINISHED = "FINISHED",
}

export interface Part {
  numerator: number;
  denominator: number;
}

/**
 * Whether a question as the list reads it (its text and how many options,
 * correct options and topics it has) is complete, by the çalışma seti's
 * rule (`lacksOf` for PRACTICE, where a topic is not needed): only complete
 * questions are solved.
 */
export const isCompleteCounted = (q: {
  text: string;
  options: number;
  correct: number;
  topics: number;
}): boolean =>
  lacksOf(
    {
      text: q.text,
      options: Array.from({ length: q.options }, (_, i) => ({
        text: "",
        correct: i < q.correct,
      })),
      topicIds: Array.from({ length: q.topics }, (_, i) => String(i)),
    },
    ExamKind.PRACTICE
  ).length === 0;

/**
 * How an answer did: blank when nothing is chosen, correct when it gets the
 * whole question, wrong otherwise (a part of it under IN_SHARES included).
 */
export const outcomeOf = (
  chosen: readonly string[],
  part: Part
): PracticeOutcome => {
  if (chosen.length === 0) return PracticeOutcome.BLANK;
  return part.numerator > 0 && part.numerator === part.denominator
    ? PracticeOutcome.CORRECT
    : PracticeOutcome.WRONG;
};

/** A part of one question with two decimals, rounded half up: 1/3 is "0.33". */
export const partText = (part: Part): string =>
  pointsText(
    Math.floor(
      (2 * part.numerator * 100 + part.denominator) / (2 * part.denominator)
    )
  );

export interface PracticeQuestionResult {
  outcome: PracticeOutcome;
  part: Part;
}

export interface PracticeResult {
  questions: Map<string, PracticeQuestionResult>;
  correct: number;
  wrong: number;
  blank: number;
  /** The share of the questions got, in hundredths of a percent: every question weighs the same. */
  scoreHundredths: number;
}

const gcd = (a: bigint, b: bigint): bigint => {
  let x = a < BigInt(0) ? -a : a;
  let y = b < BigInt(0) ? -b : b;
  while (y !== BigInt(0)) [x, y] = [y, x % y];
  return x;
};

/**
 * The result of an attempt: each question's outcome and part, the counts,
 * and the parts summed exactly over the number of questions, as a
 * percentage in hundredths rounded half up once. No question is 0.
 */
export const practiceResult = (
  questions: readonly ScoredQuestion[],
  answers: ReadonlyMap<string, readonly string[]>
): PracticeResult => {
  const results = new Map<string, PracticeQuestionResult>();
  let correct = 0;
  let wrong = 0;
  let blank = 0;
  let num = BigInt(0);
  let den = BigInt(1);
  for (const q of questions) {
    const chosen = answers.get(q.id) ?? [];
    const part = earnedPart(q, chosen);
    const outcome = outcomeOf(chosen, part);
    if (outcome === PracticeOutcome.CORRECT) correct += 1;
    else if (outcome === PracticeOutcome.WRONG) wrong += 1;
    else blank += 1;
    results.set(q.id, { outcome, part });
    if (part.numerator === 0) continue;
    const n = BigInt(part.numerator);
    const d = BigInt(part.denominator);
    num = num * d + n * den;
    den *= d;
    const g = gcd(num, den);
    num /= g;
    den /= g;
  }
  if (questions.length === 0) {
    return { questions: results, correct, wrong, blank, scoreHundredths: 0 };
  }
  // (num / den) / n of 10000, rounded half up.
  const top = num * BigInt(10_000);
  const bottom = den * BigInt(questions.length);
  return {
    questions: results,
    correct,
    wrong,
    blank,
    scoreHundredths: Number((BigInt(2) * top + bottom) / (BigInt(2) * bottom)),
  };
};

/** The most questions a random pool attempt is offered by default. */
export const POOL_RANDOM_DEFAULT = 50;

/**
 * Whether a pool attempt may be drawn: ALL from a pool with a question in
 * it; RANDOM with a whole count from 1 to the pool's size.
 */
export const poolCountFits = (
  mode: PoolMode,
  count: number | undefined,
  poolSize: number
): boolean =>
  mode === PoolMode.ALL
    ? poolSize > 0
    : count !== undefined &&
      Number.isInteger(count) &&
      count >= 1 &&
      count <= poolSize;

/**
 * The questions of a pool attempt, in its order: every one under ALL, the
 * first `count` of a random order under RANDOM, so none twice. `shuffle`
 * is the attempt's draw (`drawOrder`).
 */
export const drawPool = <T>(
  ids: readonly T[],
  mode: PoolMode,
  count: number | undefined,
  shuffle: (ids: readonly T[]) => T[]
): T[] => {
  const order = shuffle(ids);
  return mode === PoolMode.ALL ? order : order.slice(0, count);
};
