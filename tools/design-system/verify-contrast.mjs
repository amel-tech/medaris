#!/usr/bin/env node
// Recomputes every colour pair a design system promises, in the day and the
// night theme, from its token files, and checks that <dir>/contrast.md is what
// this run writes. WCAG 2.x relative luminance; a translucent colour is
// composited over its ground; a ratio is truncated to two decimals, never
// rounded up.
//
// Fails when a pair misses its threshold, when a file's two night blocks
// differ, when a primitive is read by nothing or re-pointed by the night theme,
// when a tone lacks one of its four tokens, when the colour vocabulary grows
// past its ceiling, or when contrast.md is stale. --write rewrites contrast.md
// and the generated blocks of the contrast card.
import fs from "node:fs";
import path from "node:path";
import {
  COLOUR_FILES,
  colourThemes,
  DEFAULT_DIR,
  fromRoot,
  parseArgs,
  repoRoot,
  usageError,
} from "./lib.mjs";

const USAGE =
  "node tools/design-system/verify-contrast.mjs [design-system-dir] [--write]";
const { args, flags } = parseArgs(USAGE, ["write"]);
if (args.length > 1) usageError(USAGE, "expected one design-system dir");
const dir = fromRoot(args[0] ?? DEFAULT_DIR);
if (!fs.existsSync(path.join(dir, COLOUR_FILES[0]))) {
  usageError(USAGE, `no ${COLOUR_FILES[0]} in ${dir}`);
}

// background-*, text-*, border-*, ring-focus-color/gap. Raise only by decision.
const COLOUR_ROLE_CEILING = 42;

const { day, night, nightOnly, primitives, problems } = colourThemes(dir);
const themes = { day, night };

