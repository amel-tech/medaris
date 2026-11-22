import { describe, expect, it } from "vitest";
import {
  AnswerVerdict,
  averagePercent,
  closedForEveryone,
  earnedHundredths,
  mayCloseEarly,
  percentOf,
  type ResultQuestion,
  tallyAttempt,
  verdictOf,
  wholeScore,
} from "../../../src/online-exam/domain/exam-results";
import {
  AnswerMode,
  Scoring,
} from "../../../src/online-exam/domain/online-exam";

const at = (iso: string) => new Date(iso);

const question = (
  id: string,
  correct: string[],
  all: string[],
  topicIds: string[],
  extra: Partial<ResultQuestion> = {}
): ResultQuestion => ({
  id,
  answerMode: AnswerMode.SINGLE,
  scoring: null,
  ownHundredths: null,
  options: all.map((o) => ({ id: o, correct: correct.includes(o) })),
  topicIds,
  ...extra,
});

describe("an online exam's results (MDRS-299)", () => {
  it("calls an answer right only when it earns every point", () => {
    const radio = question("q", ["a"], ["a", "b"], []);
    expect(verdictOf(radio, ["a"])).toBe(AnswerVerdict.RIGHT);
    expect(verdictOf(radio, ["b"])).toBe(AnswerVerdict.WRONG);
    expect(verdictOf(radio, [])).toBe(AnswerVerdict.BLANK);
    const shares = question("m", ["a", "b"], ["a", "b", "c"], [], {
      answerMode: AnswerMode.MULTIPLE,
      scoring: Scoring.IN_SHARES,
    });
    // Half the points is not right.
    expect(verdictOf(shares, ["a"])).toBe(AnswerVerdict.WRONG);
    expect(verdictOf(shares, ["a", "b"])).toBe(AnswerVerdict.RIGHT);
  });

  it("counts an attempt and its standing by topic, from the points each question is worth", () => {
    // 100 points: q1 own 60, q2 and q3 share 40 (20 each).
    const questions = [
      question("q1", ["a"], ["a", "b"], ["t1"], { ownHundredths: 6000 }),
      question("q2", ["a"], ["a", "b"], ["t1", "t2"]),
      question("q3", ["a"], ["a", "b"], ["t2"]),
    ];
    const tally = tallyAttempt(
      questions,
      new Map([
        ["q1", ["a"]],
        ["q2", ["b"]],
      ])
    );
    expect([tally.right, tally.wrong, tally.blank]).toEqual([1, 1, 1]);
    // t1: 60 of 80; t2: 0 of 40.
    expect(tally.topics.get("t1")).toBe(75);
    expect(tally.topics.get("t2")).toBe(0);
  });

  it("rounds percents and averages half up, and has none without a whole", () => {
    expect(percentOf(1, 3)).toBe(33);
    expect(percentOf(1, 8)).toBe(13);
    expect(percentOf(1, 0)).toBeNull();
    expect(averagePercent([50, 51, null])).toBe(51);
    expect(averagePercent([null])).toBeNull();
  });

  it("closes for everyone when closed early, or past the latest start with no one in it", () => {
    const latest = at("2026-11-28T20:10:00Z");
    const after = at("2026-11-28T20:30:00Z");
    expect(closedForEveryone(after, latest, null, 0)).toBe(true);
    // Someone whose page went away is still in it.
    expect(closedForEveryone(after, latest, null, 1)).toBe(false);
    expect(
      closedForEveryone(
        at("2026-11-28T20:05:00Z"),
        latest,
        at("2026-11-28T20:04:00Z"),
        3
      )
    ).toBe(true);
  });

  it("closes early only an exam that has opened and is not closed", () => {
    const starts = at("2026-11-28T20:00:00Z");
    const latest = at("2026-11-28T20:10:00Z");
    expect(
      mayCloseEarly(at("2026-11-28T19:59:00Z"), starts, latest, null, 0)
    ).toBe(false);
    expect(
      mayCloseEarly(at("2026-11-28T20:05:00Z"), starts, latest, null, 0)
    ).toBe(true);
    expect(
      mayCloseEarly(at("2026-11-28T20:40:00Z"), starts, latest, null, 2)
    ).toBe(true);
    expect(
      mayCloseEarly(at("2026-11-28T20:40:00Z"), starts, latest, null, 0)
    ).toBe(false);
    expect(
      mayCloseEarly(
        at("2026-11-28T20:05:00Z"),
        starts,
        latest,
        at("2026-11-28T20:04:00Z"),
        1
      )
    ).toBe(false);
  });

  it("keeps a score in Değerlendirme as a whole number, half up", () => {
    expect(wholeScore(8750)).toBe(88);
    expect(wholeScore(8749)).toBe(87);
    expect(wholeScore(10_000)).toBe(100);
    expect(wholeScore(0)).toBe(0);
  });

  it("gives an answer the part of its exact points it earned, rounded half up once", () => {
    const third = { numerator: 10_000, denominator: 3 }; // 33.333… points
    expect(earnedHundredths(third, { numerator: 1, denominator: 1 })).toBe(
      3333
    );
    expect(earnedHundredths(third, { numerator: 1, denominator: 2 })).toBe(
      1667
    );
    expect(earnedHundredths(third, { numerator: 0, denominator: 1 })).toBe(0);
    expect(earnedHundredths(undefined, { numerator: 1, denominator: 1 })).toBe(
      0
    );
  });
});
