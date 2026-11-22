import { describe, expect, it } from "vitest";
import type { ScoredQuestion } from "../../../src/online-exam/domain/exam-attempt";
import {
  countsOf,
  courseTallies,
  fractionText,
  percentOf,
  QuestionOutcome,
  questionResults,
  tallyByTopic,
} from "../../../src/online-exam/domain/exam-result";
import {
  closedForEveryone,
  isPast,
  lessonExamState,
  MyExamState,
  onlineExamState,
} from "../../../src/online-exam/domain/my-exams";
import {
  AnswerMode,
  Scoring,
} from "../../../src/online-exam/domain/online-exam";

const at = (iso: string) => new Date(iso);
const NONE = { n: BigInt(0), d: BigInt(1) };

const question = (
  id: string,
  correct: string[],
  all: string[],
  values: Partial<ScoredQuestion> = {}
): ScoredQuestion => ({
  id,
  answerMode: AnswerMode.SINGLE,
  scoring: null,
  ownHundredths: null,
  options: all.map((o) => ({ id: o, correct: correct.includes(o) })),
  ...values,
});

describe("a talebe's result (MDRS-299)", () => {
  const questions = [
    question("q1", ["a"], ["a", "b"]),
    question("q2", ["c"], ["c", "d"]),
    question("q3", ["e", "f"], ["e", "f", "g"], {
      answerMode: AnswerMode.MULTIPLE,
      scoring: Scoring.IN_SHARES,
    }),
  ];

  it("counts right, wrong and blank, a question in shares with part of its points wrong", () => {
    const results = questionResults(
      questions,
      new Map([
        ["q1", ["a"]],
        ["q3", ["e"]],
      ])
    );
    expect(results.get("q1")?.outcome).toBe(QuestionOutcome.RIGHT);
    expect(results.get("q2")?.outcome).toBe(QuestionOutcome.BLANK);
    expect(results.get("q3")?.outcome).toBe(QuestionOutcome.WRONG);
    expect(countsOf(results.values())).toEqual({
      right: 1,
      wrong: 1,
      blank: 1,
    });
    // 100 shared by three: 33.33 each, and half of q3's.
    expect(fractionText(results.get("q1")?.points ?? NONE)).toBe("33.33");
    expect(fractionText(results.get("q3")?.got ?? NONE)).toBe("16.67");
  });

  it("stands in each topic by the points its questions carry, a question in two topics in both", () => {
    const results = questionResults(
      questions,
      new Map([
        ["q1", ["a"]],
        ["q2", ["d"]],
        ["q3", ["e", "f"]],
      ])
    );
    const tallies = tallyByTopic(
      [
        { id: "q1", topicIds: ["t1"] },
        { id: "q2", topicIds: ["t1", "t2"] },
        { id: "q3", topicIds: ["t2"] },
      ],
      results
    );
    const t1 = tallies.get("t1");
    const t2 = tallies.get("t2");
    expect(t1 && percentOf(t1.got, t1.carried)).toBe(50);
    expect(t1).toMatchObject({ right: 1, wrong: 1, blank: 0 });
    expect(t2 && percentOf(t2.got, t2.carried)).toBe(50);
    expect(t2).toMatchObject({ right: 1, wrong: 1, blank: 0 });
  });

  it("weighs a topic by its questions' own points", () => {
    const own = [
      question("q1", ["a"], ["a", "b"], { ownHundredths: 7_000 }),
      question("q2", ["c"], ["c", "d"]),
    ];
    const results = questionResults(own, new Map([["q2", ["c"]]]));
    const t = tallyByTopic(
      [
        { id: "q1", topicIds: ["t"] },
        { id: "q2", topicIds: ["t"] },
      ],
      results
    ).get("t");
    expect(t && percentOf(t.got, t.carried)).toBe(30);
  });

  it("adds a topic up across exams exactly, and counts the exams", () => {
    const one = questionResults(
      [question("q1", ["a"], ["a", "b"])],
      new Map([["q1", ["a"]]])
    );
    const two = questionResults(
      [question("q2", ["c"], ["c", "d"]), question("q3", ["e"], ["e", "f"])],
      new Map([["q2", ["d"]]])
    );
    const sum = courseTallies([
      tallyByTopic([{ id: "q1", topicIds: ["t"] }], one),
      tallyByTopic(
        [
          { id: "q2", topicIds: ["t"] },
          { id: "q3", topicIds: ["u"] },
        ],
        two
      ),
    ]);
    const t = sum.get("t");
    // 100 of 100, then 0 of 50: 100 of 150.
    expect(t && percentOf(t.got, t.carried)).toBe(67);
    expect(t?.exams).toBe(2);
    expect(sum.get("u")?.exams).toBe(1);
  });

  it("gives 0 percent to a topic that carries nothing", () => {
    expect(percentOf(NONE, NONE)).toBe(0);
  });
});

