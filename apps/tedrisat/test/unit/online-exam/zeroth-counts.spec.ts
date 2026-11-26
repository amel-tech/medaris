import {
  questionTable,
  zerothKey,
} from "../../../src/online-exam/domain/zeroth-counts";

/**
 * MDRS-299: the counts of nizam's "Sıfırıncı soru cevapları". Questions are
 * grouped by their exact words and options, and every count is sent as it is,
 * small ones included (the owner, 22 Nov 2026: "neden gizleyeyim tabi ki
 * görünecek").
 */
describe("the key of a zeroth question", () => {
  it("is the same for the same words and options, once the ends are trimmed", () => {
    expect(
      zerothKey(" Bu hadisi ne zaman öğrendiniz? ", ["Bu derste ", "Önce"])
    ).toBe(zerothKey("Bu hadisi ne zaman öğrendiniz?", ["Bu derste", "Önce"]));
    expect(zerothKey("Soru", ["A", "B"])).toMatch(/^[0-9a-f]{32}$/);
  });

  it("differs for other words, other options or another order", () => {
    const key = zerothKey("Soru", ["A", "B"]);
    expect(zerothKey("Soru.", ["A", "B"])).not.toBe(key);
    expect(zerothKey("Soru", ["A", "C"])).not.toBe(key);
    expect(zerothKey("Soru", ["B", "A"])).not.toBe(key);
    expect(zerothKey("soru", ["A", "B"])).not.toBe(key);
  });
});

describe("one question's table", () => {
  it("gives every exam's counts as they are, small ones included, and their sums", () => {
    expect(
      questionTable([
        [6, 2],
        [7, 8],
      ])
    ).toEqual({
      answered: 23,
      options: [13, 10],
      exams: [
        { answered: 8, options: [6, 2] },
        { answered: 15, options: [7, 8] },
      ],
    });
  });

  it("sends a one, a zero and an exam nobody answered as they are", () => {
    expect(
      questionTable([
        [1, 0, 3],
        [0, 0, 0],
      ])
    ).toEqual({
      answered: 4,
      options: [1, 0, 3],
      exams: [
        { answered: 4, options: [1, 0, 3] },
        { answered: 0, options: [0, 0, 0] },
      ],
    });
  });

  it("has nothing for a question no exam asked", () => {
    expect(questionTable([])).toEqual({ answered: 0, options: [], exams: [] });
  });
});
