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

// The custom properties declared directly inside top-level `:root { … }`
// blocks: the defaults. A contextual re-declaration (`[data-density]`,
// `:lang(ar)`, anything under `@media`) is not a default and is skipped
// (MDS-TOK-02).
export function rootDeclarations(css) {
  const src = stripCssComments(css);
  const out = new Map();
  let depth = 0;
  let start = 0;
  let selector = "";
  let bodyStart = 0;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === ";" && depth === 0) start = i + 1;
    else if (ch === "{") {
      if (depth === 0) {
        selector = src.slice(start, i).trim();
        bodyStart = i + 1;
      }
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        if (selector === ":root") {
          const body = src.slice(bodyStart, i);
          for (const d of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)) {
            out.set(d[1], d[2].replace(/\s+/g, " ").trim());
          }
        }
        start = i + 1;
      }
    }
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

// Token defaults of a design system, read from the CSS rather than the
// generated manifest. With `overrides`, tokens/a11y-overrides.css (which
// styles.css never imports) is applied on top.
export function designTokens(dir, { overrides = false } = {}) {
  const files = importedCss(dir).filter((p) => p.endsWith(".css"));
  if (overrides) files.push("tokens/a11y-overrides.css");
  const values = new Map();
  for (const f of files) {
    const path = join(dir, f);
    if (!existsSync(path)) continue;
    for (const [k, v] of rootDeclarations(readFileSync(path, "utf8"))) {
      values.set(k, v);
    }
  }
  return values;
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

export function manifestOf(dir) {
  const path = join(dir, "_ds_manifest.json");
  if (!existsSync(path)) throw new Error(`no _ds_manifest.json in ${dir}`);
  return readJson(path);
}
