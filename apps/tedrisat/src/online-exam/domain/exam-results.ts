/**
 * The course team's reading of an online exam (MDRS-299, nazar.exams.results):
 * how each answer stands, each talebe's counts and standing by topic, each
 * question's share answered right, the class's standing by topic, and when
 * the exam has closed for everyone. The contract is
 * `graphs/domain/planned-exams.yaml` (getOnlineExamResults).
 *
 * Everything here is pure.
 */
import { earnedPart, type ScoredQuestion } from "./exam-attempt";
import { sharePoints } from "./online-exam";

/** How one answer stands: every point earned, nothing chosen, or anything else (a partial share included). */
export enum AnswerVerdict {
  RIGHT = "RIGHT",
  WRONG = "WRONG",
  BLANK = "BLANK",
}

/** Where a seated talebe stands on the exam; MISSED once it has closed without them. */
export enum TalebeExamState {
  NOT_STARTED = "NOT_STARTED",
  IN_PROGRESS = "IN_PROGRESS",
  FINISHED = "FINISHED",
  MISSED = "MISSED",
}

/** How often the results page reads again while the exam is still open, in seconds. */
export const RESULTS_REFRESH_SECONDS = 30;

export interface ResultQuestion extends ScoredQuestion {
  topicIds: readonly string[];
}

export const verdictOf = (
  q: ScoredQuestion,
  chosen: readonly string[]
): AnswerVerdict => {
  if (chosen.length === 0) return AnswerVerdict.BLANK;
  const part = earnedPart(q, chosen);
  return part.numerator > 0 && part.numerator === part.denominator
    ? AnswerVerdict.RIGHT
    : AnswerVerdict.WRONG;
};

/** A whole percent of `part` over `whole`, half up; null when there is no whole. */
export const percentOf = (part: number, whole: number): number | null =>
  whole > 0 ? Math.floor((100 * part) / whole + 0.5) : null;

/** The average of the given whole percents, half up; null when there are none. */
export const averagePercent = (
  values: ReadonlyArray<number | null>
): number | null => {
  const known = values.filter((v): v is number => v !== null);
  if (known.length === 0) return null;
  return Math.floor(known.reduce((a, b) => a + b, 0) / known.length + 0.5);
};

export interface AttemptTally {
  right: number;
  wrong: number;
  blank: number;
  verdicts: Map<string, AnswerVerdict>;
  /** For every topic a question carries: the share of its points this talebe earned. */
  topics: Map<string, number | null>;
}

/**
 * One finished attempt's counts and standing by topic. A question's points
 * are its own, or its share of what the own points leave (`sharePoints`); a
 * topic's standing is what was earned on the questions carrying it over what
 * those questions are worth.
 */
export const tallyAttempt = (
  questions: readonly ResultQuestion[],
  answers: ReadonlyMap<string, readonly string[]>
): AttemptTally => {
  const { points } = sharePoints(
    questions.map((q) => ({ id: q.id, ownHundredths: q.ownHundredths }))
  );
  const tally: AttemptTally = {
    right: 0,
    wrong: 0,
    blank: 0,
    verdicts: new Map(),
    topics: new Map(),
  };
  const worth = new Map<string, number>();
  const earned = new Map<string, number>();
  for (const q of questions) {
    const chosen = answers.get(q.id) ?? [];
    const verdict = verdictOf(q, chosen);
    tally.verdicts.set(q.id, verdict);
    if (verdict === AnswerVerdict.RIGHT) tally.right += 1;
    else if (verdict === AnswerVerdict.WRONG) tally.wrong += 1;
    else tally.blank += 1;
    const p = points.get(q.id);
    const value = p ? p.numerator / p.denominator : 0;
    const part = earnedPart(q, chosen);
    const got = (value * part.numerator) / part.denominator;
    for (const topicId of q.topicIds) {
      worth.set(topicId, (worth.get(topicId) ?? 0) + value);
      earned.set(topicId, (earned.get(topicId) ?? 0) + got);
    }
  }
  for (const [topicId, whole] of worth) {
    tally.topics.set(topicId, percentOf(earned.get(topicId) ?? 0, whole));
  }
  return tally;
};

/**
 * Whether the exam has closed for everyone: closed early, or past its latest
 * start with no attempt still in progress. An attempt whose page went away is
 * in progress until the team closes the exam early: the clock does not run
 * while the connection is lost (the owner, 21 Nov 2026).
 */
export const closedForEveryone = (
  now: Date,
  latestStartAt: Date,
  closedEarlyAt: Date | null,
  inProgress: number
): boolean =>
  (closedEarlyAt !== null && closedEarlyAt.getTime() <= now.getTime()) ||
  (now.getTime() > latestStartAt.getTime() && inProgress === 0);

/**
 * Whether the team may close the exam early: it has opened, it is not closed
 * yet, and someone may still start it or is still in it.
 */
export const mayCloseEarly = (
  now: Date,
  startsAt: Date,
  latestStartAt: Date,
  closedEarlyAt: Date | null,
  inProgress: number
): boolean =>
  closedEarlyAt === null &&
  now.getTime() >= startsAt.getTime() &&
  !closedForEveryone(now, latestStartAt, null, inProgress);

/** A score in hundredths as Değerlendirme keeps it, a whole number, half up: 87.50 is 88. */
export const wholeScore = (hundredths: number): number =>
  Math.floor((hundredths + 50) / 100);
