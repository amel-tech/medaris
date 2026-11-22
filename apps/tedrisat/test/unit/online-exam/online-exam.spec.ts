import { describe, expect, it } from "vitest";
import {
  AnswerMode,
  lacksOf,
  modeFits,
  nextFreeTopicNumber,
  pointsFit,
  pointsFromText,
  pointsText,
  Scoring,
  sharePoints,
  shareText,
  topicNameKey,
  topicWordCount,
} from "../../../src/online-exam/domain/online-exam";
import { TopicInUseError } from "../../../src/online-exam/errors/online-exam.errors";

describe("online exam rules (MDRS-299)", () => {
  it("compares topic names in Turkish lower case", () => {
    expect(topicNameKey("  İcma  ")).toBe(topicNameKey("icma"));
    expect(topicNameKey("Kıyas")).not.toBe(topicNameKey("Kiyas"));
    expect(topicWordCount(" Mücmel  ve müfesser ")).toBe(3);
    expect(topicWordCount("   ")).toBe(0);
  });

  it("gives a new topic the smallest free number", () => {
    expect(nextFreeTopicNumber([])).toBe(1);
    expect(nextFreeTopicNumber([1, 2, 4])).toBe(3);
    expect(nextFreeTopicNumber([2, 3])).toBe(1);
  });

  it("says what a question lacks, in the form's order", () => {
    expect(lacksOf({ text: "", options: [], topicIds: [] })).toEqual([
      "text",
      "option",
      "correct",
      "topic",
    ]);
    expect(
      lacksOf({
        text: "Kıyasın rükünleri kaç tanedir?",
        options: [
          { text: "Üç", correct: false },
          { text: "Dört", correct: true },
        ],
        topicIds: ["t"],
      })
    ).toEqual([]);
  });

  it("fits check boxes only to two correct options and a scoring", () => {
    expect(modeFits(AnswerMode.SINGLE, null, 0)).toBe(true);
    expect(modeFits(AnswerMode.SINGLE, null, 3)).toBe(true);
    expect(modeFits(AnswerMode.SINGLE, Scoring.IN_SHARES, 2)).toBe(false);
    expect(modeFits(AnswerMode.MULTIPLE, Scoring.ALL_OR_NOTHING, 1)).toBe(
      false
    );
    expect(modeFits(AnswerMode.MULTIPLE, null, 2)).toBe(false);
    expect(modeFits(AnswerMode.MULTIPLE, Scoring.IN_SHARES, 2)).toBe(true);
  });

  it("reads points with a comma or a point, two decimals at most", () => {
    expect(pointsFromText("12,5")).toBe(1250);
    expect(pointsFromText("12.05")).toBe(1205);
    expect(pointsFromText("100")).toBe(10_000);
    expect(pointsFromText("0")).toBeNull();
    expect(pointsFromText("100,01")).toBeNull();
    expect(pointsFromText("1,234")).toBeNull();
    expect(pointsText(1205)).toBe("12.05");
  });

  it("shares what own points leave, exactly, shown with two decimals", () => {
    const shares = sharePoints([
      { id: "a", ownHundredths: null },
      { id: "b", ownHundredths: null },
      { id: "c", ownHundredths: null },
    ]);
    expect(
      shareText(shares.points.get("a") ?? { numerator: 0, denominator: 1 })
    ).toBe("33.33");
    const mixed = sharePoints([
      { id: "a", ownHundredths: 1000 },
      { id: "b", ownHundredths: null },
    ]);
    expect(mixed.points.get("b")).toEqual({
      numerator: 9000,
      denominator: 1,
      own: false,
    });
  });

  it("refuses own points past 100, or that leave nothing to share", () => {
    expect(
      pointsFit([{ ownHundredths: 6000 }, { ownHundredths: 4000 }]).fits
    ).toBe(true);
    expect(
      pointsFit([{ ownHundredths: 6000 }, { ownHundredths: 5000 }]).fits
    ).toBe(false);
    expect(
      pointsFit([{ ownHundredths: 10_000 }, { ownHundredths: null }]).fits
    ).toBe(false);
    expect(
      pointsFit([{ ownHundredths: 9900 }, { ownHundredths: null }])
    ).toEqual({ fits: true, left: 100 });
  });

  it("refuses to delete a topic that questions carry, naming each by its exam and number", () => {
    const error = new TopicInUseError("t1", [
      { examId: "e1", examTitle: "Ara sınav", number: 3 },
    ]);
    expect(error.code).toBe("TOPIC_IN_USE");
    expect(error.status).toBe(409);
    expect(error.context).toEqual({
      topicId: "t1",
      questions: [{ examId: "e1", examTitle: "Ara sınav", number: 3 }],
    });
  });
});
