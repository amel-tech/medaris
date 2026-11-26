import { describe, expect, it } from "vitest";
import {
  answerFits,
  creditedSeconds,
  drawOrder,
  ExamWindow,
  earnedPart,
  examWindow,
  latestStartOf,
  type ScoredQuestion,
  scoreHundredths,
  secondsLeft,
} from "../../../src/online-exam/domain/exam-attempt";
import {
  AnswerMode,
  Scoring,
} from "../../../src/online-exam/domain/online-exam";

const at = (iso: string) => new Date(iso);

const single = (
  id: string,
  correct: string[],
  all: string[]
): ScoredQuestion => ({
  id,
  answerMode: AnswerMode.SINGLE,
  scoring: null,
  ownHundredths: null,
  options: all.map((o) => ({ id: o, correct: correct.includes(o) })),
});
const multiple = (
  id: string,
  scoring: Scoring,
  correct: string[],
  all: string[],
  ownHundredths: number | null = null
): ScoredQuestion => ({
  id,
  answerMode: AnswerMode.MULTIPLE,
  scoring,
  ownHundredths,
  options: all.map((o) => ({ id: o, correct: correct.includes(o) })),
});

describe("a talebe's sitting of an online exam (MDRS-299)", () => {
  it("opens between the earliest and the latest start, which is 10 minutes later unless set", () => {
    const starts = at("2026-12-01T09:00:00Z");
    const latest = latestStartOf(starts, null);
    expect(latest.toISOString()).toBe("2026-12-01T09:10:00.000Z");
    expect(examWindow(at("2026-12-01T08:59:59Z"), starts, latest, null)).toBe(
      ExamWindow.BEFORE
    );
    expect(examWindow(at("2026-12-01T09:10:00Z"), starts, latest, null)).toBe(
      ExamWindow.OPEN
    );
    expect(examWindow(at("2026-12-01T09:10:01Z"), starts, latest, null)).toBe(
      ExamWindow.CLOSED
    );
    // An early close closes it at once.
    expect(
      examWindow(
        at("2026-12-01T09:05:00Z"),
        starts,
        latest,
        at("2026-12-01T09:04:00Z")
      )
    ).toBe(ExamWindow.CLOSED);
    expect(
      latestStartOf(starts, at("2026-12-01T09:30:00Z")).toISOString()
    ).toBe("2026-12-01T09:30:00.000Z");
  });

  it("counts the time since the last call, capped, so a lost connection costs nothing", () => {
    const from = at("2026-12-01T09:00:00Z");
    expect(creditedSeconds(from, at("2026-12-01T09:00:10.900Z"))).toBe(10);
    expect(creditedSeconds(from, at("2026-12-01T09:30:00Z"))).toBe(90);
    expect(creditedSeconds(from, at("2026-12-01T08:59:00Z"))).toBe(0);
    expect(secondsLeft(60, 3590)).toBe(10);
    expect(secondsLeft(60, 4000)).toBe(0);
  });

  it("draws an order of the talebe's own with every id once", () => {
    const ids = ["a", "b", "c", "d", "e"];
    let n = 0;
    const seq = [0.9, 0.1, 0.5, 0.3];
    const order = drawOrder(ids, () => seq[n++ % seq.length]);
    expect([...order].sort()).toEqual(ids);
    expect(order).not.toEqual(ids);
    expect(drawOrder([], Math.random)).toEqual([]);
  });

  it("takes only the question's own options, once each, and one for a radio question", () => {
    expect(answerFits(AnswerMode.SINGLE, ["o1"], ["o1", "o2"])).toBe(true);
    expect(answerFits(AnswerMode.SINGLE, [], ["o1", "o2"])).toBe(true);
    expect(answerFits(AnswerMode.SINGLE, ["o1", "o2"], ["o1", "o2"])).toBe(
      false
    );
    expect(answerFits(AnswerMode.MULTIPLE, ["o1", "o2"], ["o1", "o2"])).toBe(
      true
    );
    expect(answerFits(AnswerMode.MULTIPLE, ["o1", "o1"], ["o1", "o2"])).toBe(
      false
    );
    expect(answerFits(AnswerMode.MULTIPLE, ["x"], ["o1", "o2"])).toBe(false);
  });

  it("scores a radio question: any correct option gets the points", () => {
    const q = single("q", ["a", "b"], ["a", "b", "c"]);
    expect(earnedPart(q, ["b"])).toEqual({ numerator: 1, denominator: 1 });
    expect(earnedPart(q, ["c"]).numerator).toBe(0);
    expect(earnedPart(q, []).numerator).toBe(0);
  });

  it("scores check boxes all or nothing, or in shares with a wrong mark taking one off, never below 0", () => {
    const all = multiple(
      "q",
      Scoring.ALL_OR_NOTHING,
      ["a", "b"],
      ["a", "b", "c"]
    );
    expect(earnedPart(all, ["a", "b"]).numerator).toBe(1);
    expect(earnedPart(all, ["a"]).numerator).toBe(0);
    expect(earnedPart(all, ["a", "b", "c"]).numerator).toBe(0);

    const shares = multiple(
      "q",
      Scoring.IN_SHARES,
      ["a", "b", "c"],
      ["a", "b", "c", "d", "e"]
    );
    expect(earnedPart(shares, ["a", "b"])).toEqual({
      numerator: 2,
      denominator: 3,
    });
    expect(earnedPart(shares, ["a", "b", "d"])).toEqual({
      numerator: 1,
      denominator: 3,
    });
    expect(earnedPart(shares, ["a", "d", "e"])).toEqual({
      numerator: 0,
      denominator: 3,
    });
  });

  it("scores check boxes in full when any correct one is marked and no wrong one", () => {
    // The owner, 22 Nov 2026: "doğru cevaplardan herhangi birini işaretlemesi
    // de yeterli olsun puanı tam alması için".
    const any = multiple("q", Scoring.ANY_CORRECT, ["a", "b"], ["a", "b", "c"]);
    expect(earnedPart(any, ["a"])).toEqual({ numerator: 1, denominator: 1 });
    expect(earnedPart(any, ["a", "b"]).numerator).toBe(1);
    expect(earnedPart(any, ["a", "c"]).numerator).toBe(0);
    expect(earnedPart(any, ["a", "b", "c"]).numerator).toBe(0);
    expect(earnedPart(any, []).numerator).toBe(0);
  });

  it("sums the exact points and rounds once, to two decimals", () => {
    // Three questions sharing 100: 33.33… each. Two right is 66.666…, 66.67.
    const qs = [
      single("q1", ["a"], ["a", "b"]),
      single("q2", ["a"], ["a", "b"]),
      single("q3", ["a"], ["a", "b"]),
    ];
    const answers = new Map([
      ["q1", ["a"]],
      ["q2", ["a"]],
      ["q3", ["b"]],
    ]);
    expect(scoreHundredths(qs, answers)).toBe(6667);
    // All three right is exactly 100, not 99.99.
    expect(
      scoreHundredths(
        qs,
        new Map([
          ["q1", ["a"]],
          ["q2", ["a"]],
          ["q3", ["a"]],
        ])
      )
    ).toBe(10_000);
    expect(scoreHundredths(qs, new Map())).toBe(0);
  });

  it("gives own points their own, and shares in shares of them", () => {
    // 40 points of its own in thirds, and two questions sharing the 60 left.
    const qs = [
      multiple(
        "q1",
        Scoring.IN_SHARES,
        ["a", "b", "c"],
        ["a", "b", "c", "d"],
        4000
      ),
      single("q2", ["a"], ["a", "b"]),
      single("q3", ["a"], ["a", "b"]),
    ];
    const answers = new Map([
      ["q1", ["a"]],
      ["q2", ["a"]],
    ]);
    // 40/3 + 30 = 43.333…, 43.33.
    expect(scoreHundredths(qs, answers)).toBe(4333);
  });
});
