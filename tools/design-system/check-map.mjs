#!/usr/bin/env node
// Validates pr95-map.json, the #95 (madrasah-frontend) → unified port map,
// against the #95 package it was built from and the design system it targets.
//
// Coverage is measured, not declared: every #95 token (tokens.json, the CSS,
// every var() the package reads), component export and prop (.d.ts interface
// and destructured parameters), sub-type, raw colour literal, base.css rule,
// window global and JS export must have an entry. Every target must be a bare
// token in the design system's manifest, a known .mds-* class, or a component
// that exists or is contracted below. The #95 fingerprint is recomputed by the
// recipe recorded in `pin`, and the names that exist on both sides (a missed
// rename resolves silently) are recounted.
//
// --before=<dir> also checks the pin's counts against the design system the
// map was written against (the canonical mirror before the unified change).
// --write-pin rewrites `pin` with the recomputed values.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createChecker, sameSet, sorted } from "../ci/lib/checks.mjs";
import {
  fromRoot,
  importedCss,
  manifestOf,
  parseArgs,
  readJson,
  stripCssComments,
  usageError,
} from "./lib.mjs";

const USAGE =
  "node tools/design-system/check-map.mjs <pr95-map.json> <design-system-dir> [--before=<design-system-dir>] [--write-pin]";
const { args, flags } = parseArgs(USAGE, ["before", "write-pin"]);
if (args.length !== 2) {
  usageError(USAGE, "expected <pr95-map.json> <design-system-dir>");
}
const mapPath = fromRoot(args[0]);
const ds = fromRoot(args[1]);
const map = readJson(mapPath);
if (!map.pin?.pr95Package)
  usageError(USAGE, `${mapPath} has no pin.pr95Package`);
const PKG = fromRoot(map.pin.pr95Package);
if (!fs.existsSync(PKG)) usageError(USAGE, `#95 package not found: ${PKG}`);

// Phase 1b components and classes (migration spec §1.3, §3) that a target may
// name before they are built, and Phase 2 reserved names (§3.5). A name that is
// already in the manifest must leave these lists; the run says when one is.
// biome-ignore format: name lists
const CONTRACTED_COMPONENTS = ["Select", "Checkbox", "Radio", "RadioGroup", "Switch", "ChoiceChips", "Breadcrumb", "Dialog", "Toast", "Toaster", "Tooltip", "Icon", "iconNames", "Logo", "EmptyState", "SystemState", "AppBar", "CoverPattern", "LessonRow", "WeekAccordion", "PlatformChip", "SessionJoin"];
// biome-ignore format: name lists
const CONTRACTED_CLASSES = [".mds-badge--brand", ".mds-badge--live", ".mds-nav--light", ".mds-lesson-row__medallion", ".mds-alert--neutral"];
// biome-ignore format: name lists
const RESERVED = ["Combobox", "DateTimeField", "RecurrencePreview", "TimeZoneLabel", "EnrolmentCard", "RecordingCard", "VideoEmbed", "Menu", "ProgressRing"];

const RECIPE =
  "files = tokens/, src/, tools/, docs/ (recursive) + package.json, tsup.config.ts, tsconfig.json, project.json, DESIGN_RULES.md, GUIDE.md, PROMPTS.md, README.md, SYNC.md, minus dist/, node_modules/, MANIFEST.json (the INCLUDE rules of #95's tools/manifest.mjs); paths relative to the package, sorted by code unit; lines `path:sha256hex`; joined with \\n, no trailing newline; sha256; first 12 hex";

const { check, failures } = createChecker();
const notes = [];
const read = (p) => fs.readFileSync(p, "utf8");
const rel = (p) => path.relative(PKG, p).split(path.sep).join("/");
// `all` keeps nested node_modules, as the pin's recipe does.
function walk(dir, acc = [], all = false) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (all || e.name !== "node_modules") walk(p, acc, all);
    } else acc.push(p);
  }
  return acc;
}
const files = (sub, re) => walk(path.join(PKG, sub)).filter((f) => re.test(f));
const missingFrom = (want, have) => [...want].filter((x) => !have.has(x));
const list = (xs) => (xs.length ? sorted(xs).join(", ") : "none");

