import { createHash } from "node:crypto";

/**
 * How the zeroth question of the online exams was answered, as Medaris
 * management reads it (MDRS-299, nizam's "Sıfırıncı soru cevapları"): in
 * aggregate, as counts, never one talebe's answer or name. Every count is sent
 * as it is, small ones included (the owner, 22 Nov 2026: "neden gizleyeyim
 * tabi ki görünecek"). Pure: no I/O.
 */

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

/** One question's table: a row per exam, a column per option, and their sums. */
export interface IQuestionTable {
  /** how many talebe answered it, over every exam */
  answered: number;
  /** how many chose each option, over every exam */
  options: number[];
  exams: Array<{ answered: number; options: number[] }>;
}

/**
 * The exams that asked one question (`cells[i][j]`: exam i, option j), each
 * with its total, and the combined counts as their sums: the list's counts.
 */
export function questionTable(
  cells: readonly (readonly number[])[]
): IQuestionTable {
  const columns = cells[0]?.length ?? 0;
  const options = Array.from({ length: columns }, (_, j) =>
    cells.reduce((sum, row) => sum + row[j], 0)
  );
  return {
    answered: options.reduce((a, b) => a + b, 0),
    options,
    exams: cells.map((row) => ({
      answered: row.reduce((a, b) => a + b, 0),
      options: [...row],
    })),
  };
}
