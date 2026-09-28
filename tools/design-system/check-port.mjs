#!/usr/bin/env node
// Warn-only (MDS-AGENT-02): lists what a screen ported from #95 still carries,
// so a person or agent can check each line against pr95-map.json. Findings
// never fail the run; only a missing map or design system does.
//
// In this order: #95 token names the target design system also declares (a
// missed rename resolves silently; drift before benign, as the map's
// `resolvesSilently` says), #95 prop values that are also unified values with
// another meaning, other #95 token names, #95 components that were renamed or
// dropped, #95 components whose target is not built yet (undefined in the
// unified namespace), the #95 window globals, Arabic-script text outside an
// element with lang="ar" (or ota-Arab), a <bdi> or dir="auto", raw colours,
// and ramp names (the primitives of tokens/colors.css). A token line gives the
// map's route: the target for the CSS property in front of it when there is
// one, else `to` and every `byProperty` target, then `contexts` and the note.
import fs from "node:fs";
import path from "node:path";
import {
  designTokens,
  fromRoot,
  manifestOf,
  parseArgs,
  readJson,
  rootDeclarations,
  usageError,
} from "./lib.mjs";

const USAGE =
  "node tools/design-system/check-port.mjs <file-or-dir>... [--map=<pr95-map.json>] [--ds=<design-system-dir>]";
const { args, flags } = parseArgs(USAGE, ["map", "ds"]);
if (!args.length) usageError(USAGE, "expected at least one file or directory");
const mapPath = fromRoot(
  flags.map ?? "design-system/pr95-migration/pr95-map.json"
);
const ds = fromRoot(flags.ds ?? "design-system/medaris-unified");
const colors = path.join(ds, "tokens/colors.css");
for (const p of [mapPath, colors])
  if (!fs.existsSync(p)) usageError(USAGE, `not found: ${p}`);
const map = readJson(mapPath);
const declared = designTokens(ds);
const ramps = new Set(rootDeclarations(fs.readFileSync(colors, "utf8")).keys());
const built = new Set(manifestOf(ds).components.map((c) => c.name));

const RANKS = [
  "#95 token, silent drift",
  "#95 token, silent benign",
  "#95 prop value, silent",
  "#95 token",
  "#95 component",
  "#95 component, not built",
  "#95 global",
  "unmarked Arabic",
  "raw colour",
  "ramp name",
];
const rank = (name) => RANKS.indexOf(name);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const nameRe = (name) =>
  new RegExp(`(?<![\\w$])${escapeRe(name)}(?![\\w$])`, "g");
const isComponent = (t) => typeof t === "string" && /^[A-Z]\w*$/.test(t);
const NOT_BUILT =
  "not built yet: undefined in the unified namespace; port the rest of the screen now, the element once it exists";