// ---------------------------------------------------------------- the target side
const manifest = manifestOf(ds);
const tokenNames = new Set(manifest.tokens.map((t) => t.name));
const bundleHead = read(path.join(ds, "_ds_bundle.js")).split("\n")[0];
const header = JSON.parse(
  bundleHead.replace(/^\/\* @ds-bundle: /, "").replace(/ \*\/$/, "")
);
const built = new Set(
  [...header.components, ...header.unexposedExports].map((c) => c.name)
);
const components = new Set([...built, ...CONTRACTED_COMPONENTS]);
const cssFiles = [...importedCss(ds), "tokens/a11y-overrides.css"];
const builtClasses = new Set(
  cssFiles
    .filter((f) => fs.existsSync(path.join(ds, f)))
    .flatMap((f) =>
      [
        ...stripCssComments(read(path.join(ds, f))).matchAll(/\.mds-[\w-]+/g),
      ].map((m) => m[0])
    )
);
const classes = new Set([...builtClasses, ...CONTRACTED_CLASSES]);
const isToken = (s) => typeof s === "string" && /^--[\w-]+$/.test(s);
const isKnownToken = (s) => isToken(s) && tokenNames.has(s);
const isKnownClass = (s) => typeof s === "string" && classes.has(s);

check(
  !CONTRACTED_COMPONENTS.some((c) => built.has(c)) &&
    !CONTRACTED_CLASSES.some((c) => builtClasses.has(c)),
  "contract lists hold only names not yet built",
  `already built, remove from check-map.mjs: ${list([...CONTRACTED_COMPONENTS.filter((c) => built.has(c)), ...CONTRACTED_CLASSES.filter((c) => builtClasses.has(c))])}`
);

// ---------------------------------------------------------------- pin
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
// biome-ignore format: the list of #95's tools/manifest.mjs
const INCLUDE_FILES = ["package.json", "tsup.config.ts", "tsconfig.json", "project.json", "DESIGN_RULES.md", "GUIDE.md", "PROMPTS.md", "README.md", "SYNC.md"];
const pinned = [
  ...["tokens", "src", "tools", "docs"].flatMap((d) =>
    walk(path.join(PKG, d), [], true)
  ),
  ...INCLUDE_FILES.map((f) => path.join(PKG, f)).filter((f) =>
    fs.existsSync(f)
  ),
]
  .map(rel)
  .filter((p) => !/^(dist\/|node_modules\/|MANIFEST\.json$)/.test(p))
  .sort();
const fingerprint = sha(
  pinned
    .map((p) => `${p}:${sha(fs.readFileSync(path.join(PKG, p)))}`)
    .join("\n")
).slice(0, 12);

