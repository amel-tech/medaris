/**
 * Just enough CSS reading for the @medaris/tokens suite (MDRS-73).
 *
 * The package ships CSS and nothing executable, so the specs assert on the
 * CSS itself — through this reader, and through a real Tailwind compile of
 * the same `@import "@medaris/tokens/css"` the apps write. The reader is
 * deliberately small: custom-property declarations, relative @imports, and
 * the three colour/length/shadow notations the token files actually use.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { compile } from "tailwindcss";

const require = createRequire(import.meta.url);

/** libs/tokens */
export const PACKAGE_ROOT = resolve(
  dirname(require.resolve("../../package.json"))
);
/** the repository root */
export const REPO_ROOT = resolve(PACKAGE_ROOT, "../..");

/**
 * Package specifiers resolve from libs/ui, a real consumer that declares
 * `@medaris/tokens: workspace:*`, so resolution goes through the same pnpm
 * link and the same package.json exports an app's bundler sees. Resolving
 * from inside this package would be a self-reference, which is not how any
 * consumer reaches it and which @nx/enforce-module-boundaries rejects.
 */
const consumerRequire = createRequire(join(REPO_ROOT, "libs/ui/package.json"));
export const TOKENS_CSS = "@medaris/tokens/css";

export interface Declaration {
  name: string;
  value: string;
  /** the same-line trailing comment, "" when there is none */
  note: string;
}

// A comment that opens a line is a header or a section title; one that
// follows a declaration on its line is that declaration's note. Headers are
// dropped before matching because they quote declarations as prose.
const LEADING_COMMENT = /^[ \t]*\/\*[\s\S]*?\*\//gm;
const DECLARATION =
  /--([\w-]+)\s*:\s*([^;]+);[ \t]*(?:\/\*\s*([\s\S]*?)\s*\*\/)?/g;
const IMPORT = /@import\s+["']([^"']+)["']\s*;/g;

export function readDeclarations(css: string): Declaration[] {
  const body = css.replace(LEADING_COMMENT, "");
  return [...body.matchAll(DECLARATION)].map(([, name, value, note]) => ({
    name: name as string,
    value: (value as string).trim().replace(/\s+/g, " "),
    note: note ?? "",
  }));
}

export function declarationMap(css: string): Map<string, string> {
  return new Map(readDeclarations(css).map((d) => [d.name, d.value]));
}

/** The entry file followed by everything it @imports, depth-first. */
export function importGraph(entry: string, seen = new Set<string>()): string[] {
  if (seen.has(entry)) return [];
  seen.add(entry);
  const css = readFileSync(entry, "utf8").replace(LEADING_COMMENT, "");
  const files = [entry];
  for (const match of css.matchAll(IMPORT)) {
    const specifier = match[1] as string;
    if (!specifier.startsWith(".")) {
      throw new Error(`non-relative @import "${specifier}" in ${entry}`);
    }
    files.push(...importGraph(resolve(dirname(entry), specifier), seen));
  }
  return files;
}

export interface Token {
  value: string;
  file: string;
}

/** Every custom property reachable from `entry`; a name declared twice throws. */
export function collectTokens(entry: string): Map<string, Token> {
  const tokens = new Map<string, Token>();
  for (const file of importGraph(entry)) {
    for (const { name, value } of readDeclarations(
      readFileSync(file, "utf8")
    )) {
      const previous = tokens.get(name);
      if (previous) {
        throw new Error(
          `--${name} is declared in both ${previous.file} and ${file}`
        );
      }
      tokens.set(name, { value, file });
    }
  }
  return tokens;
}

/** What `@import "@medaris/tokens/css"` resolves to in a consumer. */
export function resolveTokensCss(): string {
  return consumerRequire.resolve(TOKENS_CSS);
}

/**
 * Runs Tailwind v4 over `css` and builds `candidates`, resolving @import the
 * way a consumer's bundler does: `tailwindcss` to its stylesheet, relative and
 * absolute paths from the importing file, package specifiers through Node.
 */
export async function compileTailwind(
  css: string,
  candidates: string[] = []
): Promise<string> {
  const compiler = await compile(css, {
    base: PACKAGE_ROOT,
    loadStylesheet: async (id, base) => {
      let path: string;
      if (id === "tailwindcss") {
        path = require.resolve("tailwindcss/index.css");
      } else if (id.startsWith(".") || isAbsolute(id)) {
        path = resolve(base, id);
      } else {
        path = consumerRequire.resolve(id);
      }
      return { path, base: dirname(path), content: readFileSync(path, "utf8") };
    },
  });
  return compiler.build(candidates);
}

/** The variables Tailwind emitted into `@layer theme { :root, :host { … } }`. */
export function emittedThemeVars(output: string): Map<string, string> {
  const block = output.match(/:root, :host \{([^}]*)\}/);
  return block ? declarationMap(block[1] as string) : new Map();
}

/** A px or rem length in px (16px root). */
export function toPx(value: string): number {
  const match = value.match(/^(-?\d*\.?\d+)(px|rem)$/);
  if (!match) throw new Error(`not a px or rem length: ${value}`);
  return Number(match[1]) * (match[2] === "rem" ? 16 : 1);
}

/** #rrggbb, #rrggbbaa, rgb(r g b / a) or rgba(r, g, b, a) as [r, g, b, alpha 0-255]. */
export function parseColour(colour: string): number[] {
  const hex = colour.match(/^#([0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hex) {
    const group = hex[1] as string;
    const digits = group.length === 6 ? `${group}ff` : group;
    return [0, 2, 4, 6].map((i) => Number.parseInt(digits.slice(i, i + 2), 16));
  }
  const fn = colour.match(/^rgba?\(([^)]*)\)$/);
  if (!fn) throw new Error(`not a colour this suite reads: ${colour}`);
  const channels = (fn[1] as string)
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map(Number);
  return [...channels.slice(0, 3), Math.round((channels[3] ?? 1) * 255)];
}

/**
 * A box-shadow as a sorted list of layers, each "x y blur spread r,g,b,a255",
 * so two notations of the same shadow compare equal: omitted lengths are 0,
 * the colour is 8-bit, and layer order is ignored — for layers of one colour
 * the stacking order does not change the composited result.
 */
export function normaliseShadow(value: string): string[] {
  return value
    .split(/,(?![^(]*\))/)
    .map((layer) => {
      const parts = layer.trim().split(/\s+(?![^(]*\))/);
      const colour = parts.pop() as string;
      const lengths = [...parts, "0", "0", "0", "0"]
        .slice(0, 4)
        .map((length) => (length === "0" ? 0 : toPx(length)));
      return `${lengths.join(" ")} ${parseColour(colour).join(",")}`;
    })
    .sort();
}