// ------------------------------------------------------------ colour maths
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
function parse(s) {
  let m = s.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (m) {
    const n = (i) => Number.parseInt(m[1].slice(i, i + 2), 16);
    return {
      r: n(0),
      g: n(2),
      b: n(4),
      a: m[2] ? Number.parseInt(m[2], 16) / 255 : 1,
    };
  }
  m = s.match(
    /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i
  );
  if (m) {
    return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
  }
  throw new Error(`cannot parse colour ${s}`);
}
const read = new Set();
function resolve(theme, name) {
  const v = themes[theme].get(name);
  if (v === undefined) throw new Error(`${theme}: ${name} is not declared`);
  const m = v.match(/^var\((--[\w-]+)\)$/);
  if (m) {
    read.add(m[1]);
    return resolve(theme, m[1]);
  }
  return v;
}
const T = (t) => (t.startsWith("--") ? t : `--${t}`);
// --gradient-scrim-media is linear-gradient(transparent, <colour> [<stop>%]).
// Text starts TEXT_START down the ramp, which is linear from 0 to the stop and
// holds the colour after it. Composited over a white pixel, the worst an image
// can be.
const TEXT_START = 0.7;
function scrimAtTextStart(theme) {
  const g = resolve(theme, "--gradient-scrim-media").match(
    /^linear-gradient\(\s*transparent\s*,\s*(rgba?\([^)]*\)|#[0-9a-f]+)\s*(?:([\d.]+)%)?\s*\)$/i
  );
  if (!g) {
    throw new Error(
      "--gradient-scrim-media is not linear-gradient(transparent, <colour> [<stop>%])"
    );
  }
  const c = parse(g[1]);
  const stop = g[2] === undefined ? 1 : +g[2] / 100;
  return over({ ...c, a: c.a * Math.min(1, TEXT_START / stop) }, WHITE);
}
const col = (theme, t) =>
  t === "@scrim-at-text-start"
    ? scrimAtTextStart(theme)
    : parse(resolve(theme, T(t)));
const hex = (c) =>
  `#${[c.r, c.g, c.b]
    .map((v) => Math.round(v).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
function ratio(theme, fg, bg, under = "background-neutral-page") {
  const ground = over(col(theme, bg), col(theme, under));
  const [x, y] = [lum(over(col(theme, fg), ground)), lum(ground)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// ------------------------------------------------------------ the pairs
// [fg, bg, under]: fg over bg, and bg over `under` (the page by default).
// "@focus" is the better of the ring's two bands; "@scrim-at-text-start" is
// the media scrim where text may start.
const TONES = ["brand", "success", "warning", "error", "info", "live"];
const GROUNDS = ["page", "surface", "sunken", "field", "hover"];
const TEXT_GROUNDS = GROUNDS.map((g) => `background-neutral-${g}`).concat(
  "background-brand-subtle"
);
const FOCUS_FILLS = [
  "background-neutral-surface",
  "background-neutral-sunken",
  "background-neutral-field",
  "background-neutral-hover",
  "background-action-bold",
  "background-action-bold-hover",
  "background-error-subtle",
  "background-error-bold",
];
const cats = [];
const cat = (name, need, note, pairs) => cats.push({ name, need, note, pairs });

cat(
  "Neutral text on every ground",
  4.5,
  "default, muted and subtle text — and links — on every ground text can sit on: page, surface, sunken, field, hover and the current-row tint",
  [
    "text-neutral-default",
    "text-neutral-muted",
    "text-neutral-subtle",
    "text-brand-default",
  ].flatMap((t) => TEXT_GROUNDS.map((g) => [t, g]))
);
cat(
  "Tone text on every ground",
  4.5,
  "a status word printed without its tint: an error under a field, a success figure in a table",
  TONES.flatMap((t) => TEXT_GROUNDS.map((g) => [`text-${t}-default`, g]))
);
cat(
  "Text on tints",
  4.5,
  "a badge or an alert: its tone text, and the neutral body text an alert carries",
  TONES.flatMap((t) => [
    [`text-${t}-default`, `background-${t}-subtle`],
    ["text-neutral-default", `background-${t}-subtle`],
    ["text-neutral-muted", `background-${t}-subtle`],
  ])
);
cat(
  "Text on bold fills",
  4.5,
  "--text-neutral-on-bold on the action fill, its hover and every *-bold fill: the primary button, the count, the current medallion, the destructive hover",
  [
    ["text-neutral-on-bold", "background-action-bold"],
    ["text-neutral-on-bold", "background-action-bold-hover"],
    ...TONES.map((t) => ["text-neutral-on-bold", `background-${t}-bold`]),
  ]
);
cat(
  "Control boundaries",
  3,
  "the edge that identifies a field, select, checkbox, radio or switch on every ground it can sit on; its hover edge; the invalid edge",
  GROUNDS.flatMap((g) => [
    ["border-neutral-control", `background-neutral-${g}`],
    ["border-neutral-strong", `background-neutral-${g}`],
    ["border-error-default", `background-neutral-${g}`],
  ])
);
cat(
  "Checked and on states",
  3,
  "a checked box, a selected radio and an on switch are the action fill against their ground; the check glyph against the fill; the off switch's knob (border-neutral-control) on its track",
  [
    ...["page", "surface", "field", "hover"].map((g) => [
      "background-action-bold",
      `background-neutral-${g}`,
    ]),
    ["text-neutral-on-bold", "background-action-bold"],
    [
      "border-neutral-control",
      "background-neutral-field",
      "background-neutral-surface",
    ],
  ]
);
cat(
  "Focus indicator — ring against the ground",
  3,
  "the outer 2px band in --ring-focus-color against every ground it can be drawn on, and against its own gap. The page under a modal's scrim is not a ground: no ring is drawn outside a modal layer (a focused dialog body draws its ring inside itself), and check.mjs fails a ring that escapes its modal",
  [
    ...TEXT_GROUNDS.map((g) => ["ring-focus-color", g]),
    ["ring-focus-color", "ring-focus-gap"],
  ]
);
cat(
  "Focus indicator — against the component",
  3,
  "the inner band (--ring-focus-gap) or, where the gap matches the component, the ring itself, against every fill a focusable control can have. The better of the two is shown; the other is in brackets",
  FOCUS_FILLS.map((f) => ["@focus", f])
);
cat(
  "Status marks",
  3,
  "3:1 marks: an alert or selected-choice edge, the live dot, the progress fill (on the sunken track), a bold fill as a shape",
  TONES.flatMap((t) =>
    ["page", "surface", "sunken"].flatMap((g) => [
      [`border-${t}-default`, `background-neutral-${g}`],
      [`background-${t}-bold`, `background-neutral-${g}`],
    ])
  )
);
cat(
  "Covers",
  4.5,
  "the label printed on each bookcloth (theme-independent)",
  ["laciverd", "bordo", "zumrut", "murekkep"].map((t) => [
    "text-on-cover",
    `cover-${t}`,
  ])
);
cat(
  "Text over media",
  4.5,
  "--text-on-cover on --gradient-scrim-media where text may start (70% down the ramp), over a pure white poster pixel, the worst an image can be (theme-independent)",
  [["text-on-cover", "@scrim-at-text-start"]]
);
cat(
  "Disabled text (policy)",
  3,
  "--text-neutral-disabled on every ground a disabled control or its label can sit on. WCAG 1.4.3 exempts disabled text; the system holds it to 3:1 anyway, and a disabled control drops its tone instead of fading",
  GROUNDS.map((g) => ["text-neutral-disabled", `background-neutral-${g}`])
);
// Shown so nobody mistakes them for a gap; no threshold.
const INFO = [
  ["border-neutral-subtle", "background-neutral-page"],
  ["border-neutral-subtle", "background-neutral-surface"],
  ["background-brand-subtle", "background-neutral-surface"],
  ["icon-platform-zoom", "background-neutral-surface"],
  ["icon-platform-google-meet", "background-neutral-surface"],
  ["icon-platform-jitsi", "background-neutral-surface"],
  ["icon-platform-unknown", "background-neutral-surface"],
  ["icon-rating", "background-neutral-surface"],
  ["stamp-on-cover", "cover-laciverd"],
  ["icon-logo-arch", "icon-logo-ground"],
  ["icon-logo-ground", "background-neutral-page"],
];

// ------------------------------------------------------------ run
const f2 = (x) => (Math.floor(x * 100) / 100).toFixed(2);
const summary = [];
let md = "";
for (const c of cats) {
  const rows = [];
  const min = {
    day: Number.POSITIVE_INFINITY,
    night: Number.POSITIVE_INFINITY,
  };
  for (const [fg, bg, under = "background-neutral-page"] of c.pairs) {
    const cell = {};
    const shown = (th) =>
      fg === "@focus"
        ? `${hex(col(th, "ring-focus-gap"))}·${hex(col(th, "ring-focus-color"))} / ${hex(over(col(th, bg), col(th, under)))}`
        : `${hex(col(th, fg))} / ${hex(over(col(th, bg), col(th, under)))}`;
    const hx = {};
    for (const th of ["day", "night"]) {
      let r;
      try {
        if (fg === "@focus") {
          const g = ratio(th, "ring-focus-gap", bg, under);
          const k = ratio(th, "ring-focus-color", bg, under);
          r = Math.max(g, k);
          cell[th] =
            `${g >= k ? "gap" : "ring"} ${f2(r)} (${f2(Math.min(g, k))})`;
        } else {
          r = ratio(th, fg, bg, under);
          cell[th] = f2(r);
        }
        hx[th] = shown(th);
      } catch (e) {
        problems.push(`${e.message} (${c.name})`);
        cell[th] = "✗";
        hx[th] = "?";
        continue;
      }
      min[th] = Math.min(min[th], r);
      if (r < c.need) {
        problems.push(
          `${th}: ${fg} on ${bg} = ${f2(r)} < ${c.need} (${c.name})`
        );
        cell[th] += " ✗";
      }
    }
    const label =
      fg === "@focus" ? "`ring-focus-gap` / `ring-focus-color`" : `\`${fg}\``;
    rows.push(
      `| ${label} on \`${bg}\` | ${hx.day} | ${cell.day} | ${hx.night} | ${cell.night} |`
    );
  }
  summary.push({ name: c.name, need: c.need, n: c.pairs.length, min });
  md += `## ${c.name} (≥ ${c.need}:1)\n\n${c.note}.\n\n| pair | day fg / bg | day | night fg / bg | night |\n| -- | -- | --: | -- | --: |\n${rows.join("\n")}\n\n**Minimum:** day ${f2(min.day)}:1 · night ${f2(min.night)}:1\n\n`;
}
md += `## Not required — decorative or exempt\n\nShown so nobody mistakes them for a gap. A hairline never identifies a control on its own. The current-row tint is never the only signal (the "Sıradaki" marker and the medallion are). Platform dots and the rating star repeat printed words. The cover stamp is ornament. The logo is exempt: its arch sits on its own ground by day and by night, and the ground is the mark's edge.\n\n| pair | day | night |\n| -- | --: | --: |\n`;
for (const [fg, bg] of INFO) {
  try {
    md += `| \`${fg}\` on \`${bg}\` | ${f2(ratio("day", fg, bg))} | ${f2(ratio("night", fg, bg))} |\n`;
  } catch (e) {
    problems.push(`${e.message} (not required)`);
  }
}

