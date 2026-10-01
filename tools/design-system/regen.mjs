#!/usr/bin/env node
// Rebuilds the three files the claude.ai/design app generates for a design
// system project — _ds_bundle.js, _ds_manifest.json, _adherence.oxlintrc.json —
// from the project's own sources (components/*.jsx + *.d.ts, the CSS styles.css
// imports, *.card.html).
//
// Reverse-engineered against the canonical mirror (design-system/, pulled
// 2026-09-22): with @babel/standalone 7.29.9 all three outputs are
// byte-identical to the mirror's. What was inferred rather than known is listed
// in README.md; when the app's own output differs after a sync, the app wins
// and this script is what changes.
//
// It never writes into <source-dir>. To regenerate a directory, write to a
// scratch directory and copy the three files over; `--check` then passes.
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fromRoot, parseArgs, usageError } from "./lib.mjs";

const USAGE =
  "node tools/design-system/regen.mjs <source-dir> <target-dir> [--check] [--namespace=<Name_abcdef>]";
const { args, flags } = parseArgs(USAGE, ["check", "namespace"]);
if (args.length !== 2) usageError(USAGE, "expected <source-dir> <target-dir>");

const require = createRequire(import.meta.url);
const Babel = require("@babel/standalone");

const SRC = fromRoot(args[0]);
const OUT = fromRoot(args[1]);
if (OUT === SRC || OUT.startsWith(SRC + path.sep)) {
  usageError(USAGE, `refusing to write inside the source dir: ${OUT}`);
}
if (!fs.existsSync(path.join(SRC, "styles.css"))) {
  usageError(USAGE, `not a design-system directory (no styles.css): ${SRC}`);
}
const CHECK = flags.check === true;

const read = (p) => fs.readFileSync(path.join(SRC, p), "utf8");
const exists = (p) => fs.existsSync(path.join(SRC, p));
const sha12 = (buf) =>
  crypto.createHash("sha256").update(buf).digest("hex").slice(0, 12);
const byCodepoint = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// ---------------------------------------------------------------- namespace
// "<PascalCase(project name)>_<first 6 hex of project id>". The project name is
// in no source file, so it comes from the existing manifest, else --namespace.
function namespaceOf() {
  if (typeof flags.namespace === "string") return flags.namespace;
  if (exists("_ds_manifest.json")) {
    return JSON.parse(read("_ds_manifest.json")).namespace;
  }
  throw new Error("no namespace: pass --namespace=<Name_abcdef>");
}
const NS = namespaceOf();

// ---------------------------------------------------------------- components
const compFiles = fs
  .readdirSync(path.join(SRC, "components"))
  .filter((f) => f.endsWith(".jsx"))
  .sort(byCodepoint)
  .map((f) => `components/${f}`);

function exportsOf(src) {
  return [
    ...src.matchAll(
      /^export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/gm
    ),
  ].map((m) => m[1]);
}
const isComponent = (n) => /^[A-Z]/.test(n);

// Imports are dropped (React is a global on the canvas) and so is the export
// keyword; Babel's classic runtime then turns JSX into React.createElement with
// #__PURE__ marks and inlines the _extends helper where props are spread.
function compile(src) {
  const stripped = src
    .replace(/^import\s[^;]*;[ \t]*\n/gm, "")
    .replace(/^export\s+(?=(?:async\s+)?(?:function|const|let|class)\b)/gm, "");
  const { code } = Babel.transform(stripped, {
    presets: [["react", { runtime: "classic" }]],
    sourceType: "module",
    babelrc: false,
    configFile: false,
  });
  return code;
}

function buildBundle() {
  const components = [];
  const unexposed = [];
  const hashes = {};
  const sections = [];
  for (const p of compFiles) {
    const raw = fs.readFileSync(path.join(SRC, p));
    const src = raw.toString("utf8");
    hashes[p] = sha12(raw);
    const names = exportsOf(src);
    for (const n of names) {
      (isComponent(n) ? components : unexposed).push({
        name: n,
        sourcePath: p,
      });
    }
    sections.push(
      `// ${p}\ntry { (() => {\n${compile(src)}\nObject.assign(__ds_scope, { ${names.join(", ")} });\n})(); } catch (e) { __ds_ns.__errors.push({ path: ${JSON.stringify(p)}, error: String((e && e.message) || e) }); }`
    );
  }
  const header = {
    format: 4,
    namespace: NS,
    components,
    sourceHashes: hashes,
    inlinedExternals: [],
    unexposedExports: unexposed,
  };
  const parts = [
    `/* @ds-bundle: ${JSON.stringify(header)} */`,
    "(() => {",
    `const __ds_ns = (window.${NS} = window.${NS} || {});`,
    "const __ds_scope = {};",
    "(__ds_ns.__errors = __ds_ns.__errors || []);",
    ...sections,
    ...components.map((c) => `__ds_ns.${c.name} = __ds_scope.${c.name};`),
    "})();\n",
  ];
  return { text: parts.join("\n\n"), components, unexposed };
}