const PATTERNS = [
  ...Object.entries(map.components).flatMap(([name, c]) => {
    const pending = isComponent(c.to) && !built.has(c.to);
    if (c.to !== name)
      return [
        [
          rank("#95 component"),
          nameRe(name),
          `→ ${c.to ?? "no target"} (${c.op})${pending ? `, ${NOT_BUILT}` : ""}`,
        ],
      ];
    return pending
      ? [[rank("#95 component, not built"), nameRe(name), NOT_BUILT]]
      : [];
  }),
  ...Object.entries(map.globals ?? {}).map(([g, e]) => [
    rank("#95 global"),
    new RegExp(`${escapeRe(g)}(?![\\w$])`, "g"),
    `→ ${e.to}`,
  ]),
  [
    rank("raw colour"),
    /(?<![\w&#-])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])|\b(?:rgba?|hsla?|oklch|oklab)\([^)]*\)/gi,
    "use a semantic token",
  ],
];
const ARABIC =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+/;
const TAG_OR_ARABIC = new RegExp(
  `<(/?)([A-Za-z][\\w.:-]*)([^<>]*?)(/?)>|${ARABIC.source}`,
  "g"
);
const VOID = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
]);
const LANG_AR = /\blang\s*=\s*\{?\s*["'](?:ar|ota-Arab)\b/;
const DIR_AUTO = /\bdir\s*=\s*\{?\s*["']auto["']/;

// A #95 prop value that the unified component also accepts, with another
// meaning (Button variant="ghost" is #95's bordered ghost, the unified
// outline): left unported it renders, wrongly.
const SILENT_VALUES = new Map(
  Object.entries(map.components).map(([name, c]) => [
    name,
    Object.entries(c.props ?? {}).flatMap(([prop, p]) => {
      const targets = new Set(Object.values(p.values ?? {}));
      return Object.entries(p.values ?? {})
        .filter(([from, to]) => from !== to && targets.has(from))
        .map(([from, to]) => ({
          re: new RegExp(
            `(?<![\\w-])${prop}\\s*=\\s*\\{?\\s*["'\`]${escapeRe(from)}["'\`]`
          ),
          note: `${prop}="${from}" is #95's ${from}, the unified ${to}; left as it is it renders the unified ${from}`,
        }));
    }),
  ])
);

// The map's route for a token: the CSS property in front of the var() picks a
// byProperty target (the classes of the map's $comment).
const PROPERTY_CLASS = [
  [/^(color|caret-color|text-decoration-color)$/, "text"],
  [/^background/, "bg"],
  [/^(border|outline)/, "border"],
  [/^(fill|stroke)$/, "icon"],
  [/^box-shadow$/, "ring"],
];
function propertyBefore(src, index) {
  const line = src.slice(src.lastIndexOf("\n", index - 1) + 1, index);
  const m = line.match(/([A-Za-z][\w-]*)\s*:[^:;{},]*$/);
  if (!m) return null;
  const prop = m[1].replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  return PROPERTY_CLASS.find(([re]) => re.test(prop))?.[1] ?? null;
}
function route(e, cls) {
  const by = e.byProperty ?? {};
  const parts = [];
  if (cls && by[cls]) parts.push(`→ ${by[cls]} (${cls})`);
  else if (!e.to) parts.push("dropped");
  else {
    const others = Object.entries(by).filter(([, t]) => t !== e.to);
    parts.push(
      `→ ${e.to}${others.length ? ` (${others.map(([k, t]) => `${k}: ${t}`).join(", ")})` : ""}`
    );
  }
  for (const c of e.contexts ?? [])
    parts.push(
      `when ${c.when} → ${c.to}${c.inherits ? ` (${c.inherits})` : ""}`
    );
  if (e.note) parts.push(e.note);
  return parts.join(" · ");
}

// The attributes of the JSX opening tag whose name ends at `from`: up to the
// first ">" outside braces and quotes, so a nested element in a prop is kept.
function attributesAt(src, from) {
  let depth = 0;
  let quote = null;
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return src.slice(from, i);
  }
  return src.slice(from);
}

function findingsIn(src) {
  const out = [];
  for (const [name, values] of SILENT_VALUES) {
    if (!values.length) continue;
    for (const m of src.matchAll(
      new RegExp(`<${escapeRe(name)}(?![\\w$.:-])`, "g")
    )) {
      const attrs = attributesAt(src, m.index + m[0].length);
      for (const { re, note } of values)
        if (re.test(attrs)) out.push([rank("#95 prop value, silent"), m, note]);
    }
  }
  for (const m of src.matchAll(/(?<![\w-])--[\w-]+/g)) {
    const e = map.tokens[m[0]];
    if (e && declared.has(m[0])) {
      const silent = e.silentNote ?? "the map does not flag resolvesSilently";
      out.push([
        e.resolvesSilently === "benign"
          ? rank("#95 token, silent benign")
          : rank("#95 token, silent drift"),
        m,
        `${silent} · ${route(e, propertyBefore(src, m.index))}`,
      ]);
    } else if (e)
      out.push([rank("#95 token"), m, route(e, propertyBefore(src, m.index))]);
    else if (ramps.has(m[0]))
      out.push([rank("ramp name"), m, "name the role (MDS-TOK-01)"]);
  }
  for (const [rank, re, note] of PATTERNS)
    for (const m of src.matchAll(re)) out.push([rank, m, note]);
  const open = [];
  for (const m of src.matchAll(TAG_OR_ARABIC)) {
    if (m[2] && m[1]) {
      const at = open.findLastIndex((e) => e.name === m[2]);
      if (at >= 0) open.length = at;
    } else if (m[2]) {
      if (!m[4] && !VOID.has(m[2].toLowerCase()))
        open.push({
          name: m[2],
          ok:
            LANG_AR.test(m[3]) ||
            m[2].toLowerCase() === "bdi" ||
            DIR_AUTO.test(m[3]),
        });
    } else if (!open.some((e) => e.ok)) {
      out.push([
        rank("unmarked Arabic"),
        m,
        'wrap it in lang="ar" dir="rtl" (.mds-arabic / .mds-arabic-text); author or user data: <bdi> or dir="auto"',
      ]);
    }
  }
  return out;
}

const walk = (p) =>
  fs.statSync(p).isDirectory()
    ? fs
        .readdirSync(p)
        .filter((n) => n !== "node_modules")
        .flatMap((n) => walk(path.join(p, n)))
    : [p];
const targets = args
  .map(fromRoot)
  .flatMap(walk)
  .filter((f) => /\.(jsx?|tsx?|mjs|html|css)$/.test(f));
let total = 0;
for (const file of targets) {
  const src = fs.readFileSync(file, "utf8");
  const lineAt = (i) => src.slice(0, i).split("\n").length;
  const found = findingsIn(src).sort(
    (a, b) => a[0] - b[0] || a[1].index - b[1].index
  );
  if (!found.length) continue;
  console.log(file);
  for (const [rank, m, note] of found) {
    const col = m.index - src.lastIndexOf("\n", m.index - 1);
    console.log(
      `  ${lineAt(m.index)}:${col}  ${RANKS[rank].padEnd(24)} ${m[0].slice(0, 40)}  ${note}`
    );
  }
  total += found.length;
}
console.log(
  `check-port: ${total} finding${total === 1 ? "" : "s"} in ${targets.length} file${targets.length === 1 ? "" : "s"} (warn only; port each by pr95-map.json)`
);
