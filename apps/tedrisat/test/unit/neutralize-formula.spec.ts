import { denormalizeFormula, neutralizeFormula } from "@medaris/common";

/**
 * MDRS-36. `ExcelService` wrote user-authored cell values into the workbook
 * verbatim, and the csv branch emits them as raw text — so a flashcard whose
 * front begins with `=`, `+`, `-`, `@`, a tab or a CR was evaluated as a
 * formula when the downloaded deck was opened in Excel or LibreOffice.
 *
 * The helper lives in libs/common, which has no `test` target of its own (see
 * `libs/common/project.json`); this is the second spec to land its coverage
 * here rather than there, the way `cors.config.spec.ts` next door already
 * had to for MDRS-34 — see that file's own comment. Giving libs/common a
 * `test` target of its own belongs with MDRS-20. This also means this spec
 * asserts against the built `dist/`: `@medaris/common` resolves through the
 * package `main`, so `pnpm nx build common` must have run.
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

/**
 * MDRS-36 follow-up. `neutralizeFormula` has no inverse applied on import, so
 * a legitimate card starting with `-` or `+` (a suffix drill, say) came back
 * from `parseSheet` with a permanent leading `'` baked into its stored
 * content. `denormalizeFormula` is that inverse; these cases are the mirror
 * of the `neutralizeFormula` table above.
 */
describe("denormalizeFormula", () => {
  it.each([
    ["'=1+1", "=1+1"],
    ["'+1", "+1"],
    ["'-1", "-1"],
    ["'@SUM(A1)", "@SUM(A1)"],
  ])("strips the leading escape from %j", (input, expected) => {
    expect(denormalizeFormula(input)).toBe(expected);
  });

  it("strips only one leading apostrophe, keeping the rest of a typed one", () => {
    expect(denormalizeFormula("''ninety")).toBe("'ninety");
  });

  it.each([
    "hello",
    "",
    "1+1",
    "a=b",
  ])("leaves the harmless string %j alone", (input) => {
    expect(denormalizeFormula(input)).toBe(input);
  });

  it("leaves non-string cells untouched", () => {
    const date = new Date("2026-08-19T00:00:00.000Z");

    expect(denormalizeFormula(42)).toBe(42);
    expect(denormalizeFormula(date)).toBe(date);
    expect(denormalizeFormula(true)).toBe(true);
    expect(denormalizeFormula(null)).toBeNull();
    expect(denormalizeFormula(undefined)).toBeUndefined();
  });

  it("composes with neutralizeFormula back to the original value", () => {
    const originals = ["=1+1", "+1", "-1", "@SUM(A1)", "hello", "", "a=b"];
    for (const original of originals) {
      expect(denormalizeFormula(neutralizeFormula(original))).toBe(original);
    }
  });
});