// ---------------------------------------------------------------- tokens
// styles.css @imports in order, then the entry file itself.
function globalCssPaths() {
  const entry = "styles.css";
  const list = [
    ...read(entry).matchAll(/@import\s+url\(\s*["']?([^"')]+)["']?\s*\)/g),
  ].map((m) => m[1]);
  return [...list, entry];
}

// The rule ORDER is inferred: the simplest order that reproduces every kind in
// the mirror's manifest, quirks included (--text-* is "font" because Tailwind's
// --text-* namespace is font size; a value holding var() is "color"; --fs-* and
// --border-xs are "spacing" because their values are lengths).
const COLOR_LITERAL =
  /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color)\(.*\)|transparent|currentcolor|white|black)$/i;
const LENGTH = /^-?[\d.]+(px|rem|em|%|vh|vw|ch)$/i;
function tokenKind(name, value) {
  if (/^--(font|text|weight|tracking)(-|$)/.test(name)) return "font";
  if (value.includes("var(")) return "color";
  if (/^--radius(-|$)/.test(name)) return "radius";
  if (COLOR_LITERAL.test(value)) return "color";
  if (/^--(shadow|ring)(-|$)/.test(name)) return "shadow";
  if (LENGTH.test(value)) return "spacing";
  return "other";
}

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

// Every `--name: value;` in each global CSS file, file order then source order.
// A later declaration of a name overwrites the value but keeps the first
// position (Map semantics), which is what the mirror's manifest shows.
function collectTokens(cssPaths) {
  const seen = new Map();
  for (const p of cssPaths) {
    if (!exists(p)) continue;
    const css = stripComments(read(p));
    for (const d of css.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/g)) {
      const name = d[1];
      const value = d[2].replace(/\s+/g, " ").trim();
      const prev = seen.get(name);
      seen.set(name, {
        name,
        value,
        kind: tokenKind(name, value),
        definedIn: prev ? prev.definedIn : p,
      });
    }
  }
  return [...seen.values()];
}

