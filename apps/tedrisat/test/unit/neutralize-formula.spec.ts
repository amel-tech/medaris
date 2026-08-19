import { neutralizeFormula } from "@medaris/common";

/**
 * MDRS-36. `ExcelService` wrote user-authored cell values into the workbook
 * verbatim, and the csv branch emits them as raw text — so a flashcard whose
 * front begins with `=`, `+`, `-`, `@`, a tab or a CR was evaluated as a
 * formula when the downloaded deck was opened in Excel or LibreOffice.
 *
 * The helper lives in libs/common, which has no `test` target of its own (see
 * `libs/common/project.json`), so its coverage lands here — the same
 * arrangement `cors.config.spec.ts` next door already uses. That also means
 * this spec asserts against the built `dist/`: `@medaris/common` resolves
 * through the package `main`, so `pnpm nx build common` must have run.
 */
describe("neutralizeFormula", () => {
  it.each([
    ["=1+1", "'=1+1"],
    ["+1", "'+1"],
    ["-1", "'-1"],
    ["@SUM(A1)", "'@SUM(A1)"],
    ["\t=cmd|' /c calc'!A1", "'\t=cmd|' /c calc'!A1"],
    ["\r=1+1", "'\r=1+1"],
  ])("prefixes %j so the spreadsheet reads it as text", (input, expected) => {
    expect(neutralizeFormula(input)).toBe(expected);
  });

  it("keeps the escaped value readable after the prefix", () => {
    const card = '=HYPERLINK("http://evil","click")';
    const escaped = neutralizeFormula(card);

    expect(escaped.startsWith("'")).toBe(true);
    // The quote is the only thing added: the card text survives intact, which
    // is what makes this an escape rather than a mangling.
    expect(escaped.slice(1)).toBe(card);
  });

  it.each([
    "hello",
    "",
    "1+1",
    "a=b",
  ])("leaves the harmless string %j alone", (input) => {
    expect(neutralizeFormula(input)).toBe(input);
  });

  it("leaves non-string cells untouched so arithmetic still works", () => {
    const date = new Date("2026-08-19T00:00:00.000Z");

    expect(neutralizeFormula(42)).toBe(42);
    expect(neutralizeFormula(-42)).toBe(-42);
    expect(neutralizeFormula(date)).toBe(date);
    expect(neutralizeFormula(true)).toBe(true);
    expect(neutralizeFormula(null)).toBeNull();
    expect(neutralizeFormula(undefined)).toBeUndefined();
  });
});
