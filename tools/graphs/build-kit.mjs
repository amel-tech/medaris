#!/usr/bin/env node
// Writes the token files and the CSS of the delurio kit in graphs/kit/ from what the apps ship: the tokens of
// libs/tokens/medaris.css and the .mds-* class layer of libs/ui. kit.yaml (the templates) is written by hand.
// Run it from the repository root after a change to either source: node tools/graphs/build-kit.mjs
//
// A kit is data (SPEC.md §8 of @delurio/cli): its tokens are W3C design tokens, and its CSS may hold no :root, html
// or body rule, no at-rule but @media, @supports and @container, and no address but a data: URL. So:
//   tokens.json  every custom property of the top-level :root blocks of medaris.css, under its own name
//                ("--kagit-50" is the token kagit-50); a value that is exactly var(--x) is the alias "{x}"
//   dark.json    the custom properties of its [data-theme="dark"] blocks
//   kit.css      the screen itself (&), then the rules of medaris.css, libs/ui/src/styles/mds/components.css and
//                baseui.css, without @keyframes and without the :root, html and body selectors
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = "graphs/kit";
const TOKENS = "libs/tokens/medaris.css";
const CSS = [
  "libs/tokens/medaris.css",
  "libs/ui/src/styles/mds/components.css",
  "libs/ui/src/styles/mds/baseui.css",
];
const KEPT_AT = new Set(["media", "supports", "container"]);
const OUTSIDE = /^(:root|html|body)\b/i;

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** The top-level blocks of a style sheet: [prelude, body] pairs, with nested braces kept in the body. */
function blocks(css) {
  const out = [];
  let depth = 0;
  let start = 0;
  let prelude = "";
  let quote = null;
  for (let i = 0; i < css.length; i += 1) {
    const c = css[i];
    if (quote) {
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === "{") {
      if (depth === 0) {
        prelude = css.slice(start, i).trim();
        start = i + 1;
      }
      depth += 1;
    } else if (c === "}") {
      depth -= 1;
      if (depth === 0) {
        out.push([prelude, css.slice(start, i)]);
        start = i + 1;
      }
    } else if (c === ";" && depth === 0) {
      start = i + 1; // a top-level statement such as @import: dropped
    }
  }
  return out;
}

/** The custom properties a block declares, in order; a later one of the same name wins. */
function customProperties(body, into) {
  for (const decl of body.split(";")) {
    const m = /^\s*(--[A-Za-z0-9_-]+)\s*:\s*([\s\S]+?)\s*$/.exec(decl);
    if (m) into.set(m[1], m[2].replace(/\s+/g, " "));
  }
}

function tokensFile(props, skipped) {
  const doc = {};
  for (const [name, value] of props) {
    const key = name.slice(2);
    if (/[{}.]/.test(key)) {
      skipped.push(`${name}: the name holds { } or .`);
      continue;
    }
    const alias = /^var\((--[A-Za-z0-9_-]+)\)$/.exec(value);
    if (alias) {
      doc[key] = { $value: `{${alias[1].slice(2)}}` };
      continue;
    }
    if (/[;{}<@\\]|url\(/i.test(value)) {
      skipped.push(`${name}: ${value} is not a plain CSS value`);
      continue;
    }
    doc[key] = { $value: value };
  }
  return doc;
}

/** A rule's selector list without the selectors that never match inside a drawn screen, or null when none is left. */
function keepSelectors(prelude) {
  const kept = topLevelParts(prelude)
    .map((s) => s.trim())
    .filter((s) => s !== "" && !OUTSIDE.test(s));
  return kept.length === 0 ? null : kept.join(", ");
}

/** A selector list split at its own commas, not at those inside :is(), :has() or [attr="a,b"]. */
function topLevelParts(list) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let i = 0; i < list.length; i += 1) {
    const c = list[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "(" || c === "[") depth += 1;
    else if (c === ")" || c === "]") depth -= 1;
    else if (c === "," && depth === 0) {
      parts.push(list.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(list.slice(start));
  return parts;
}

/** The rules of a sheet a kit may hold, nested at-rules filtered the same way. */
function keptRules(css) {
  const out = [];
  for (const [prelude, body] of blocks(css)) {
    const at = /^@([a-z-]+)/i.exec(prelude);
    if (at) {
      if (!KEPT_AT.has(at[1].toLowerCase())) continue;
      const inner = keptRules(body);
      if (inner.length > 0) out.push(`${prelude} {\n${inner.join("\n")}\n}`);
      continue;
    }
    const sel = keepSelectors(prelude);
    if (sel === null) continue;
    const decls = body
      .split(";")
      .map((d) => d.trim())
      // scroll-behavior and overscroll-behavior do nothing in a drawing, and the kit check reads "behavior:" as the
      // old IE script property
      .filter(
        (d) =>
          d !== "" && !d.startsWith("--") && !/^[a-z-]*behavior\s*:/i.test(d)
      );
    if (decls.length === 0) continue;
    out.push(`${sel} { ${decls.join("; ")}; }`);
  }
  return out;
}

const light = new Map();
const dark = new Map();
for (const [prelude, body] of blocks(
  stripComments(readFileSync(TOKENS, "utf8"))
)) {
  if (prelude === ":root") customProperties(body, light);
  else if (/^html\[data-theme="dark"\], \[data-theme="dark"\]$/.test(prelude))
    customProperties(body, dark);
}
for (const name of dark.keys())
  if (!light.has(name)) {
    console.error(`build-kit: dark ${name} has no light value`);
    process.exit(1);
  }

const skipped = [];
const tokens = tokensFile(light, skipped);
const darkTokens = tokensFile(dark, skipped);
for (const k of Object.keys(darkTokens))
  if (!(k in tokens)) delete darkTokens[k];

const screen = [
  "& { color-scheme: light; font-family: var(--font-ui); font-size: var(--fs-body-sm); line-height: var(--lh-normal, 1.5);",
  "  color: var(--text-neutral-default); background: var(--background-neutral-page); }",
];
const rules = CSS.flatMap((f) =>
  keptRules(stripComments(readFileSync(f, "utf8")))
);

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "tokens.json"), `${JSON.stringify(tokens, null, 2)}\n`);
writeFileSync(
  join(OUT, "dark.json"),
  `${JSON.stringify(darkTokens, null, 2)}\n`
);
writeFileSync(
  join(OUT, "kit.css"),
  [
    `/* Generated by tools/graphs/build-kit.mjs from ${CSS.join(", ")}; do not edit. */`,
    ...screen,
    ...rules,
    "",
  ].join("\n")
);
console.log(
  `build-kit: ${Object.keys(tokens).length} tokens, ${Object.keys(darkTokens).length} dark, ${rules.length} rules`
);
for (const s of skipped) console.log(`  skipped ${s}`);