// ---------------------------------------------------------------- #95 tokens
const tokens95 = new Set();
(function walkJson(n) {
  if (!n || typeof n !== "object") return;
  if (typeof n.$name === "string") tokens95.add(n.$name);
  for (const [k, v] of Object.entries(n)) if (!k.startsWith("$")) walkJson(v);
})(readJson(path.join(PKG, "tokens/tokens.json")));
for (const f of files("src/css", /\.css$/)) {
  for (const m of stripCssComments(read(f)).matchAll(/(--[\w-]+)\s*:/g))
    tokens95.add(m[1]);
}
const sourceFiles = [
  ...files("src", /\.(css|jsx?|tsx?|html)$/),
  ...files("docs", /\.(css|jsx?|tsx?|html)$/),
];
for (const f of sourceFiles) {
  for (const m of read(f).matchAll(/var\(\s*(--[\w-]+)/g)) tokens95.add(m[1]);
}
const mapTokens = new Set(Object.keys(map.tokens));
check(
  sameSet(tokens95, mapTokens),
  `tokens: all ${tokens95.size} #95 tokens mapped, no stale keys`,
  `missing ${list(missingFrom(tokens95, mapTokens))}; not in #95 ${list(missingFrom(mapTokens, tokens95))}`
);

const KINDS = ["exact", "role", "nearest", "dropped"];
const tokenErrors = [];
for (const [name, e] of Object.entries(map.tokens)) {
  if (!KINDS.includes(e.kind)) tokenErrors.push(`${name}: kind "${e.kind}"`);
  if (e.to != null && !isKnownToken(e.to))
    tokenErrors.push(`${name}.to ${e.to}`);
  if (e.kind === "dropped" && e.to != null)
    tokenErrors.push(`${name}: dropped but has a target`);
  for (const [p, t] of Object.entries(e.byProperty ?? {})) {
    if (!isKnownToken(t)) tokenErrors.push(`${name}.byProperty.${p} ${t}`);
  }
  for (const c of e.contexts ?? []) {
    if (!isKnownToken(c.to) && !isKnownClass(c.to))
      tokenErrors.push(`${name} context "${c.when}" → ${c.to}`);
  }
}
check(
  !tokenErrors.length,
  "tokens: every target is a bare token in the manifest or a known .mds-* class",
  tokenErrors.join("; ")
);

// ---------------------------------------------------------------- #95 components
const componentFiles = files("src/components", /\.jsx$/);
const exports95 = new Map();
for (const f of componentFiles) {
  for (const m of read(f).matchAll(
    /^export\s+(?:function|const|let|class)\s+(\w+)/gm
  )) {
    exports95.set(m[1], f);
  }
}
const mapComponents = new Set(Object.keys(map.components));
check(
  sameSet(exports95.keys(), mapComponents),
  `components: all ${exports95.size} #95 exports mapped, no stale keys`,
  `missing ${list(missingFrom(exports95.keys(), mapComponents))}; not in #95 ${list(missingFrom(mapComponents, new Set(exports95.keys())))}`
);

// Members of every `export interface` in the #95 .d.ts files.
const interfaces = new Map();
for (const f of files("src/components", /\.d\.ts$/)) {
  const src = read(f);
  for (const m of src.matchAll(/export interface (\w+)(?:<[^>]*>)?[^{]*\{/g)) {
    let i = m.index + m[0].length;
    let depth = 1;
    while (depth && i < src.length) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") depth--;
      i++;
    }
    const body = src
      .slice(m.index + m[0].length, i - 1)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    const members = [];
    let d = 0;
    let cur = "";
    for (const ch of `${body}\n`) {
      if ("{(<[".includes(ch)) d++;
      if ("})>]".includes(ch)) d--;
      if ((ch === ";" || ch === "\n") && d === 0) {
        const mm = cur.trim().match(/^(\w+)\??\s*:/);
        if (mm) members.push(mm[1]);
        cur = "";
      } else cur += ch;
    }
    interfaces.set(m[1], members);
  }
}
// The names a component destructures from its props (a rest element excluded).
function destructured(src, name) {
  const at = src.search(new RegExp(`export function ${name}\\s*\\(\\s*\\{`));
  if (at < 0) return [];
  let i = src.indexOf("{", at) + 1;
  const start = i;
  let depth = 1;
  while (depth && i < src.length) {
    if ("{([".includes(src[i])) depth++;
    else if ("})]".includes(src[i])) depth--;
    i++;
  }
  const parts = [];
  let d = 0;
  let cur = "";
  for (const ch of src.slice(start, i - 1)) {
    if ("{([".includes(ch)) d++;
    if ("})]".includes(ch)) d--;
    if (ch === "," && d === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts.push(cur);
  return parts
    .map((p) => p.trim())
    .filter((p) => p && !p.startsWith("..."))
    .map((p) => p.match(/^(\w+)/)?.[1])
    .filter(Boolean);
}
const propErrors = [];
const entryErrors = [];
const OPS = ["rename", "restructure", "drop", "reserved"];
for (const [name, file] of exports95) {
  const entry = map.components[name];
  if (!entry) continue;
  const props95 = new Set([
    ...(interfaces.get(`${name}Props`) ?? []),
    ...destructured(read(file), name),
  ]);
  const missing = missingFrom(props95, new Set(Object.keys(entry.props ?? {})));
  if (missing.length) propErrors.push(`${name}: ${missing.join(", ")}`);
}
for (const [name, c] of Object.entries(map.components)) {
  if (!OPS.includes(c.op)) entryErrors.push(`${name}: op "${c.op}"`);
  if (c.to != null && !components.has(c.to))
    entryErrors.push(`${name} → ${c.to}`);
  if (c.reservedName && !RESERVED.includes(c.reservedName))
    entryErrors.push(`${name}: reserved ${c.reservedName}`);
  if (c.container && !isKnownClass(c.container))
    entryErrors.push(`${name}: container ${c.container}`);
  for (const [p, v] of Object.entries(c.props ?? {})) {
    if (!v || typeof v !== "object" || !("to" in v))
      entryErrors.push(`${name}.props.${p} has no "to"`);
  }
}
check(
  !propErrors.length,
  "components: every #95 prop mapped",
  `missing ${propErrors.join("; ")}`
);
check(
  !entryErrors.length,
  "components: every target built, contracted (Phase 1b) or reserved (Phase 2)",
  entryErrors.join("; ")
);

// ---------------------------------------------------------------- sub-types
const subTypes95 = [...interfaces.keys()].filter((n) => !n.endsWith("Props"));
const mapSubTypes = new Set(Object.keys(map.subTypes ?? {}));
const fieldErrors = subTypes95.flatMap((n) => {
  const fields = new Set(Object.keys(map.subTypes?.[n]?.fields ?? {}));
  const missing = missingFrom(interfaces.get(n), fields);
  return missing.length ? [`${n}: ${missing.join(", ")}`] : [];
});
check(
  sameSet(subTypes95, mapSubTypes) && !fieldErrors.length,
  `sub-types: all ${subTypes95.length} mapped with every field`,
  `types missing ${list(missingFrom(subTypes95, mapSubTypes))}; fields missing ${fieldErrors.join("; ") || "none"}`
);

// ---------------------------------------------------------------- literals
// Raw colours in the code a port touches: component and docs sources, and
// base.css outside its custom-property declarations. A literal built from a
// template (`oklch(0.92 0.05 ${hue})`) cannot be a map key and is only listed.
const COLOUR = /#[0-9a-f]{3,8}\b|(?:rgba?|hsla?|oklch|oklab)\([^)]*\)/gi;
const literals95 = new Map();
const parametric = [];
for (const f of [
  ...files("src/components", /\.jsx$/),
  ...files("docs", /\.jsx$/),
  path.join(PKG, "src/css/base.css"),
]) {
  read(f)
    .split("\n")
    .forEach((line, i) => {
      if (/^\s*--[\w-]+\s*:/.test(line)) return;
      for (const m of line.matchAll(COLOUR)) {
        const where = `${rel(f)}:${i + 1}`;
        if (m[0].includes("${")) parametric.push(`${m[0]} (${where})`);
        else if (!literals95.has(m[0])) literals95.set(m[0], where);
      }
    });
}
const mapLiterals = new Set(Object.keys(map.literals ?? {}));
const literalTargets = Object.entries(map.literals ?? {}).filter(
  ([, l]) => l.to != null && !isKnownToken(l.to)
);
check(
  sameSet(literals95.keys(), mapLiterals) && !literalTargets.length,
  `literals: all ${literals95.size} raw colour literals mapped to a known token or null`,
  `missing ${
    missingFrom(literals95.keys(), mapLiterals)
      .map((l) => `${l} (${literals95.get(l)})`)
      .join(", ") || "none"
  }; not found in #95 ${list(missingFrom(mapLiterals, new Set(literals95.keys())))}; unknown targets ${list(literalTargets.map(([k, l]) => `${k} → ${l.to}`))}`
);
if (parametric.length)
  notes.push(
    `parametric colours, covered only through their component's props: ${[...new Set(parametric)].join(", ")}`
  );

// ---------------------------------------------------------------- base.css, globals, JS API
const selectorsOf = (css) =>
  [...stripCssComments(css).matchAll(/([^{}]+)\{[^{}]*\}/g)].map((m) =>
    m[1].replace(/\s+/g, " ").trim()
  );
const dsBase = new Set(
  selectorsOf(read(path.join(ds, "tokens/base.css"))).flatMap((s) =>
    s.split(",").map((x) => x.trim())
  )
);
const baseRules = selectorsOf(read(path.join(PKG, "src/css/base.css")));
const unmappedRules = baseRules.filter(
  (s) =>
    !(s in (map.css ?? {})) && !s.split(",").every((x) => dsBase.has(x.trim()))
);
check(
  !unmappedRules.length,
  `base.css: all ${baseRules.length} #95 rules mapped or restated by the target base.css`,
  `unmapped ${unmappedRules.join(" | ")}`
);

const globals95 = new Set();
for (const f of walk(PKG).filter((x) => /\.(jsx?|tsx?|html|mjs)$/.test(x))) {
  for (const m of read(f).matchAll(/\bwindow\.([A-Z][\w$]*)/g))
    globals95.add(`window.${m[1]}`);
}
const mapGlobals = new Set(Object.keys(map.globals ?? {}));
const namespace = `window.${manifest.namespace}`;
const wrongNs = Object.entries(map.globals ?? {}).filter(
  ([, g]) => g.to !== namespace
);
check(
  sameSet(globals95, mapGlobals) && !wrongNs.length,
  `globals: ${list([...globals95])} → ${namespace}`,
  `missing ${list(missingFrom(globals95, mapGlobals))}; stale ${list(missingFrom(mapGlobals, globals95))}; wrong target ${list(wrongNs.map(([k, g]) => `${k} → ${g.to}`))}`
);

const jsApi95 = new Set(
  [
    ...read(path.join(PKG, "src/index.ts")).matchAll(
      /^export\s+(?:type\s+)?\{([^}]*)\}/gm
    ),
  ].flatMap((m) =>
    m[1]
      .split(",")
      .map((s) =>
        s
          .trim()
          .split(/\s+as\s+/)
          .at(-1)
      )
      .filter(Boolean)
  )
);
const mapJsApi = new Set(Object.keys(map.jsApi ?? {}));
check(
  sameSet(jsApi95, mapJsApi),
  `JS API: ${list([...jsApi95])} mapped`,
  `missing ${list(missingFrom(jsApi95, mapJsApi))}; stale ${list(missingFrom(mapJsApi, jsApi95))}`
);

const badReserved = Object.entries(map.reserved ?? {}).filter(
  ([, r]) => !components.has(r.to) && !RESERVED.includes(r.to)
);
check(
  !badReserved.length,
  "reserved: every likely addition has a known target",
  list(badReserved.map(([k, r]) => `${k} → ${r.to}`))
);

// ---------------------------------------------------------------- silent overlaps and pin
const overlap = [...mapTokens].filter((n) => tokenNames.has(n));
const unflagged = overlap.filter(
  (n) => !["benign", "drift"].includes(map.tokens[n].resolvesSilently)
);
const flaggedElsewhere = [...mapTokens].filter(
  (n) => map.tokens[n].resolvesSilently && !tokenNames.has(n)
);
const by = (kind) =>
  overlap.filter((n) => map.tokens[n].resolvesSilently === kind).length;
check(
  !unflagged.length,
  `silent overlaps: ${overlap.length} map keys are also target tokens (${by("benign")} benign, ${by("drift")} drift), all flagged resolvesSilently`,
  `not flagged ${list(unflagged)}`
);
if (flaggedElsewhere.length) {
  notes.push(
    `flagged resolvesSilently but not a target token (a silent overlap only while the canonical side keeps them): ${list(flaggedElsewhere)}`
  );
}

const pinNow = {
  pr95Fingerprint: fingerprint,
  pr95Files: pinned.length,
  recipe: RECIPE,
  unifiedTokensAfter: tokenNames.size,
  stillCanonicalAfterAliasRetirement: overlap.length,
};
if (typeof flags.before === "string") {
  const before = new Set(
    manifestOf(fromRoot(flags.before)).tokens.map((t) => t.name)
  );
  pinNow.canonicalTokensBefore = before.size;
  pinNow.mapKeysThatAreCanonicalNames = [...mapTokens].filter((n) =>
    before.has(n)
  ).length;
}
if (flags["write-pin"]) {
  const text = read(mapPath);
  if (text !== `${JSON.stringify(map, null, 1)}\n`) {
    usageError(
      USAGE,
      `${mapPath} is not in JSON.stringify(…, null, 1) form; refusing to rewrite it`
    );
  }
  map.pin = { ...map.pin, ...pinNow };
  fs.writeFileSync(mapPath, `${JSON.stringify(map, null, 1)}\n`);
  console.log(`wrote pin to ${mapPath}`);
}
for (const [key, value] of Object.entries(pinNow)) {
  check(
    map.pin[key] === value,
    `pin.${key} = ${key === "recipe" ? "the recipe this script implements" : value}`,
    `the map records ${JSON.stringify(map.pin[key])}`
  );
}

// ---------------------------------------------------------------- summary
const kinds = {};
for (const e of Object.values(map.tokens))
  kinds[e.kind] = (kinds[e.kind] ?? 0) + 1;
const pending = [
  ...new Set(
    Object.values(map.components)
      .map((c) => c.to)
      .filter((t) => t && !built.has(t))
  ),
];
console.log(
  `\ntoken kinds: ${Object.entries(kinds)
    .map(([k, n]) => `${k} ${n}`)
    .join(", ")}`
);
console.log(`targets contracted but not built yet: ${list(pending)}`);
for (const n of notes) console.log(`note: ${n}`);
console.log(
  failures.length
    ? `\n✖ check-map: ${failures.length} failed`
    : "\n✔ check-map: the map covers #95 and every target resolves"
);
process.exit(failures.length ? 1 : 0);
