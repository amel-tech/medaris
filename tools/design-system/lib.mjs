// Shared by the scripts in this directory: where the repository is, how their
// arguments are read, and how a design system's token files are parsed.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MARKER = "pnpm-workspace.yaml";

// The walk of libs/env's findRepoRoot: up from this file to the directory that
// holds pnpm-workspace.yaml. Not finding it is an error, never a guess.
export function findRepoRoot(from = dirname(fileURLToPath(import.meta.url))) {
  let dir = resolve(from);
  for (;;) {
    if (existsSync(join(dir, MARKER))) return dir;
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(`no ${MARKER} found walking up from ${resolve(from)}`);
    }
    dir = parent;
  }
}

export const repoRoot = findRepoRoot();

// A relative path is taken from the repository root, so every script behaves
// the same from any working directory. An absolute path is kept as it is.
export const fromRoot = (p) => resolve(repoRoot, p);

// The design system a check reads when it is given no directory.
export const DEFAULT_DIR = "design-system/medaris-unified";

export function usageError(usage, message) {
  console.error(message);
  console.error(`usage: ${usage}`);
  process.exit(2);
}

// `--name` and `--name=value` become flags, everything else is positional.
// `--help` prints the one-line usage and exits 0; an unknown flag exits 2.
export function parseArgs(usage, known, argv = process.argv.slice(2)) {
  const flags = {};
  const args = [];
  for (const a of argv) {
    const m = a.match(/^--([\w-]+)(?:=(.*))?$/);
    if (m) flags[m[1]] = m[2] ?? true;
    else args.push(a);
  }
  if (flags.help || argv.includes("-h")) {
    console.log(`usage: ${usage}`);
    process.exit(0);
  }
  const unknown = Object.keys(flags).filter((f) => !known.includes(f));
  if (unknown.length) usageError(usage, `unknown flag: --${unknown[0]}`);
  return { args, flags };
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export const stripCssComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

// Every rule of a stylesheet that holds declarations and no other rule: its
// selector, the selector of the block around it (an `@media`, or null at the
// top level) and its custom properties in source order.
export function cssBlocks(css) {
  const src = stripCssComments(css)
    .replace(/@import\s+url\([^)]*\)[^;]*;/g, "")
    .replace(/@import[^;]*;/g, "");
  const out = [];
  const selector = [];
  const bodyStart = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") {
      selector[depth] = src.slice(start, i).trim();
      bodyStart[depth] = i + 1;
      depth++;
      start = i + 1;
    } else if (ch === "}") {
      depth--;
      const body = src.slice(bodyStart[depth], i);
      if (!body.includes("{")) {
        const decls = new Map();
        for (const d of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)) {
          decls.set(d[1], d[2].replace(/\s+/g, " ").trim());
        }
        out.push({
          selector: selector[depth],
          parent: depth ? selector[depth - 1] : null,
          decls,
        });
      }
      start = i + 1;
    } else if (ch === ";" && depth === 0) start = i + 1;
  }
  return out;
}

// The files a design system's styles.css imports, in order. Only the
// `@import url("…")` form is followed, as in the app's generator.
export function importedCss(dir) {
  const entry = readFileSync(join(dir, "styles.css"), "utf8");
  return [
    ...stripCssComments(entry).matchAll(
      /@import\s+url\(\s*["']?([^"')]+)["']?\s*\)/g
    ),
  ].map((m) => m[1]);
}

// The token files that hold colours. tokens/colors.css holds the primitives
// and nothing else.
export const COLOUR_FILES = ["colors", "semantic", "elevation", "domain"].map(
  (f) => `tokens/${f}.css`
);

// The colour tokens of a design system in its two themes. `day` is every
// top-level `:root` declaration. Each file writes its night values twice, under
// `html[data-theme="dark"]` and under `prefers-color-scheme: dark`; `night` is
// `day` with the first on top, and `problems` names a file whose two differ.
export function colourThemes(dir) {
  const day = new Map();
  const nightOnly = new Map();
  const primitives = new Set();
  const problems = [];
  for (const f of COLOUR_FILES) {
    const file = join(dir, f);
    if (!existsSync(file)) {
      problems.push(`${f} does not exist`);
      continue;
    }
    const blocks = cssBlocks(readFileSync(file, "utf8"));
    for (const b of blocks.filter((b) => b.selector === ":root" && !b.parent)) {
      for (const [k, v] of b.decls) {
        day.set(k, v);
        if (f === "tokens/colors.css") primitives.add(k);
      }
    }
    const attr = blocks.find((b) =>
      b.selector.startsWith('html[data-theme="dark"]')
    );
    const media = blocks.find((b) =>
      b.parent?.includes("prefers-color-scheme: dark")
    );
    const text = (b) => [...(b?.decls ?? [])].map((d) => d.join(":")).join(";");
    if (text(attr) !== text(media)) {
      problems.push(
        `${f}: the [data-theme="dark"] block and the prefers-color-scheme block differ`
      );
    }
    for (const [k, v] of attr?.decls ?? []) nightOnly.set(k, v);
  }
  return {
    day,
    night: new Map([...day, ...nightOnly]),
    nightOnly,
    primitives,
    problems,
  };
}

// Replaces every var(--x) (and var(--x, fallback)) with its value, recursively.
export function resolver(values) {
  const run = (v, depth) =>
    depth > 16
      ? v
      : v.replace(
          /var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*))?\)/g,
          (m, name, fallback) => {
            if (values.has(name)) return run(values.get(name), depth + 1);
            return fallback === undefined ? m : run(fallback.trim(), depth + 1);
          }
        );
  return (v) => run(v, 0);
}
