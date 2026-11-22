import { describe, expect, it } from "vitest";
import {
  numbersOf,
  onlineExamErrorKey,
  topicsByNumbers,
} from "~/features/online-exams/online-exams";

const topics = [
  { id: "a", number: 3, name: "Kıyas", picked: true, questionCount: 1 },
  { id: "b", number: 7, name: "İcma", picked: false, questionCount: 0 },
];

describe("online exams (MDRS-299)", () => {
  it("picks the topics a hoca types by number, and names the unknown ones", () => {
    expect(topicsByNumbers("3, 7", topics)).toEqual({
      ids: ["a", "b"],
      unknown: [],
    });
    expect(topicsByNumbers(" 7;3 3 ", topics)).toEqual({
      ids: ["b", "a"],
      unknown: [],
    });
    expect(topicsByNumbers("3, 9", topics)).toEqual({
      ids: ["a"],
      unknown: [9],
    });
    expect(topicsByNumbers("", topics)).toEqual({ ids: [], unknown: [] });
  });

  it("shows a question's topics as their numbers", () => {
    expect(numbersOf(["b", "a"], topics)).toBe("3, 7");
    expect(numbersOf([], topics)).toBe("");
  });

  it("words a refusal by its code", () => {
    expect(onlineExamErrorKey("EXAM_STALE")).toBe("OnlineExams.stale");
    expect(onlineExamErrorKey("SOMETHING")).toBe("Problems.actionGeneric");
  });
});
