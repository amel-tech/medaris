/**
 * A talebe's own result of an online exam (MDRS-299): how each question
 * went, the counts, and the standing in each topic, as a percentage of the
 * points that topic's questions carry (the owner, 21 Nov 2026: "Yalnız
 * yüzde"). The contract is `getMyExamResult` and `getMyTopicStanding` of
 * `graphs/domain/planned-exams.yaml`; the screens are `graphs/tedris/exams/result`.
 *
 * Everything here is pure, and every sum is kept exact as a fraction until
 * it is shown, as the score is.
 */
import { earnedPart, type ScoredQuestion } from "./exam-attempt";
import { pointsText, sharePoints } from "./online-exam";

/** Right when it got all its points, blank when nothing was chosen, wrong otherwise. */
export enum QuestionOutcome {
  RIGHT = "RIGHT",
  WRONG = "WRONG",
  BLANK = "BLANK",
}

/** An exact non-negative fraction. */
export interface Fraction {
  n: bigint;
  d: bigint;
}

const ZERO: Fraction = { n: BigInt(0), d: BigInt(1) };

const gcd = (a: bigint, b: bigint): bigint => {
  let x = a < BigInt(0) ? -a : a;
  let y = b < BigInt(0) ? -b : b;
  while (y !== BigInt(0)) [x, y] = [y, x % y];
  return x === BigInt(0) ? BigInt(1) : x;
};

const reduce = ({ n, d }: Fraction): Fraction => {
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
};

export const addFractions = (a: Fraction, b: Fraction): Fraction =>
  reduce({ n: a.n * b.d + b.n * a.d, d: a.d * b.d });

const times = (a: Fraction, b: Fraction): Fraction =>
  reduce({ n: a.n * b.n, d: a.d * b.d });

/** `n / d` rounded half up to a whole number. */
const roundHalfUp = ({ n, d }: Fraction): bigint =>
  (BigInt(2) * n + d) / (BigInt(2) * d);

/** Exact hundredths as the API writes points: "33.33". */
export const fractionText = (hundredths: Fraction): string =>
  pointsText(Number(roundHalfUp(hundredths)));

/** `got` as a whole percentage of `carried`, rounded half up; 0 when nothing is carried. */
export const percentOf = (got: Fraction, carried: Fraction): number =>
  carried.n === BigInt(0)
    ? 0
    : Number(
        roundHalfUp({
          n: BigInt(100) * got.n * carried.d,
          d: got.d * carried.n,
        })
      );

/**
 * How one question went: blank when nothing was chosen; right when the
 * answer earned all its points; wrong otherwise, a question in shares that
 * earned only part of them included.
 */
export const outcomeOf = (
  q: ScoredQuestion,
  chosen: readonly string[]
): QuestionOutcome => {
  if (chosen.length === 0) return QuestionOutcome.BLANK;
  const part = earnedPart(q, chosen);
  return part.numerator > 0 && part.numerator === part.denominator
    ? QuestionOutcome.RIGHT
    : QuestionOutcome.WRONG;
};

export interface QuestionResult {
  outcome: QuestionOutcome;
  /** The question's points, in exact hundredths. */
  points: Fraction;
  /** What the answer earned of them, in exact hundredths. */
  got: Fraction;
}

/** Every question's points, what its answer earned of them, and how it went. */
export const questionResults = (
  questions: readonly ScoredQuestion[],
  answers: ReadonlyMap<string, readonly string[]>
): Map<string, QuestionResult> => {
  const { points } = sharePoints(
    questions.map((q) => ({ id: q.id, ownHundredths: q.ownHundredths }))
  );
  const results = new Map<string, QuestionResult>();
  for (const q of questions) {
    const p = points.get(q.id);
    const own: Fraction = p
      ? reduce({ n: BigInt(p.numerator), d: BigInt(p.denominator) })
      : ZERO;
    const chosen = answers.get(q.id) ?? [];
    const part = earnedPart(q, chosen);
    results.set(q.id, {
      outcome: outcomeOf(q, chosen),
      points: own,
      got: times(own, {
        n: BigInt(part.numerator),
        d: BigInt(part.denominator),
      }),
    });
  }
  return results;
};

export interface Counts {
  right: number;
  wrong: number;
  blank: number;
}

