import { describe, expect, it } from "vitest";
import type { ScoredQuestion } from "../../../src/online-exam/domain/exam-attempt";
import { drawOrder } from "../../../src/online-exam/domain/exam-attempt";
import {
  AnswerMode,
  practiceProblems,
  practiceStatus,
  Scoring,
} from "../../../src/online-exam/domain/online-exam";
import {
  drawPool,
  isCompleteCounted,
  outcomeOf,
  PoolMode,
  PracticeOutcome,
  partText,
  poolCountFits,
  practiceResult,
} from "../../../src/practice/domain/practice";

const single = (id: string): ScoredQuestion => ({
  id,
  answerMode: AnswerMode.SINGLE,
  scoring: null,
  ownHundredths: null,
  options: [
    { id: `${id}-a`, correct: true },
    { id: `${id}-b`, correct: false },
  ],
});

const shares = (id: string): ScoredQuestion => ({
  id,
  answerMode: AnswerMode.MULTIPLE,
  scoring: Scoring.IN_SHARES,
  // Own points are an exam's; a set weighs every question the same.
  ownHundredths: 9000,
  options: [
    { id: `${id}-a`, correct: true },
    { id: `${id}-b`, correct: true },
    { id: `${id}-c`, correct: false },
  ],
});

describe("çalışma soruları (MDRS-248)", () => {
  describe("practiceResult", () => {
    it("counts correct, wrong and blank, and weighs every question the same", () => {
      const questions = [single("q1"), single("q2"), single("q3")];
      const r = practiceResult(
        questions,
        new Map([
          ["q1", ["q1-a"]],
          ["q2", ["q2-b"]],
        ])
      );
      expect([r.correct, r.wrong, r.blank]).toEqual([1, 1, 1]);
      expect(r.scoreHundredths).toBe(3333);
      expect(r.questions.get("q1")?.outcome).toBe(PracticeOutcome.CORRECT);
      expect(r.questions.get("q2")?.outcome).toBe(PracticeOutcome.WRONG);
      expect(r.questions.get("q3")?.outcome).toBe(PracticeOutcome.BLANK);
    });

    it("rounds half up once, from the exact parts", () => {
      // 2 of 3 is 66.666…, read as 66.67.
      const r = practiceResult(
        [single("q1"), single("q2"), single("q3")],
        new Map([
          ["q1", ["q1-a"]],
          ["q2", ["q2-a"]],
        ])
      );
      expect(r.scoreHundredths).toBe(6667);
    });

    it("gives a part under IN_SHARES and counts it as wrong, ignoring own points", () => {
      const r = practiceResult(
        [shares("m"), single("s")],
        new Map([
          ["m", ["m-a"]],
          ["s", ["s-a"]],
        ])
      );
      expect(r.questions.get("m")).toEqual({
        outcome: PracticeOutcome.WRONG,
        part: { numerator: 1, denominator: 2 },
      });
      // (1/2 + 1) / 2 = 75%, whatever the exam points say.
      expect(r.scoreHundredths).toBe(7500);
      expect([r.correct, r.wrong, r.blank]).toEqual([1, 1, 0]);
    });

    it("is all correct at 100.00 and nothing at 0", () => {
      const all = practiceResult(
        [single("a"), shares("b")],
        new Map([
          ["a", ["a-a"]],
          ["b", ["b-a", "b-b"]],
        ])
      );
      expect(all.scoreHundredths).toBe(10_000);
      expect(practiceResult([], new Map()).scoreHundredths).toBe(0);
    });
  });

  it("names an outcome: nothing chosen is blank whatever the part", () => {
    expect(outcomeOf([], { numerator: 0, denominator: 1 })).toBe("BLANK");
    expect(outcomeOf(["x"], { numerator: 2, denominator: 2 })).toBe("CORRECT");
    expect(outcomeOf(["x"], { numerator: 1, denominator: 2 })).toBe("WRONG");
    expect(outcomeOf(["x"], { numerator: 0, denominator: 1 })).toBe("WRONG");
  });

  it("writes a part with two decimals", () => {
    expect(partText({ numerator: 1, denominator: 1 })).toBe("1.00");
    expect(partText({ numerator: 1, denominator: 3 })).toBe("0.33");
    expect(partText({ numerator: 2, denominator: 3 })).toBe("0.67");
    expect(partText({ numerator: 0, denominator: 1 })).toBe("0.00");
  });

  it("counts a question complete by the set's rule, where a topic is not needed", () => {
    const base = { text: "Soru", options: 2, correct: 1, topics: 1 };
    expect(isCompleteCounted(base)).toBe(true);
    expect(isCompleteCounted({ ...base, text: "  " })).toBe(false);
    expect(isCompleteCounted({ ...base, options: 1 })).toBe(false);
    expect(isCompleteCounted({ ...base, correct: 0 })).toBe(false);
    expect(isCompleteCounted({ ...base, topics: 0 })).toBe(true);
  });

  it("publishes a set with one complete question, whatever the others lack", () => {
    const complete = {
      text: "Soru",
      options: [
        { text: "A", correct: true },
        { text: "B", correct: false },
      ],
      topicIds: ["t"],
    };
    const empty = { text: "", options: [], topicIds: [] };
    expect(practiceProblems([])).toEqual([{ kind: "NO_QUESTION" }]);
    expect(practiceProblems([empty])).toEqual([{ kind: "NO_QUESTION" }]);
    expect(practiceProblems([empty, complete])).toEqual([]);
    // A set's question needs no topic (MDRS-248).
    expect(practiceProblems([{ ...complete, topicIds: [] }])).toEqual([]);
  });

  it("is a draft until published, and open from then on", () => {
    expect(practiceStatus(null)).toBe("DRAFT");
    expect(practiceStatus(new Date())).toBe("OPEN");
  });
});

describe("the pool (Faz 4)", () => {
  const ids = Array.from({ length: 20 }, (_, i) => `q${i}`);
  let seed = 7;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const shuffle = (all: readonly string[]) => drawOrder(all, random);

  it("draws every question under ALL, in a new order", () => {
    const drawn = drawPool(ids, PoolMode.ALL, undefined, shuffle);
    expect([...drawn].sort()).toEqual([...ids].sort());
  });

  it("draws exactly N under RANDOM, none twice, all of the pool", () => {
    for (const n of [1, 5, 19, 20]) {
      const drawn = drawPool(ids, PoolMode.RANDOM, n, shuffle);
      expect(drawn).toHaveLength(n);
      expect(new Set(drawn).size).toBe(n);
      for (const id of drawn) expect(ids).toContain(id);
    }
  });

  it("takes a count from 1 to the pool's size under RANDOM only", () => {
    expect(poolCountFits(PoolMode.RANDOM, 1, 20)).toBe(true);
    expect(poolCountFits(PoolMode.RANDOM, 20, 20)).toBe(true);
    expect(poolCountFits(PoolMode.RANDOM, 21, 20)).toBe(false);
    expect(poolCountFits(PoolMode.RANDOM, 0, 20)).toBe(false);
    expect(poolCountFits(PoolMode.RANDOM, 2.5, 20)).toBe(false);
    expect(poolCountFits(PoolMode.RANDOM, undefined, 20)).toBe(false);
    expect(poolCountFits(PoolMode.RANDOM, 1, 0)).toBe(false);
  });

  it("draws ALL from a pool with a question in it, whatever the count", () => {
    expect(poolCountFits(PoolMode.ALL, undefined, 1)).toBe(true);
    expect(poolCountFits(PoolMode.ALL, 99, 1)).toBe(true);
    expect(poolCountFits(PoolMode.ALL, undefined, 0)).toBe(false);
  });
});