// ------------------------------------------------------------ vocabulary
const roles = [...day.keys()].filter(
  (n) =>
    /^--(background|text|border)-(neutral|action|brand|success|warning|error|info|live)-/.test(
      n
    ) || /^--ring-focus-(color|gap)$/.test(n)
);
if (roles.length > COLOUR_ROLE_CEILING) {
  problems.push(
    `${roles.length} colour roles, ceiling ${COLOUR_ROLE_CEILING}: the vocabulary grows only by decision`
  );
}
for (const t of TONES) {
  for (const v of [
    `background-${t}-subtle`,
    `background-${t}-bold`,
    `text-${t}-default`,
    `border-${t}-default`,
  ]) {
    if (!day.has(`--${v}`)) problems.push(`tone ${t} lacks --${v}`);
  }
}
for (const n of day.keys()) {
  try {
    resolve("day", n);
    resolve("night", n);
  } catch {
    // A composite value (a shadow, a gradient) is not a colour.
  }
}
const unread = [...primitives].filter((p) => !read.has(p));
if (unread.length) {
  problems.push(`primitives read by nothing: ${unread.join(", ")}`);
}
for (const n of nightOnly.keys()) {
  if (primitives.has(n)) {
    problems.push(`the night theme re-points a primitive: ${n}`);
  }
}

