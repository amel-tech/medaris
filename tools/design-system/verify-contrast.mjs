#!/usr/bin/env node
// Recomputes, from a design system's token files, every contrast ratio the
// unified system states: the pairs below (migration spec §2.5, MDRS-131) and
// every row of foundations/contrast-audit.card.html. WCAG 2.x relative
// luminance; a translucent colour is composited over its ground, and the
// ground over white. Exits 1 when a ratio, a swatch or the card's subtitle
// count disagrees with the tokens.
//
// Values are each token's `:root` default in the files styles.css imports;
// "+ovr" applies tokens/a11y-overrides.css on top.
import fs from "node:fs";
import path from "node:path";
import { createChecker } from "../ci/lib/checks.mjs";
import {
  designTokens,
  fromRoot,
  parseArgs,
  resolver,
  usageError,
} from "./lib.mjs";

const USAGE =
  "node tools/design-system/verify-contrast.mjs <design-system-dir>";
const { args } = parseArgs(USAGE, []);
if (args.length !== 1) usageError(USAGE, "expected <design-system-dir>");
const dir = fromRoot(args[0]);

// ---------------------------------------------------------------- colour
const lin = (u) => {
  const c = u / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
const over = (fg, bg) => ({
  r: fg.r * fg.a + bg.r * (1 - fg.a),
  g: fg.g * fg.a + bg.g * (1 - fg.a),
  b: fg.b * fg.a + bg.b * (1 - fg.a),
  a: 1,
});
const WHITE = { r: 255, g: 255, b: 255, a: 1 };
function contrast(fg, bg) {
  const ground = over(bg, WHITE);
  const [x, y] = [lum(over(fg, ground)), lum(ground)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
const hex = (c) =>
  `#${[c.r, c.g, c.b]
    .map((v) => Math.round(v).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;

const COLOUR = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi;
function parseColor(s) {
  let m = s.match(/^#([0-9a-f]{3,8})$/i);
  if (m) {
    let h = m[1];
    if (h.length <= 4) h = [...h].map((c) => c + c).join("");
    const n = (i) => Number.parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
  }
  m = s.match(
    /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/i
  );
  if (m)
    return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
  m = s.match(/^color-mix\(in srgb,\s*(.+?)\s+([\d.]+)%,\s*transparent\)$/i);
  if (m) {
    const c = parseColor(m[1]);
    return c && { ...c, a: (c.a * +m[2]) / 100 };
  }
  // A shadow or ring: its colour is the last colour in the value.
  const all = s.match(COLOUR);
  return all ? parseColor(all.at(-1)) : null;
}

const sets = {
  base: designTokens(dir),
  ovr: designTokens(dir, { overrides: true }),
};
const resolvers = { base: resolver(sets.base), ovr: resolver(sets.ovr) };

// A ref is a token, `--a|--b` (the first one declared), a literal colour, or
// { mix, alpha, on }: `mix` at `alpha` composited over `on`.
function colour(ref, mode) {
  if (typeof ref === "object") {
    const top = colour(ref.mix, mode);
    return over({ ...top, a: ref.alpha }, colour(ref.on, mode));
  }
  const name = ref.split("|").find((n) => sets[mode].has(n)) ?? ref;
  const value = name.startsWith("--") ? resolvers[mode](`var(${name})`) : name;
  const c = parseColor(value);
  if (!c) throw new Error(`${ref}: no colour in "${value}"`);
  return c;
}
const ratio = (fg, bg, mode) => contrast(colour(fg, mode), colour(bg, mode));

// ---------------------------------------------------------------- §2.5
// [label, fg, bg, need, expected, status]. `expected` is the base ratio, or
// [base, +ovr] when the overrides change it. With no status a pair must meet
// `need` in the base system (MDS-COL-08); "decorative" and the v1 rows (a
// record of what the v1 label measured) have no threshold; any other status
// names the open decision or gap the pair is known to fail on.
const W = "--background-white";
const PAGE = "--background-neutral-primary";
const NAV_LIGHT = "fails: why ported screens take .mds-nav--light";
const V1 = "v1 defect: the label now inherits the cover ink";
const UNASSESSED = new Set(["decorative", V1]);
// biome-ignore format: one row per line keeps the table reviewable
const PAIRS = [
  ["Badge brand", "--text-brand-primary", "--background-brand-tertiary", 4.5, 8.24],
  ["Badge live (the state)", "--text-live-primary", "--background-live-subtle", 4.5, 5.3],
  ["Lesson medallion glyph", "--icon-neutral-tertiary", "--background-neutral-secondary", 3, 6.9],
  ["Lesson type label on white", "--text-neutral-tertiary", W, 4.5, 7.56],
  ["Lesson type label on the current row", "--text-neutral-tertiary", "--background-brand-subtle", 4.5, 7.09],
  ["Current row title", "--text-neutral-primary", "--background-brand-subtle", 4.5, 16.64],
  ["Sıradaki marker and source", "--text-brand-primary", "--background-brand-subtle", 4.5, 8.87],
  ["Current-row tint against white", "--background-brand-subtle", W, 0, 1.07, "decorative"],
  ["Current medallion glyph", "--text-white", "--background-brand-primary", 3, 9.46],
  ["Done medallion", "--icon-success-primary", "--background-success-subtle", 3, 4.57],
  ["Locked lesson title", "--text-neutral-primary", W, 4.5, 17.74],
  ["Lock glyph", "--icon-neutral-tertiary", W, 3, 7.56],
  ["Locked medallion dashed ring", "--border-neutral-tertiary", W, 0, 2.54, "decorative"],
  ["ChoiceChip selected", "--text-white", "--background-brand-primary", 4.5, 9.46],
  ["ChoiceChip idle", "--text-neutral-primary", "--background-neutral-secondary", 4.5, 16.19],
  ["Light nav idle", "--text-neutral-tertiary", W, 4.5, 7.56],
  ["Light nav hover", "--text-neutral-primary", "--background-neutral-secondary", 4.5, 16.19],
  ["Light nav active", "--text-brand-primary", "--background-brand-tertiary", 4.5, 8.24],
  ["Light nav section", "--text-neutral-tertiary", W, 4.5, 7.56],
  ["Inverse nav text on white", "--text-neutral-inverse-secondary", W, 4.5, 1.24, NAV_LIGHT],
  ["Inverse nav text on the page", "--text-neutral-inverse-secondary", PAGE, 4.5, 1.18, NAV_LIGHT],
  ["Inverse nav section on white", "--text-neutral-inverse-tertiary", W, 4.5, 1.47, NAV_LIGHT],
  ["Nav count, inverse idle", "--text-white", "--background-neutral-inverse-tertiary", 4.5, 10.35],
  ["Nav count, inverse active", "--text-brand-primary", W, 4.5, 9.46],
  ["Nav count, light idle", "--text-brand-primary", "--background-brand-tertiary", 4.5, 8.24],
  ["Nav count, light active", "--text-white", "--background-brand-primary", 4.5, 9.46],
  ["Tab count selected", "--text-brand-primary", "--background-brand-tertiary", 4.5, 8.24],
  ["Tab count idle", "--text-neutral-tertiary", "--background-neutral-secondary", 4.5, 6.9],
  ["Select chevron", "--icon-neutral-tertiary", W, 3, 7.56],
  ["Breadcrumb link on the page", "--text-neutral-tertiary", PAGE, 4.5, 7.22],
  ["Eyebrow, dialog body, toast description", "--text-neutral-tertiary", W, 4.5, 7.56],
  ["Alert neutral text", "--text-neutral-primary", "--background-neutral-secondary", 4.5, 16.19],
  ["Alert neutral icon", "--icon-neutral-tertiary", "--background-neutral-secondary", 3, 6.9],
  ...[
    ["sky", 6.12, 5.38],
    ["blue", 6.27, 5.47],
    ["green", 6.18, 5.66],
    ["slate", 11.18, 10.0],
  ].flatMap(([tone, from, to]) =>
    [
      ["from", from],
      ["to", to],
    ].map(([stop, expected]) => [
      `Cover label ${tone}, ${stop} stop + 18% pattern`,
      `--cover-${tone}-fg`,
      { mix: `--cover-${tone}-fg`, alpha: 0.18, on: `--cover-${tone}-${stop}` },
      4.5,
      expected,
    ])
  ),
  ...[
    ["sky", 4.3],
    ["blue", 3.99],
    ["green", 4.7],
    ["yellow", 4.9],
    ["red", 3.89],
    ["slate", 4.23],
  ].map(([tone, expected]) => [
    `Cover label as v1 rendered it, ${tone}`,
    "--text-neutral-tertiary",
    { mix: `--${tone}-900`, alpha: 0.18, on: `--${tone}-200` },
    4.5,
    expected,
    V1,
  ]),
  ["Status default secondary", "--text-neutral-primary", "--background-neutral-secondary", 4.5, 16.19],
  ["Status default outline (Yasaklı)", "--text-neutral-primary", W, 4.5, 17.74],
  ["Status target warning", "--text-warning-primary", "--background-warning-subtle", 4.5, [1.79, 4.58], "inherits OPEN-2"],
  ["Status target destructive", "--text-white", "--background-error-base", 4.5, [3.76, 4.83], "inherits OPEN-2"],
  ["Toast icon success", "--icon-success-primary", W, 3, 5.02],
  ["Toast icon info", "--icon-info-primary", W, 3, 5.17],
  ["Toast icon error", "--icon-error-primary", W, 3, [4.83, 6.47]],
  ["Toast icon warning", "--icon-warning-primary", W, 3, [1.92, 4.92], "inherits OPEN-2"],
  ["Switch off track against white", "--background-neutral-tertiary", W, 3, 1.23, "SPEC-D3-21"],
  ["Switch off track against the page", "--background-neutral-tertiary", PAGE, 3, 1.18, "SPEC-D3-21"],
  ["Switch white knob on the off track", W, "--background-neutral-tertiary", 3, 1.23, "SPEC-D3-21"],
  ["Switch white knob on brand (on)", W, "--background-brand-primary", 3, 9.46],
  ["Invalid-field focus ring", "--ring-focus-error", W, 3, 1.45, "inherits OPEN-1"],
  ["Checkbox, radio, select boundary", "--border-neutral-secondary", W, 3, 1.47, "inherits OPEN-3"],
  ["Inner divider", "--border-neutral-subtle", W, 0, 1.1, "decorative"],
  ["Rating star", "--icon-rating", W, 0, 1.92, "decorative"],
  ["Platform dot google-meet on the chip", "--icon-platform-google-meet", "--background-neutral-secondary", 0, 4.58, "decorative"],
  ["Platform dot zoom on the chip", "--icon-platform-zoom", "--background-neutral-secondary", 0, 3.36, "decorative"],
  ["Platform dot jitsi on the chip", "--icon-platform-jitsi", "--background-neutral-secondary", 0, 5.42, "decorative"],
  // --gradient-scrim-media runs from transparent to 75% black; text starts in its last 28%
  ["Media scrim, white text 72% down, on white", "--text-white", { mix: "--black", alpha: 0.75 * 0.72, on: W }, 4.5, 4.59],
  ["Media scrim end, white text on white", "--text-white", { mix: "--black", alpha: 0.75, on: W }, 4.5, 10.41],
];

const { check, failures } = createChecker();
const f2 = (n) => n.toFixed(2);

console.log("§2.5 pairs (base → +ovr)");
for (const [label, fg, bg, need, expected, status] of PAIRS) {
  let got;
  try {
    got = [ratio(fg, bg, "base"), ratio(fg, bg, "ovr")];
  } catch (e) {
    check(false, label, e.message);
    continue;
  }
  const want = Array.isArray(expected) ? expected : [expected, expected];
  const shown = `${f2(got[0])} → ${f2(got[1])}`;
  const tag = status ? ` [${status}]` : "";
  if (f2(got[0]) !== f2(want[0]) || f2(got[1]) !== f2(want[1])) {
    check(
      false,
      `${label}${tag}`,
      `measured ${shown}, stated ${f2(want[0])} → ${f2(want[1])}`
    );
  } else if (!status && got[0] < need) {
    check(
      false,
      `${label}`,
      `${shown} is below ${need}:1 with no open decision named`
    );
  } else if (status && !UNASSESSED.has(status) && got[0] >= need) {
    check(
      false,
      `${label}${tag}`,
      `${shown} now meets ${need}:1; the status is stale`
    );
  } else {
    check(true, `${label.padEnd(44)} ${shown}${tag}`, "");
  }
}

// ---------------------------------------------------------------- the card
// Which token pair each audit row shows, matched on the row's label. A new row
// needs a line here; an unmatched row fails rather than go unchecked.
// biome-ignore format: one row per line keeps the table reviewable
const CARD_ROWS = [
  [/^body text on page/i, "--text-neutral-primary", PAGE],
  [/^tertiary text/i, "--text-neutral-tertiary", W],
  [/^placeholder/i, "--text-neutral-disabled", W],
  [/^primary button/i, "--text-white", "--background-brand-primary"],
  [/^primary badge/i, "--text-brand-inverse", "--background-brand-primary"],
  [/^secondary button/i, "--text-neutral-primary", "--background-neutral-secondary"],
  [/^sidebar item on inverse/i, "--text-neutral-inverse-secondary", "--background-neutral-inverse-primary"],
  [/^info text/i, "--text-info-primary", "--background-info-subtle"],
  [/^success text/i, "--text-success-primary", "--background-success-subtle"],
  [/^error text/i, "--text-error-primary", "--background-error-subtle"],
  [/^warning text/i, "--text-warning-primary", "--background-warning-subtle"],
  [/^destructive button/i, "--text-white", "--background-error-base"],
  [/success-bold/i, "--text-white", "--background-success-bold"],
  [/warning-bold/i, "--text-on-warning-bold|--text-white", "--background-warning-bold"],
  [/(invalid|error).*ring/i, "--ring-focus-error", W],
  [/focus ring/i, "--ring-focus", W],
  [/^switch off/i, "--background-neutral-tertiary", W],
  [/boundary|border against/i, "--border-neutral-secondary", W],
];
// biome-ignore format: a word list
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
const count = (w) => (/^\d+$/.test(w) ? +w : WORDS.indexOf(w.toLowerCase()));
const same = (a, b) => hex(a) === hex(b);

const cardPath = path.join(dir, "foundations/contrast-audit.card.html");
if (!fs.existsSync(cardPath)) {
  check(false, "contrast-audit card", `not found: ${cardPath}`);
} else {
  console.log("\ncontrast-audit card");
  const card = fs.readFileSync(cardPath, "utf8");
  let bad = 0;
  let fixedByOverrides = 0;
  for (const [, row] of card.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const label = row.match(/<td>([^<]*)<\/td>/)?.[1].trim();
    if (!label) continue;
    const swatches = [
      ...row.matchAll(/style="background:(#[0-9a-f]+);color:(#[0-9a-f]+)"/gi),
    ].map((m) => ({ bg: parseColor(m[1]), fg: parseColor(m[2]) }));
    const stated = row.match(/<td class="(ok|bad)">([\d.]+):1<\/td>/);
    const need = +(row.match(/needs ([\d.]+):1/)?.[1] ?? Number.NaN);
    const fixRatio = row.match(/→ ([\d.]+):1/)?.[1];
    const pair = CARD_ROWS.find(([re]) => re.test(label));
    if (!pair || !swatches.length || !stated || Number.isNaN(need)) {
      check(
        false,
        label,
        pair
          ? "row not parsed"
          : "no token pair known for this label: add it to CARD_ROWS"
      );
      continue;
    }
    const [, fg, bg] = pair;
    const problems = [];
    const [sw, fix] = swatches;
    const base = { fg: colour(fg, "base"), bg: colour(bg, "base") };
    const ovr = { fg: colour(fg, "ovr"), bg: colour(bg, "ovr") };
    if (!same(sw.fg, base.fg) || !same(sw.bg, base.bg)) {
      problems.push(
        `swatch ${hex(sw.fg)} on ${hex(sw.bg)}, tokens ${fg} ${hex(base.fg)} on ${bg} ${hex(base.bg)}`
      );
    }
    const measured = f2(contrast(sw.fg, sw.bg));
    if (measured !== f2(+stated[2]))
      problems.push(`states ${stated[2]}:1, swatch measures ${measured}:1`);
    const fails = contrast(base.fg, base.bg) < need;
    if ((stated[1] === "bad") !== fails)
      problems.push(
        `class "${stated[1]}" but the pair ${fails ? "fails" : "passes"} ${need}:1`
      );
    const overridden = !same(base.fg, ovr.fg) || !same(base.bg, ovr.bg);
    if (overridden) {
      if (!fix || !same(fix.fg, ovr.fg) || !same(fix.bg, ovr.bg)) {
        problems.push(
          `a11y-overrides.css makes it ${hex(ovr.fg)} on ${hex(ovr.bg)}; the fix swatch does not show that`
        );
      } else if (fails) fixedByOverrides++;
    }
    if (
      fix &&
      fixRatio !== undefined &&
      f2(contrast(fix.fg, fix.bg)) !== f2(+fixRatio)
    ) {
      problems.push(
        `fix states ${fixRatio}:1, its swatch measures ${f2(contrast(fix.fg, fix.bg))}:1`
      );
    }
    if (stated[1] === "bad") bad++;
    check(
      !problems.length,
      `${label.padEnd(44)} ${measured}:1 ${stated[1]}${overridden ? `, +ovr ${f2(contrast(ovr.fg, ovr.bg))}:1` : ""}`,
      problems.join("; ")
    );
  }
  const subtitle = card.split("\n")[0].match(/subtitle="([^"]*)"/)?.[1] ?? "";
  const words = subtitle.match(
    /(\w+) fail AA as extracted\W+(\w+) ha(?:ve|s) a one-token fix/i
  );
  check(
    Boolean(words) &&
      count(words[1]) === bad &&
      count(words[2]) === fixedByOverrides,
    `subtitle: ${bad} fail as extracted, ${fixedByOverrides} fixed by a11y-overrides.css`,
    words
      ? `the subtitle says "${words[1]}" and "${words[2]}"`
      : `no "<n> fail AA as extracted … <n> have a one-token fix" in: ${subtitle}`
  );
}

console.log(
  failures.length
    ? `\n✖ verify-contrast: ${failures.length} disagreement${failures.length === 1 ? "" : "s"}`
    : "\n✔ verify-contrast: every ratio reproduces"
);
process.exit(failures.length ? 1 : 0);
