/**
 * MDRS-73 AC1 — `@import "@medaris/tokens/css"` yields the colour tokens it
 * yields today, plus type, spacing, radius, elevation and icon tokens, and no
 * existing token changes name or value.
 *
 * "Today" is pinned by test/fixtures/colour-tokens.snapshot.json: the 70
 * declarations of theme/main.css as it stood on the integration branch
 * before this change, read by name and value.
 */
import { readFileSync } from "node:fs";
import { basename, dirname, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { FAMILIES, NEW_TOKEN_NAMES } from "./families.js";
import {
  collectTokens,
  compileTailwind,
  emittedThemeVars,
  importGraph,
  PACKAGE_ROOT,
  resolveTokensCss,
} from "./support/css-tokens.js";

const SNAPSHOT: Record<string, string> = JSON.parse(
  readFileSync(
    new URL("./fixtures/colour-tokens.snapshot.json", import.meta.url),
    "utf8"
  )
);

describe('AC1: @import "@medaris/tokens/css"', () => {
  it("resolves through package.json exports to theme/index.css", () => {
    const entry = resolveTokensCss();
    expect(relative(PACKAGE_ROOT, entry)).toBe("theme/index.css");
  });

  it("imports the generated colours first, then every hand-authored family", () => {
    const files = importGraph(resolveTokensCss()).map((f) => basename(f));
    expect(files).toEqual([
      "index.css",
      "main.css",
      "icon-colors.css",
      "typography.css",
      "spacing.css",
      "radius.css",
      "elevation.css",
    ]);
  });

  it("keeps all 70 colour tokens with their names and values unchanged", () => {
    const tokens = collectTokens(resolveTokensCss());
    expect(Object.keys(SNAPSHOT)).toHaveLength(70);
    for (const [name, value] of Object.entries(SNAPSHOT)) {
      expect(tokens.get(name), `--${name}`).toEqual({
        value,
        file: expect.stringMatching(/theme\/main\.css$/),
      });
    }
    const colourRoles = [...tokens.keys()].filter((n) =>
      /^(background|text|border)-color-/.test(n)
    );
    expect(colourRoles.sort()).toEqual(Object.keys(SNAPSHOT).sort());
  });

  it("adds the type, spacing, radius, elevation and icon families, each in its own file", () => {
    const tokens = collectTokens(resolveTokensCss());
    for (const [family, { file, names }] of Object.entries(FAMILIES)) {
      expect(names.length, family).toBeGreaterThan(0);
      for (const name of names) {
        expect(tokens.get(name)?.file, `--${name}`).toBe(
          `${dirname(resolveTokensCss())}/${file}`
        );
      }
    }
    expect(tokens.size).toBe(70 + NEW_TOKEN_NAMES.length);
  });

  it("yields every token, old and new, through a real Tailwind v4 compile", async () => {
    const tokens = collectTokens(resolveTokensCss());
    const names = [...Object.keys(SNAPSHOT), ...NEW_TOKEN_NAMES];
    const probe = names
      .map((name, i) => `  --probe-${i}: var(--${name});`)
      .join("\n");
    const output = await compileTailwind(
      `@import "tailwindcss";\n@import "@medaris/tokens/css";\n.probe {\n${probe}\n}\n`
    );
    const emitted = emittedThemeVars(output);
    for (const name of names) {
      expect(emitted.get(name), `--${name}`).toBeDefined();
      expect(emitted.get(name), `--${name}`).toBe(tokens.get(name)?.value);
    }
  });

  it("publishes every file the entry point imports", () => {
    const pkg = JSON.parse(
      readFileSync(`${PACKAGE_ROOT}/package.json`, "utf8")
    );
    expect(pkg.exports["./css"]).toBe("./theme/index.css");
    expect(pkg.files).toContain("theme/*.css");
    for (const file of importGraph(resolveTokensCss())) {
      expect(relative(PACKAGE_ROOT, file)).toMatch(/^theme\/[^/]+\.css$/);
    }
  });
});
