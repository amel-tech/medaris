/**
 * MDRS-73 AC3 — libs/ui/styles/theme.css sources its radii from the tokens
 * instead of hard-coding them; the two off-scale values (10px, 16px) are
 * resolved onto the scale.
 *
 * Lives in the tokens suite because libs/ui has no test target and the claim
 * is about this package's names; project.json lists theme.css among this
 * target's inputs so an edit there re-runs it.
 *
 * Scope note: the AC names theme.css, and that is what this pins. No app
 * imports theme.css today — the radii the apps render come from
 * libs/ui/src/styles/globals.css — so these tests say nothing about what an
 * app draws (docs/migration/mdrs-73-non-colour-tokens.md, follow-ups).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  collectTokens,
  compileTailwind,
  emittedThemeVars,
  REPO_ROOT,
  readDeclarations,
  resolveTokensCss,
  toPx,
} from "./support/css-tokens.js";

const THEME = join(REPO_ROOT, "libs/ui/styles/theme.css");
const FIGMA_RADII = [4, 6, 8, 12, 20, 30, 999];

function uiRadii() {
  return readDeclarations(readFileSync(THEME, "utf8")).filter((d) =>
    d.name.startsWith("radius-")
  );
}

describe("AC3: libs/ui/styles/theme.css radii", () => {
  it("declares sm, md, lg and xl, each as a reference to a token", () => {
    const tokens = collectTokens(resolveTokensCss());
    const radii = uiRadii();
    expect(radii.map((d) => d.name)).toEqual([
      "radius-sm",
      "radius-md",
      "radius-lg",
      "radius-xl",
    ]);
    for (const { name, value } of radii) {
      const ref = value.match(/^var\(--(corner-radius-[a-z0-9]+)\)$/);
      expect(ref, `--${name}: ${value}`).not.toBeNull();
      expect(tokens.has((ref as RegExpMatchArray)[1] as string), value).toBe(
        true
      );
    }
  });

  it("puts every radius on the Figma scale, keeps sm and md, and keeps the order", () => {
    const tokens = collectTokens(resolveTokensCss());
    const px = uiRadii().map(({ value }) => {
      const name = value.slice("var(--".length, -1);
      return toPx((tokens.get(name) as { value: string }).value);
    });
    for (const value of px) expect(FIGMA_RADII).toContain(value);
    expect(px.slice(0, 2)).toEqual([6, 8]);
    expect(px.includes(10) || px.includes(16)).toBe(false);
    expect([...px].sort((a, b) => a - b)).toEqual(px);
    expect(new Set(px).size).toBe(px.length);
  });

  it("reaches the pixels through Tailwind: rounded-lg is 12px, rounded-xl 20px", async () => {
    const output = await compileTailwind(
      `@import "tailwindcss";\n@import "@medaris/tokens/css";\n@import "${THEME}";\n`,
      ["rounded-sm", "rounded-md", "rounded-lg", "rounded-xl"]
    );
    const emitted = emittedThemeVars(output);
    const resolved = (name: string) => {
      const ref = (emitted.get(name) as string).slice("var(--".length, -1);
      return emitted.get(ref);
    };
    expect(
      ["radius-sm", "radius-md", "radius-lg", "radius-xl"].map(resolved)
    ).toEqual(["6px", "8px", "12px", "20px"]);
  });
});