// ------------------------------------------------------------ contrast.md
const total = summary.reduce((a, s) => a + s.n * 2, 0);
const found = problems.length;
const head = `# Contrast

Generated from \`tokens/*.css\` by \`tools/design-system/verify-contrast.mjs --write\` in the Medaris repository; do not edit it by hand. WCAG 2.x relative luminance; ratios are truncated to two decimals, never rounded up. A translucent colour is composited over its ground. "Day" is the default \`:root\`; "night" is \`[data-theme="dark"]\`, which is identical to the \`prefers-color-scheme: dark\` block.

## Summary

| category | threshold | pairs × themes | min day | min night |
| -- | --: | --: | --: | --: |
${summary.map((s) => `| ${s.name} | ${s.need}:1 | ${s.n} × 2 | ${f2(s.min.day)} | ${f2(s.min.night)} |`).join("\n")}

${found ? `**${found} problems** — see ✗ below.` : `**Every required pair passes in both themes** (${total} checks). ${roles.length} colour roles (ceiling ${COLOUR_ROLE_CEILING}); ${primitives.size} primitives, every one read; no primitive is re-pointed by the night theme; every tone has its four tokens.`}

`;
const mdPath = path.join(dir, "contrast.md");
if (flags.write) {
  fs.writeFileSync(mdPath, head + md);
  console.log(`wrote ${path.relative(repoRoot, mdPath)}`);
} else if (!fs.existsSync(mdPath)) {
  problems.push("contrast.md does not exist: run with --write");
} else if (fs.readFileSync(mdPath, "utf8") !== head + md) {
  problems.push("contrast.md is stale: run with --write");
}

