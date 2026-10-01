/**
 * MDRS-73 AC1, second half of "no existing token changes": the new files sit
 * inside `@theme`, next to Tailwind's own defaults, so a name that collides
 * with a Tailwind default would silently restyle every utility built on it.
 * Measured before choosing the names: --spacing-md turns max-w-md from 28rem
 * into 16px, --radius-full replaces rounded-full, --border-width-s/-l give
 * border-s and border-l a second all-sides rule, and --breakpoint-* gives
 * every `container` extra max-width steps.
 *
 * So: the utilities the apps already use must compile byte-identically with
 * the new entry point and with the old one (theme/main.css alone), and a
 * Tailwind default the package does re-declare (the seven shadows, seven of
 * the weights) must carry exactly the default's value.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NEW_TOKEN_NAMES } from "./families.js";
import {
  collectTokens,
  compileTailwind,
  declarationMap,
  PACKAGE_ROOT,
  resolveTokensCss,
} from "./support/css-tokens.js";

const require = createRequire(import.meta.url);
const TAILWIND_DEFAULTS = declarationMap(
  readFileSync(require.resolve("tailwindcss/theme.css"), "utf8")
);
const SHADOWS = ["2xs", "xs", "sm", "md", "lg", "xl", "2xl"].map(
  (s) => `shadow-${s}`
);

const CANDIDATES = [
  ...["xs", "sm", "md", "lg", "xl", "2xl", "3xl", "4xl"].flatMap((s) => [
    `max-w-${s}`,
    `w-${s}`,
    `size-${s}`,
  ]),
  ...["p-4", "gap-2", "space-y-4", "m-px"],
  ...["", "-xs", "-sm", "-md", "-lg", "-xl", "-2xl", "-full", "-none"].map(
    (s) => `rounded${s}`
  ),
  ...[
    "border",
    "border-0",
    "border-2",
    "border-4",
    "border-s",
    "border-e",
    "border-l",
    "border-r",
    "border-t",
    "border-b",
    "border-x",
    "border-y",
  ],
  ...["none", "tight", "snug", "normal", "relaxed", "loose"].map(
    (s) => `leading-${s}`
  ),
  ...["tighter", "tight", "normal", "wide", "wider", "widest"].map(
    (s) => `tracking-${s}`
  ),
  ...[
    "sans",
    "serif",
    "mono",
    "thin",
    "extralight",
    "light",
    "normal",
    "medium",
    "semibold",
    "bold",
    "extrabold",
    "black",
  ].map((s) => `font-${s}`),
  ...[
    "xs",
    "sm",
    "base",
    "lg",
    "xl",
    "2xl",
    "3xl",
    "4xl",
    "5xl",
    "6xl",
    "7xl",
    "8xl",
    "9xl",
  ].map((s) => `text-${s}`),
  ...["sm", "md", "lg", "xl", "2xl", "max-sm", "max-md", "max-lg"].map(
    (bp) => `${bp}:p-2`
  ),
  "container",
  "shadow",
  "shadow-none",
  ...SHADOWS,
  "shadow-sm/50",
  "shadow-md/25",
  "ring",
  "ring-2",
  "bg-neutral-primary",
  "text-brand-primary",
  "border-brand-primary",
];

describe("AC1: the new tokens restyle nothing that already exists", () => {
  it("compiles every existing Tailwind utility the same as the old entry point did", async () => {
    const before = await compileTailwind(
      `@import "tailwindcss";\n@import "${join(PACKAGE_ROOT, "theme/main.css")}";\n`,
      CANDIDATES
    );
    const after = await compileTailwind(
      `@import "tailwindcss";\n@import "@medaris/tokens/css";\n`,
      CANDIDATES
    );
    expect(after).toBe(before);
  });

  it("re-declares a Tailwind default only with exactly the default's value", () => {
    const tokens = collectTokens(resolveTokensCss());
    const collisions = NEW_TOKEN_NAMES.filter((name) =>
      TAILWIND_DEFAULTS.has(name)
    );
    for (const name of collisions) {
      const ours = (tokens.get(name) as { value: string }).value;
      const theirs = TAILWIND_DEFAULTS.get(name) as string;
      expect(ours, `--${name}`).toBe(theirs);
    }
    expect(
      collisions.filter((n) => !n.startsWith("font-weight-")).sort()
    ).toEqual([...SHADOWS].sort());
  });
});
