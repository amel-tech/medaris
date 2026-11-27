import { describe, expect, it } from "vitest";
import {
  modeFits,
  numbersOf,
  onlineExamErrorKey,
  optionLetter,
  pastedOptions,
  pointsFromText,
  sharesOf,
  spreadOptions,
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

describe("quick option entry (MDRS-248)", () => {
  it("letters the options as an A-list counts: A to Z, then AA", () => {
    expect(optionLetter(0)).toBe("A");
    expect(optionLetter(25)).toBe("Z");
    expect(optionLetter(26)).toBe("AA");
    expect(optionLetter(27)).toBe("AB");
  });

  it("reads a pasted list a line each, its marks off only when they count on", () => {
    expect(pastedOptions("a) Asıl\r\nb) Fer\n")).toEqual(["Asıl", "Fer"]);
    expect(pastedOptions("(1) Asıl\n(2) Fer")).toEqual(["Asıl", "Fer"]);
    expect(pastedOptions("C) Cim\nÇ) Çim\nD) Dal")).toEqual([
      "Cim",
      "Çim",
      "Dal",
    ]);
    const twelve = Array.from({ length: 12 }, (_, k) => `${k + 1}) S${k}`);
    expect(pastedOptions(twelve.join("\n"))).toEqual(
      Array.from({ length: 12 }, (_, k) => `S${k}`)
    );
    // Marks that do not count on are words: kept.
    expect(pastedOptions("I. Dünya Savaşı\nV. Murad")).toEqual([
      "I. Dünya Savaşı",
      "V. Murad",
    ]);
    expect(pastedOptions("3. yüzyıl\nDördüncü yüzyıl")).toEqual([
      "3. yüzyıl",
      "Dördüncü yüzyıl",
    ]);
    expect(pastedOptions("  Tek satır  ")).toEqual(["Tek satır"]);
  });

  it("cuts a pasted line to an option's longest text", () => {
    const [long] = pastedOptions(`${"a".repeat(1500)}\nFer`);
    expect(long).toHaveLength(1000);
  });

  it("fills the empty options from the one pasted into, skipping typed ones, adding up to the most", () => {
    const four = [
      { text: "Asıl", correct: true },
      { text: "", correct: false },
      { text: "İllet", correct: true },
      { text: "", correct: false },
    ];
    expect(spreadOptions(four, 1, ["Fer", "Hüküm", "Rivayet"])).toEqual({
      options: [
        { text: "Asıl", correct: true },
        { text: "Fer", correct: false },
        { text: "İllet", correct: true },
        { text: "Hüküm", correct: false },
        { text: "Rivayet", correct: false },
      ],
      last: 4,
    });
    const capped = spreadOptions(four, 3, ["x", "y", "z"], 5);
    expect(capped.options).toHaveLength(5);
    expect(capped.last).toBe(4);
  });
});