// ------------------------------------------------------------ the cards
// The contrast card shows the summary above in Turkish. Its two blocks between
// <!-- verify-contrast: … --> and <!-- /verify-contrast --> are written here, and
// checked like contrast.md. Every other ratio a card prints as "N,NN:1" must be
// a ratio contrast.md lists, so a token change cannot leave a card behind.
const TR = {
  "Neutral text on every ground": "Nötr metin, her zeminde",
  "Tone text on every ground": "Ton metni, her zeminde",
  "Text on tints": "Tonlu zeminde metin",
  "Text on bold fills": "Dolgu üstünde metin",
  "Control boundaries": "Denetim kenarları",
  "Checked and on states": "İşaretli ve açık durumlar",
  "Focus indicator — ring against the ground": "Odak halkası, zemine karşı",
  "Focus indicator — against the component": "Odak halkası, bileşene karşı",
  "Status marks": "Durum işaretleri",
  Covers: "Kapak etiketleri",
  "Text over media": "Görsel üstünde metin",
  "Disabled text (policy)": "Devre dışı metin (politika)",
};
const tr = (x) => String(x).replace(".", ",");
const check =
  '<svg class="mds-icon mds-icon--sm" aria-hidden="true"><use href="../assets/icons.svg#check"/></svg>';
const blocks = {
  stats: [
    `<div class="mds-card mds-stat mds-stat--success"><span class="mds-caption">Denetim, iki temada</span><span class="mds-stat__value">${total}</span><span class="mds-stat__cue">${check}${found ? "Sorun var" : "Hepsi geçiyor"}</span></div>`,
    `<div class="mds-card mds-stat"><span class="mds-caption">Renk rolü</span><span class="mds-stat__value">${roles.length}</span><span class="mds-caption">Tavan ${COLOUR_ROLE_CEILING}: yalnızca kararla büyür</span></div>`,
    `<div class="mds-card mds-stat"><span class="mds-caption">İlkel adım</span><span class="mds-stat__value">${primitives.size}</span><span class="mds-caption">Her biri bir rol tarafından okunur</span></div>`,
  ],
  summary: summary.map(
    (x) =>
      `<tr><th scope="row">${TR[x.name] ?? x.name}</th><td class="is-end">${tr(x.need)}:1</td><td class="is-end">${x.n} × 2</td><td class="is-end">${tr(f2(x.min.day))}:1</td><td class="is-end">${tr(f2(x.min.night))}:1</td><td><span class="f-pass">${check}Geçti</span></td></tr>`
  ),
};
const auditPath = path.join(dir, "foundations", "contrast-audit.card.html");
if (fs.existsSync(auditPath)) {
  const before = fs.readFileSync(auditPath, "utf8");
  let after = before;
  for (const [k, lines] of Object.entries(blocks)) {
    const re = new RegExp(
      `(<!-- verify-contrast: ${k} -->\n)[\\s\\S]*?(<!-- /verify-contrast -->)`
    );
    if (!re.test(after)) {
      problems.push(
        `foundations/contrast-audit.card.html has no "verify-contrast: ${k}" block`
      );
      continue;
    }
    after = after.replace(
      re,
      (_, open, close) => `${open}${lines.join("\n")}\n${close}`
    );
  }
  if (after !== before) {
    if (flags.write) {
      fs.writeFileSync(auditPath, after);
      console.log(`wrote ${path.relative(repoRoot, auditPath)}`);
    } else {
      problems.push(
        "foundations/contrast-audit.card.html is stale: run with --write"
      );
    }
  }
}
const listed = new Set(md.match(/\b\d+\.\d\d\b/g));
for (const sub of ["foundations", "components", "patterns", "templates"]) {
  const d = path.join(dir, sub);
  if (!fs.existsSync(d)) continue;
  for (const f of fs.readdirSync(d).filter((n) => n.endsWith(".card.html"))) {
    const text = fs.readFileSync(path.join(d, f), "utf8");
    for (const m of text.matchAll(/(\d+)[,.](\d\d):1/g)) {
      if (!listed.has(`${m[1]}.${m[2]}`)) {
        problems.push(
          `${sub}/${f} prints ${m[0]}, a ratio contrast.md does not list`
        );
      }
    }
  }
}

for (const s of summary) {
  console.log(
    `${s.name.padEnd(46)} ≥${s.need}  day ${f2(s.min.day)}  night ${f2(s.min.night)}`
  );
}
if (problems.length) {
  console.error(
    `\n✖ verify-contrast: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n  ${problems.join("\n  ")}`
  );
  process.exit(1);
}
console.log(
  `\n✔ verify-contrast: ${total} checks pass · ${roles.length} colour roles · ${primitives.size} primitives, all read`
);
