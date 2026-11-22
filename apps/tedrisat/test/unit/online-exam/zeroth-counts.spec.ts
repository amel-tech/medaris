import {
  type IMaskedCount,
  maskQuestion,
  maskTable,
  ZerothMask,
  zerothKey,
} from "../../../src/online-exam/domain/zeroth-counts";

/**
 * MDRS-299: the hiding of nizam's "Sıfırıncı soru cevapları". No count under
 * five is sent, and no sum (a question's total and its options, an exam's row,
 * an option's column, the exams' totals) holds exactly one masked count, which
 * the shown ones would give away (invariant zeroth-answers-never-traced).
 */
const shown = (count: number): IMaskedCount => ({ count, masked: null });
const few: IMaskedCount = { count: null, masked: ZerothMask.FEWER_THAN_FIVE };
const hidden: IMaskedCount = { count: null, masked: ZerothMask.HIDDEN };

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

describe("a question of the list", () => {
  it("sends every count of five or more", () => {
    expect(maskQuestion(20, [12, 8])).toEqual({
      answered: shown(20),
      options: [shown(12), shown(8)],
    });
  });

  it("masks a count under five, and the smallest other so the total gives nothing away", () => {
    // 12 − 9 would be 3.
    expect(maskQuestion(12, [9, 3])).toEqual({
      answered: shown(12),
      options: [hidden, few],
    });
    // A zero is under five too; of the two sixes the first is hidden.
    expect(maskQuestion(12, [6, 6, 0])).toEqual({
      answered: shown(12),
      options: [hidden, shown(6), few],
    });
  });

  it("leaves two counts under five as they are: neither can be worked out", () => {
    expect(maskQuestion(14, [10, 2, 2])).toEqual({
      answered: shown(14),
      options: [shown(10), few, few],
    });
  });

  it("masks everything when fewer than five answered", () => {
    expect(maskQuestion(4, [3, 1])).toEqual({
      answered: few,
      options: [few, few],
    });
  });
});

/** Every sum of a table, as values with their masks, to check none has exactly one masked. */
function sumsOf(table: ReturnType<typeof maskTable>): IMaskedCount[][] {
  const rows = table.exams.map((exam) => [...exam.options, exam.answered]);
  const columns = table.options.map((option, j) => [
    ...table.exams.map((exam) => exam.options[j]),
    option,
  ]);
  return [
    ...rows,
    ...columns,
    [...table.exams.map((exam) => exam.answered), table.answered],
    [...table.options, table.answered],
  ];
}

const masks = (sum: IMaskedCount[]) => sum.filter((c) => c.masked !== null);

describe("one question's table of exams", () => {
  it("masks over rows and columns until no sum holds exactly one masked count", () => {
    // Exam 1 chose 6 and 2 (8), exam 2 chose 7 and 8 (15); the options 13 and 10, 23 in all.
    const table = maskTable([
      [6, 2],
      [7, 8],
    ]);
    expect(table.answered).toEqual(shown(23));
    expect(table.options).toEqual([shown(13), shown(10)]);
    expect(table.exams).toEqual([
      { answered: shown(8), options: [hidden, few] },
      { answered: shown(15), options: [hidden, hidden] },
    ]);
  });

  it("keeps the list's combined counts: they are shown there under the same filters", () => {
    const cells = [
      [9, 3],
      [5, 6],
      [12, 0],
    ];
    const table = maskTable(cells);
    const list = maskQuestion(35, [26, 9]);
    expect(table.answered).toEqual(list.answered);
    expect(table.options).toEqual(list.options);
  });

  it("masks every count under five and never leaves one sum with a single masked count", () => {
    // A small deterministic generator: tables of one to five exams and two to four options.
    let seed = 7;
    const next = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed;
    };
    for (let round = 0; round < 400; round++) {
      const exams = 1 + (next() % 5);
      const options = 2 + (next() % 3);
      const cells = Array.from({ length: exams }, () =>
        Array.from({ length: options }, () => next() % 14)
      );
      const table = maskTable(cells);
      const values: Array<[number, IMaskedCount]> = [
        ...cells.flatMap((row, i) =>
          row.map(
            (v, j) => [v, table.exams[i].options[j]] as [number, IMaskedCount]
          )
        ),
        ...cells.map(
          (row, i) =>
            [row.reduce((a, b) => a + b, 0), table.exams[i].answered] as [
              number,
              IMaskedCount,
            ]
        ),
      ];
      for (const [value, count] of values) {
        if (value < 5) expect(count.masked, `round ${round}`).not.toBeNull();
        if (count.masked === null) expect(count.count).toBe(value);
      }
      for (const sum of sumsOf(table)) {
        expect(
          masks(sum).length,
          `round ${round}: ${JSON.stringify(cells)}`
        ).not.toBe(1);
      }
    }
  });
});
