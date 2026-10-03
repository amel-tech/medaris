/**
 * The CSS reader the MDRS-73 specs stand on. Its edge cases get their own
 * tests so a reader bug cannot pass as a token being present or absent.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  collectTokens,
  compileTailwind,
  emittedThemeVars,
  importGraph,
  normaliseShadow,
  parseColour,
  readDeclarations,
  toPx,
} from "./css-tokens.js";

let dir: string;
const write = (name: string, css: string) => {
  writeFileSync(join(dir, name), css);
  return join(dir, name);
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "mdrs73-reader-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("readDeclarations", () => {
  it("reads declarations with their same-line notes and ignores prose in headers", () => {
    const css = `/* header quoting --fake: 1px; as prose */\n@theme {\n  /* section */\n  --a: 1px; /* note a */\n  --b:\n    x,\n    y;\n}`;
    expect(readDeclarations(css)).toEqual([
      { name: "a", value: "1px", note: "note a" },
      { name: "b", value: "x, y", note: "" },
    ]);
  });
});

describe("importGraph and collectTokens", () => {
  it("follows relative imports once each, even through a cycle", () => {
    const a = write("a.css", `@import "./b.css";\n--a: 1px;`);
    write("b.css", `@import "./a.css";\n--b: 2px;`);
    expect(importGraph(a)).toEqual([a, join(dir, "b.css")]);
    expect([...collectTokens(a).keys()]).toEqual(["a", "b"]);
  });

  it("refuses a package import, which it cannot follow", () => {
    const a = write("a.css", `@import "tailwindcss";`);
    expect(() => importGraph(a)).toThrow(/non-relative @import "tailwindcss"/);
  });

  it("refuses a name declared in two files", () => {
    const a = write("a.css", `@import "./b.css";\n--x: 1px;`);
    write("b.css", `--x: 2px;`);
    expect(() => collectTokens(a)).toThrow(/--x is declared in both/);
  });
});

describe("compileTailwind and emittedThemeVars", () => {
  it("resolves relative and absolute imports from the importing file", async () => {
    write("t.css", `@theme { --space-probe: 3px; }`);
    const entry = write(
      "entry.css",
      `@import "./t.css";\n.x { gap: var(--space-probe); }`
    );
    const output = await compileTailwind(
      `@import "tailwindcss";\n@import "${entry}";\n`
    );
    expect(emittedThemeVars(output).get("space-probe")).toBe("3px");
  });

  it("returns an empty map when nothing reached the theme layer", () => {
    expect(emittedThemeVars(".x { color: red; }").size).toBe(0);
  });
});

describe("toPx, parseColour, normaliseShadow", () => {
  it("converts px and rem, and rejects anything else", () => {
    expect([toPx("4px"), toPx("0.5px"), toPx("1.5rem"), toPx("-2px")]).toEqual([
      4, 0.5, 24, -2,
    ]);
    expect(() => toPx("1em")).toThrow(/not a px or rem length/);
  });

  it("reads the four colour notations the token files use", () => {
    expect(parseColour("#0C4A6E")).toEqual([12, 74, 110, 255]);
    expect(parseColour("#0000001a")).toEqual([0, 0, 0, 26]);
    expect(parseColour("rgb(0 0 0 / 0.1)")).toEqual([0, 0, 0, 26]);
    expect(parseColour("rgba(12, 74, 110, 1)")).toEqual([12, 74, 110, 255]);
    expect(parseColour("rgb(1 2 3)")).toEqual([1, 2, 3, 255]);
    expect(() => parseColour("red")).toThrow(/not a colour/);
  });

  it("compares shadows by layer, whatever the order and notation", () => {
    expect(
      normaliseShadow("0 1px 2px -1px #0000001A, 0 1px 3px 0 #0000001A")
    ).toEqual(
      normaliseShadow(
        "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)"
      )
    );
    expect(normaliseShadow("0 1px rgb(0 0 0 / 0.05)")).toEqual([
      "0 1 0 0 0,0,0,13",
    ]);
    expect(normaliseShadow("0 2px #000000")).not.toEqual(
      normaliseShadow("0 1px #000000")
    );
  });
});