// ---------------------------------------------------------------- fonts
function brandFonts(tokens) {
  const out = [];
  for (const t of tokens) {
    if (!/^--font-/.test(t.name)) continue;
    const first = t.value
      .split(",")[0]
      .trim()
      .replace(/^["']|["']$/g, "");
    if (/^(ui-|system-ui|sans-serif|serif|monospace)/.test(first)) continue;
    out.push({
      family: first,
      status: "ok",
      tokens: [t.name],
      path: t.definedIn,
    });
  }
  return out;
}

// ---------------------------------------------------------------- cards
function cards() {
  const out = [];
  for (const dir of ["components", "foundations", "patterns", "templates"]) {
    if (!exists(dir)) continue;
    for (const f of fs
      .readdirSync(path.join(SRC, dir))
      .filter((x) => x.endsWith(".card.html"))) {
      const p = `${dir}/${f}`;
      const first = read(p).split("\n")[0];
      const m = first.match(/<!--\s*@dsCard\s+(.*?)\s*-->/);
      if (!m) continue;
      const attrs = Object.fromEntries(
        [...m[1].matchAll(/(\w+)="([^"]*)"/g)].map((a) => [a[1], a[2]])
      );
      out.push({
        path: p,
        group: attrs.group,
        viewport: attrs.viewport,
        subtitle: attrs.subtitle,
        name: attrs.name,
      });
    }
  }
  return out.sort(
    (a, b) => byCodepoint(a.group, b.group) || byCodepoint(a.path, b.path)
  );
}

// ---------------------------------------------------------------- manifest
function buildManifest(bundle, tokens, cssPaths) {
  return {
    namespace: NS,
    components: bundle.components,
    startingPoints: [],
    cards: cards(),
    templates: [],
    hasThumbnailHtml: exists("thumbnail.html"),
    globalCssPaths: cssPaths,
    tokens,
    themes: [],
    fonts: [],
    brandFonts: brandFonts(tokens),
    source: "spa",
  };
}

// ---------------------------------------------------------------- adherence
// One entry per .d.ts: the FIRST `export interface`, "Props" suffix stripped.
// Its members become the allowed props; a member typed as an inline union of
// string literals also gets a value rule. Type aliases are not resolved.
function parseFirstInterface(dts) {
  const m = dts.match(/export interface (\w+)(?:<[^>]*>)?[^{]*\{/);
  if (!m) return null;
  let i = m.index + m[0].length;
  let depth = 1;
  while (depth && i < dts.length) {
    if (dts[i] === "{") depth++;
    else if (dts[i] === "}") depth--;
    i++;
  }
  const body = dts.slice(m.index + m[0].length, i - 1);
  const clean = body.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const members = [];
  let d = 0;
  let cur = "";
  for (const ch of clean) {
    if ("{(<[".includes(ch)) d++;
    if ("})>]".includes(ch)) d--;
    if ((ch === ";" || ch === "\n") && d === 0) {
      if (cur.trim()) members.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) members.push(cur.trim());
  const props = [];
  for (const mem of members) {
    const pm = mem.match(/^(\w+)\??\s*:\s*([\s\S]+)$/);
    if (!pm) continue;
    const type = pm[2].trim();
    const lits = type.split("|").map((s) => s.trim());
    const isUnion = lits.length > 1 && lits.every((s) => /^'[^']*'$/.test(s));
    props.push({
      name: pm[1],
      values: isUnion ? lits.map((s) => s.slice(1, -1)) : null,
    });
  }
  return { name: m[1].replace(/Props$/, ""), props };
}

function buildAdherence(tokens, fonts) {
  const dtsFiles = fs
    .readdirSync(path.join(SRC, "components"))
    .filter((f) => f.endsWith(".d.ts"))
    .sort(byCodepoint);
  const comps = [];
  for (const f of dtsFiles) {
    const iface = parseFirstInterface(read(`components/${f}`));
    if (iface) comps.push(iface);
  }
  const families = fonts.map((f) => f.family);
  const famAlt = families.join("|");
  const restricted = [
    {
      selector: "Literal[value=/#[0-9a-fA-F]{3,8}\\b/]",
      message: "Raw hex color — use a design-system color token via var().",
    },
    {
      selector: "Literal[value=/\\b\\d+px\\b/]",
      message: "Raw px value — use a design-system spacing token via var().",
    },
    {
      selector: `Literal[value=/font-family\\s*:\\s*(?!['\\"]?(?:${famAlt}))/i]`,
      message: `Font not provided by the design system. Available: ${families.join(", ")}.`,
    },
  ];
  for (const c of comps) {
    const allowed = [
      ...c.props.map((p) => p.name),
      "key",
      "ref",
      "className",
      "style",
      "children",
    ];
    restricted.push({
      selector: `JSXOpeningElement[name.name='${c.name}'] > JSXAttribute > JSXIdentifier[name!=/^(?:${allowed.join("|")})$/]`,
      message: `<${c.name}> doesn't accept that prop. Declared props: ${c.props.map((p) => p.name).join(", ")}.`,
    });
    for (const p of c.props) {
      if (!p.values) continue;
      restricted.push({
        selector: `JSXOpeningElement[name.name='${c.name}'] > JSXAttribute[name.name='${p.name}'] > Literal[value!=/^(?:${p.values.join("|")})$/]`,
        message: `<${c.name}> ${p.name} must be one of ${p.values.map((v) => `'${v}'`).join(" | ")}.`,
      });
    }
  }
  const tokenNames = tokens.map((t) => t.name).sort(byCodepoint);
  return {
    plugins: ["react", "import"],
    rules: {
      "react/forbid-elements": ["warn", { forbid: [] }],
      "no-restricted-imports": [
        "warn",
        {
          patterns: [
            {
              group: ["components/**"],
              message:
                "Import design-system components from 'index.js', not component internals.",
            },
          ],
        },
      ],
      "no-restricted-syntax": ["warn", ...restricted],
    },
    overrides: [
      { files: ["**/index.js"], rules: { "no-restricted-imports": "off" } },
    ],
    "x-omelette": {
      components: Object.fromEntries(
        comps.map((c) => [c.name, { replaces: [] }])
      ),
      tokens: tokenNames,
      tokenKinds: Object.fromEntries(tokens.map((t) => [t.name, t.kind])),
      fontFamilies: [...families].sort(byCodepoint),
    },
  };
}

// ---------------------------------------------------------------- main
const bundle = buildBundle();
const cssPaths = globalCssPaths();
const tokens = collectTokens(cssPaths);
const manifest = buildManifest(bundle, tokens, cssPaths);
const adherence = buildAdherence(tokens, manifest.brandFonts);

const outputs = {
  "_ds_bundle.js": bundle.text,
  "_ds_manifest.json": JSON.stringify(manifest),
  "_adherence.oxlintrc.json": JSON.stringify(adherence, null, 2),
};

fs.mkdirSync(OUT, { recursive: true });
let bad = 0;
for (const [name, text] of Object.entries(outputs)) {
  fs.writeFileSync(path.join(OUT, name), text);
  let note = "";
  if (CHECK) {
    const ref = exists(name) ? read(name) : null;
    if (ref !== text) bad++;
    if (ref === null) note = "  MISSING in the source dir";
    else if (ref === text) note = "  identical";
    else {
      note = `  DIFFERS (source ${Buffer.byteLength(ref)} B, generated ${Buffer.byteLength(text)} B)`;
    }
  }
  console.log(
    `${name.padEnd(26)} ${String(Buffer.byteLength(text)).padStart(6)} B${note}`
  );
}
if (CHECK && bad) process.exit(1);
