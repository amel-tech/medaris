import { createHash } from "node:crypto";

/**
 * How the zeroth question of the online exams was answered, as Medaris
 * management reads it (MDRS-299, nizam's "Sıfırıncı soru cevapları"): in
 * aggregate, never one talebe's answer. Pure: no I/O, so the hiding can be
 * pinned by plain specs.
 *
 * Invariant `zeroth-answers-never-traced` (graphs/domain/planned-exams.yaml):
 * no count under five is sent, nor one from which such a count could be worked
 * out as a difference of others.
 */

/** A count under this is never sent as a number. */
export const ZEROTH_COUNT_FLOOR = 5;

export const ZerothMask = {
  /** Under five: "5'ten az". */
  FEWER_THAN_FIVE: "FEWER_THAN_FIVE",
  /** Five or more, hidden so that another hidden count cannot be worked out: "gizlendi". */
  HIDDEN: "HIDDEN",
} as const;
export type ZerothMask = (typeof ZerothMask)[keyof typeof ZerothMask];

export interface IMaskedCount {
  /** null when masked */
  count: number | null;
  masked: ZerothMask | null;
}

/**
 * Two exams' zeroth questions are counted together when their words and their
 * options are the same, letter for letter once the spaces at either end are
 * trimmed (ui rule `same-words-together`). The key is a digest of exactly that,
 * so it can stand in a path and says nothing of the words.
 */
export function zerothKey(
  question: string,
  options: readonly string[]
): string {
  return createHash("sha256")
    .update(JSON.stringify([question.trim(), options.map((o) => o.trim())]))
    .digest("hex")
    .slice(0, 32);
}

/** A whole and the parts that sum to it, as indexes into the counts. */
export interface ISumRelation {
  parts: readonly number[];
  whole: number;
}

/**
 * Masks `values` so that none under five is sent, and no sum relation holds
 * exactly one masked count (which its shown members would give away).
 *
 * Every count under five is FEWER_THAN_FIVE. Then, as long as a relation has
 * exactly one masked member, its smallest shown member that is not `fixed` is
 * HIDDEN too, the smallest first as the contract says. `fixed` holds counts
 * whose mask was decided elsewhere and is already public: the combined counts
 * the list shows, which the table of one question must not contradict. A
 * relation that could only be closed by moving a fixed count throws rather
 * than send a count that can be worked out; the callers' relations never do.
 */
export function maskCounts(
  values: readonly number[],
  relations: readonly ISumRelation[],
  fixed: ReadonlyMap<number, ZerothMask | null> = new Map()
): (ZerothMask | null)[] {
  const mask = values.map((value, i) =>
    fixed.has(i)
      ? (fixed.get(i) ?? null)
      : value < ZEROTH_COUNT_FLOOR
        ? ZerothMask.FEWER_THAN_FIVE
        : null
  );
  let changed = true;
  while (changed) {
    changed = false;
    for (const { parts, whole } of relations) {
      const members = [...parts, whole];
      const masked = members.filter((i) => mask[i] !== null);
      if (masked.length !== 1) continue;
      const open = members.filter((i) => mask[i] === null && !fixed.has(i));
      if (open.length === 0) {
        throw new Error("A zeroth count could be worked out from those shown");
      }
      const smallest = open.reduce((a, b) => (values[b] < values[a] ? b : a));
      mask[smallest] = ZerothMask.HIDDEN;
      changed = true;
    }
  }
  return mask;
}

const masked = (value: number, mask: ZerothMask | null): IMaskedCount =>
  mask === null
    ? { count: value, masked: null }
    : { count: null, masked: mask };

/** One question's counts as the list shows them. */
export interface IQuestionCounts {
  answered: IMaskedCount;
  options: IMaskedCount[];
}

/**
 * A question of the list: how many talebe answered it over every exam that
 * asked it, and how many chose each option. The options sum to the total.
 */
export function maskQuestion(
  answered: number,
  options: readonly number[]
): IQuestionCounts {
  const values = [answered, ...options];
  const mask = maskCounts(values, [
    { parts: options.map((_, i) => i + 1), whole: 0 },
  ]);
  return {
    answered: masked(answered, mask[0]),
    options: options.map((count, i) => masked(count, mask[i + 1])),
  };
}

/** One question's table: a row per exam, a column per option. */
export interface IQuestionTable {
  /** over every exam: the same as the list shows */
  answered: IMaskedCount;
  options: IMaskedCount[];
  exams: Array<{ answered: IMaskedCount; options: IMaskedCount[] }>;
}

/**
 * The exams that asked one question, each with its counts, and the combined
 * counts as their sums (getZerothQuestionExams). The combined counts are masked
 * as the list masks them, and fixed: the list shows them under the same
 * filters. The hiding then goes on over the whole table, every row with its
 * exam's total and every column with its combined count, and the exams' totals
 * with the combined total, until none holds exactly one masked count.
 */
export function maskTable(
  cells: readonly (readonly number[])[]
): IQuestionTable {
  const rows = cells.length;
  const columns = cells[0]?.length ?? 0;
  const rowTotals = cells.map((row) => row.reduce((a, b) => a + b, 0));
  const columnTotals = Array.from({ length: columns }, (_, j) =>
    cells.reduce((sum, row) => sum + row[j], 0)
  );
  const total = rowTotals.reduce((a, b) => a + b, 0);

  const cell = (i: number, j: number) => i * columns + j;
  const rowAt = (i: number) => rows * columns + i;
  const columnAt = (j: number) => rows * columns + rows + j;
  const totalAt = rows * columns + rows + columns;
  const values = [...cells.flat(), ...rowTotals, ...columnTotals, total];

  const list = maskQuestion(total, columnTotals);
  const fixed = new Map<number, ZerothMask | null>([
    [totalAt, list.answered.masked],
    ...list.options.map(
      (option, j) => [columnAt(j), option.masked] as [number, ZerothMask | null]
    ),
  ]);
  const relations: ISumRelation[] = [
    ...cells.map((row, i) => ({
      parts: row.map((_, j) => cell(i, j)),
      whole: rowAt(i),
    })),
    ...columnTotals.map((_, j) => ({
      parts: cells.map((_, i) => cell(i, j)),
      whole: columnAt(j),
    })),
    { parts: rowTotals.map((_, i) => rowAt(i)), whole: totalAt },
    { parts: columnTotals.map((_, j) => columnAt(j)), whole: totalAt },
  ];
  const mask = maskCounts(values, relations, fixed);
  return {
    answered: list.answered,
    options: list.options,
    exams: cells.map((row, i) => ({
      answered: masked(rowTotals[i], mask[rowAt(i)]),
      options: row.map((count, j) => masked(count, mask[cell(i, j)])),
    })),
  };
}
