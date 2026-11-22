import { describe, expect, it } from "vitest";
import {
  modeFits,
  numbersOf,
  onlineExamErrorKey,
  pointsFromText,
  sharesOf,
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

  it("shares the points as the API does, rounded half up", () => {
    const three = sharesOf([
      { key: "a", own: null },
      { key: "b", own: null },
      { key: "c", own: null },
    ]);
    expect(three.get("a")).toEqual({ hundredths: 3333, own: false });
    const mixed = sharesOf([
      { key: "a", own: 5000 },
      { key: "b", own: null },
      { key: "c", own: null },
      { key: "d", own: null },
    ]);
    expect(mixed.get("a")).toEqual({ hundredths: 5000, own: true });
    // 5000 / 3 = 1666.67 hundredths: 16.67 points.
    expect(mixed.get("b")).toEqual({ hundredths: 1667, own: false });
  });

  it("reads points and the answer mode as the API does", () => {
    expect(pointsFromText("12,5")).toBe(1250);
    expect(pointsFromText("12.50")).toBe(1250);
    expect(pointsFromText("0")).toBeNull();
    expect(pointsFromText("100,01")).toBeNull();
    expect(modeFits("MULTIPLE", "IN_SHARES", 2)).toBe(true);
    expect(modeFits("MULTIPLE", "IN_SHARES", 1)).toBe(false);
    expect(modeFits("SINGLE", null, 3)).toBe(true);
    expect(modeFits("SINGLE", "ALL_OR_NOTHING", 3)).toBe(false);
  });
});