export const countsOf = (results: Iterable<QuestionResult>): Counts => {
  const counts = { right: 0, wrong: 0, blank: 0 };
  for (const r of results) {
    if (r.outcome === QuestionOutcome.RIGHT) counts.right += 1;
    else if (r.outcome === QuestionOutcome.WRONG) counts.wrong += 1;
    else counts.blank += 1;
  }
  return counts;
};

/** A topic's points carried and got in one exam, and how its questions went. */
export interface TopicTally extends Counts {
  got: Fraction;
  carried: Fraction;
}

/**
 * Each topic's tally in one exam. A question with two topics counts in both,
 * with all its points in each.
 */
export const tallyByTopic = (
  questions: ReadonlyArray<{ id: string; topicIds: readonly string[] }>,
  results: ReadonlyMap<string, QuestionResult>
): Map<string, TopicTally> => {
  const tallies = new Map<string, TopicTally>();
  for (const q of questions) {
    const r = results.get(q.id);
    if (!r) continue;
    for (const topicId of new Set(q.topicIds)) {
      const t = tallies.get(topicId) ?? {
        got: ZERO,
        carried: ZERO,
        right: 0,
        wrong: 0,
        blank: 0,
      };
      tallies.set(topicId, {
        got: addFractions(t.got, r.got),
        carried: addFractions(t.carried, r.points),
        right: t.right + (r.outcome === QuestionOutcome.RIGHT ? 1 : 0),
        wrong: t.wrong + (r.outcome === QuestionOutcome.WRONG ? 1 : 0),
        blank: t.blank + (r.outcome === QuestionOutcome.BLANK ? 1 : 0),
      });
    }
  }
  return tallies;
};

/** A topic's standing over several exams: points got of points carried, and how many exams asked about it. */
export interface CourseTally {
  got: Fraction;
  carried: Fraction;
  exams: number;
}

/** The exams' topic tallies summed per topic, exactly. */
export const courseTallies = (
  perExam: Iterable<ReadonlyMap<string, TopicTally>>
): Map<string, CourseTally> => {
  const sum = new Map<string, CourseTally>();
  for (const tallies of perExam) {
    for (const [topicId, t] of tallies) {
      const s = sum.get(topicId) ?? { got: ZERO, carried: ZERO, exams: 0 };
      sum.set(topicId, {
        got: addFractions(s.got, t.got),
        carried: addFractions(s.carried, t.carried),
        exams: s.exams + 1,
      });
    }
  }
  return sum;
};

/** The exact sum of what every question's answer earned: the score, before it is rounded to be shown. */
export const totalGot = (results: Iterable<QuestionResult>): Fraction => {
  let sum = ZERO;
  for (const r of results) sum = addFractions(sum, r.got);
  return sum;
};

/** A topic's points got in one exam, or none when the exam did not ask about it. */
export const gotIn = (
  tallies: ReadonlyMap<string, TopicTally>,
  topicId: string
): Fraction => tallies.get(topicId)?.got ?? ZERO;

const compare = (a: Fraction, b: Fraction): number => {
  const left = a.n * b.d;
  const right = b.n * a.d;
  return left > right ? 1 : left < right ? -1 : 0;
};

/**
 * Where one talebe stands among those who took the exam (the owner, 22 Nov
 * 2026: "sınava şu kadar kişi girdi, senin puanın şu, bu kadar kişiden şu
 * sıradasınız"; and for those with the same points, "şu kadar kişi sizinle
 * aynı puanı aldı"). Standard competition ranking: one plus those with
 * strictly more points, so a tie shares its rank (1, 2, 2, 4). Points are
 * compared exactly, as they are kept, not as they are rounded to be shown.
 * `all` holds every participant's points, the caller's own included; only
 * these counts leave here, never another talebe's points.
 */
export interface Standing {
  /** How many took the exam. */
  taken: number;
  rank: number;
  /** How many others got exactly the same points. */
  tiedWith: number;
}

export const standingOf = (
  mine: Fraction,
  all: readonly Fraction[]
): Standing => {
  let ahead = 0;
  let same = 0;
  for (const points of all) {
    const c = compare(points, mine);
    if (c > 0) ahead += 1;
    else if (c === 0) same += 1;
  }
  return {
    taken: all.length,
    rank: ahead + 1,
    tiedWith: Math.max(same - 1, 0),
  };
};