describe("Sınavlarım's standings (MDRS-299)", () => {
  const exam = {
    startsAt: at("2026-11-28T17:00:00Z"),
    latestStartAt: at("2026-11-28T17:10:00Z"),
    closedEarlyAt: null,
    durationMinutes: 60,
  };

  it("an online exam: to come, open, in progress, taken, released and missed", () => {
    const state = (
      now: string,
      attempt: { finishedAt: Date | null; usedSeconds: number } | null,
      released = false,
      closedEarlyAt: Date | null = null
    ) =>
      onlineExamState({
        ...exam,
        closedEarlyAt,
        now: at(now),
        attempt,
        released,
      });
    expect(state("2026-11-28T16:00:00Z", null)).toBe(MyExamState.UPCOMING);
    expect(state("2026-11-28T17:05:00Z", null)).toBe(MyExamState.OPEN);
    expect(state("2026-11-28T17:30:00Z", null)).toBe(MyExamState.MISSED);
    expect(
      state("2026-11-28T17:30:00Z", { finishedAt: null, usedSeconds: 600 })
    ).toBe(MyExamState.IN_PROGRESS);
    // Its time used up, or the exam closed early: over, though not yet written so.
    expect(
      state("2026-11-28T18:30:00Z", { finishedAt: null, usedSeconds: 3600 })
    ).toBe(MyExamState.TAKEN);
    expect(
      state(
        "2026-11-28T17:30:00Z",
        { finishedAt: null, usedSeconds: 600 },
        false,
        at("2026-11-28T17:20:00Z")
      )
    ).toBe(MyExamState.TAKEN);
    expect(
      state(
        "2026-11-28T18:30:00Z",
        { finishedAt: at("2026-11-28T17:50:00Z"), usedSeconds: 2000 },
        true
      )
    ).toBe(MyExamState.RELEASED);
    expect(isPast(MyExamState.RELEASED)).toBe(true);
    expect(isPast(MyExamState.IN_PROGRESS)).toBe(false);
  });

  it("a written or oral exam: to come, then taken until released, and Girmedi is missed", () => {
    const state = (now: string, released: boolean, absent: boolean | null) =>
      lessonExamState({
        now: at(now),
        startsAt: exam.startsAt,
        released,
        absent,
      });
    expect(state("2026-11-28T16:00:00Z", false, null)).toBe(
      MyExamState.UPCOMING
    );
    expect(state("2026-11-28T18:00:00Z", false, null)).toBe(MyExamState.TAKEN);
    expect(state("2026-11-28T18:00:00Z", true, false)).toBe(
      MyExamState.RELEASED
    );
    expect(state("2026-11-28T18:00:00Z", true, true)).toBe(MyExamState.MISSED);
  });

  it("closes for everyone after the latest start with no attempt in progress, or when closed early", () => {
    const closed = (
      now: string,
      anyInProgress: boolean,
      closedEarlyAt: Date | null = null
    ) =>
      closedForEveryone({
        ...exam,
        closedEarlyAt,
        now: at(now),
        anyInProgress,
      });
    expect(closed("2026-11-28T17:05:00Z", false)).toBe(false);
    expect(closed("2026-11-28T17:30:00Z", true)).toBe(false);
    expect(closed("2026-11-28T17:30:00Z", false)).toBe(true);
    expect(
      closed("2026-11-28T17:05:00Z", true, at("2026-11-28T17:04:00Z"))
    ).toBe(true);
  });
});
