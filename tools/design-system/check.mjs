#!/usr/bin/env node
// The browser gate of a design system. Exits 1 on any finding.
//   static   every var() names a declared token; the class layers declare no
//            custom property, name no primitive, use logical properties only
//            and list no elevation before the ring; every icon is in the
//            sprite; a specimen carries only data variables inline and sets
//            lang, dir and data-app on <html>; a card starts with its @dsCard
//            line and <html lang>; the Latin-island block equals the :root
//            defaults.
//   browser  every specimen, every card and fixtures/check-fixtures.html, in
//            four theme paths: light, dark by system preference, dark by
//            data-theme on <html>, and a night island (the whole body inside a
//            <div data-theme="dark"> on a light root). Each colour token
//            resolves to what verify-contrast.mjs reads from tokens/, and the
//            two dark paths agree. Every painted text node meets its threshold
//            against its painted background (disabled text 3:1, by policy).
//            Targets are at least 24px; nothing scrolls sideways; Arabic sits
//            only inside lang="ar" or an author string's dir="auto"; DİA
//            transliteration (ḥ ṣ ṭ ẓ ʿ ʾ …) only in Literata; every local file
//            a page asks for exists.
//            Focus: Tab through every focusable, and through every <dialog>
//            opened modally, in three paths. The focused element, or an
//            ancestor within three levels, paints --ring-focus-color (a
//            box-shadow, or an outline of 2px or more); inside a modal the ring
//            stays within the modal's box.
//            Hover: every hoverable element that is not disabled is forced
//            into :hover at once, in the light and the data-theme paths, and
//            its text is measured again. A form control never fades: one under
//            an opacity below 1 fails, and a select's shown value is measured
//            like text.
//            Arabic: every Arabic-script glyph paints in a web font (a
//            .mds-quran in Scheherazade New, waqf signs included); a Latin island in an Arabic region keeps each class's
//            Latin face and size; Naskh titles and body text are set at 1.7
//            leading or more; no .mds-arabic sits in a block that clips
//            vertically.
//   turkish  i ı İ I â î û in every Latin face × size × weight the class layer
//            uses, drawn under lang="tr" and lang="en". A dot or circumflex
//            that fuses with its stem, or a Turkish form that differs from the
//            default, fails. It also reports the faces where I and l look alike.
// The directory is served over a local http server (the icon sprite loads only
// over http) and Chromium is driven through the DevTools protocol with Node's
// own WebSocket. The faces come from Google Fonts, so the run needs the network.
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  colourThemes,
  cssBlocks,
  DEFAULT_DIR,
  fromRoot,
  importedCss,
  parseArgs,
  resolver,
  stripCssComments,
  usageError,
} from "./lib.mjs";

const USAGE =
  "node tools/design-system/check.mjs [design-system-dir] [--static] [--only=<text>] [--chromium=<path>]";
const { args, flags } = parseArgs(USAGE, ["static", "only", "chromium"]);
if (args.length > 1) usageError(USAGE, "expected one design-system dir");
if (flags.only === true) usageError(USAGE, "--only needs a text");
if (flags.chromium === true) usageError(USAGE, "--chromium needs a path");
const dir = fromRoot(args[0] ?? DEFAULT_DIR);
if (!fs.existsSync(path.join(dir, "styles.css"))) {
  usageError(USAGE, `no styles.css in ${dir}`);
}
const CHROMIUM = flags.chromium ?? "/usr/bin/chromium";
if (!flags.static && !fs.existsSync(CHROMIUM)) {
  usageError(USAGE, `no Chromium at ${CHROMIUM}; pass --chromium=<path>`);
}
// Served one level below the directory, so the fixture's ../styles.css is the
// directory's styles.css.
const FIXTURES = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures"
);
const FIXTURE_MOUNT = "__check-fixtures__";
const FIXTURE_PAGE = `${FIXTURE_MOUNT}/check-fixtures.html`;

const exists = (f) => fs.existsSync(path.join(dir, f));
const read = (f) => fs.readFileSync(path.join(dir, f), "utf8");
const list = (d, re) =>
  exists(d)
    ? fs
        .readdirSync(path.join(dir, d))
        .filter((f) => re.test(f))
        .sort()
        .map((f) => `${d}/${f}`)
    : [];

const findings = [];
const notes = [];
const fail = (rule, msg) => findings.push(`${rule}  ${msg}`);
const strip = (s) =>
  stripCssComments(s).replace(/url\("data:[^"]*"\)/g, "url()");
const noSprite = (html) =>
  html.replace(/<svg\b[^>]*\bclass="mds-sprite"[^>]*>[\s\S]*?<\/svg>/, "");
const unique = (it) => [...new Set(it)];

const css = importedCss(dir).filter((f) => !/^https?:/.test(f));
for (const f of css) {
  if (!exists(f))
    fail("MISSING", `styles.css imports ${f}, which does not exist`);
}
const TOKEN_FILES = css.filter((f) => f.startsWith("tokens/") && exists(f));
const LAYERS = css.filter((f) => !f.startsWith("tokens/") && exists(f));
const specimens = list("specimens", /^specimen-[\w-]+\.html$/);
const cards = ["components", "foundations", "patterns", "templates"].flatMap(
  (d) => list(d, /\.card\.html$/)
);

// ------------------------------------------------------------ static
const declared = new Set(
  [
    ...stripCssComments(TOKEN_FILES.map(read).join("\n")).matchAll(
      /(--[\w-]+)\s*:/g
    ),
  ].map((m) => m[1])
);
const { day, night, primitives } = colourThemes(dir);
const sources = [
  ...LAYERS.map((f) => ({ file: f, src: read(f), kind: "layer" })),
  ...specimens.map((f) => ({ file: f, src: noSprite(read(f)), kind: "page" })),
  ...cards.map((f) => ({ file: f, src: noSprite(read(f)), kind: "card" })),
];
for (const { file, src, kind } of sources) {
  const used = unique([...src.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]));
  // A card may declare its own scaffolding properties; nothing else may.
  const local = new Set(
    kind === "card" ? [...src.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]) : []
  );
  for (const n of used) {
    if (primitives.has(n) && !file.includes("foundations")) {
      fail("MDS-TOK-01", `${file}: primitive var(${n}) outside tokens/`);
    }
    if (!declared.has(n) && !local.has(n) && !n.startsWith("--mds-")) {
      fail("TOKEN", `${file}: ${n} is not a token (misspelt or invented)`);
    }
  }
}
for (const f of LAYERS) {
  const s = strip(read(f));
  for (const m of s.matchAll(/[{;]\s*(--[\w-]+)\s*:/g)) {
    fail("MDS-TOK-02", `${f} declares ${m[1]}`);
  }
  for (const m of s.matchAll(
    /(?<![\w-])(margin-left|margin-right|padding-left|padding-right|border-left|border-right|left|right)\s*:|text-align:\s*(left|right)|float:\s*(left|right)/g
  )) {
    fail("MDS-LAY-05", `${f}: physical property "${m[0]}"`);
  }
  for (const m of s.matchAll(
    /var\(--elevation-[\w-]+\)\s*,\s*var\(--ring-focus\)/g
  )) {
    fail(
      "MDS-A11Y-01",
      `${f}: an elevation is composed before --ring-focus and paints over it: "${m[0]}"`
    );
  }
  for (const m of s.matchAll(/outline:\s*none/g)) {
    const rule = s.slice(
      s.lastIndexOf("}", m.index) + 1,
      s.indexOf("}", m.index)
    );
    if (!/box-shadow:\s*none|ring-focus/.test(rule)) {
      fail(
        "MDS-A11Y-01",
        `${f}: outline: none without a ring in "${rule.trim().slice(0, 80)}"`
      );
    }
  }
}
const icons = new Set(
  exists("assets/icons.svg")
    ? [
        ...read("assets/icons.svg").matchAll(/<symbol\b[^>]*\bid="([\w-]+)"/g),
      ].map((m) => m[1])
    : []
);
for (const { file, src, kind } of sources) {
  if (kind === "layer") continue;
  for (const m of src.matchAll(
    /<use\b[^>]*?\bhref=(["'])((?:[^"'#]*\/)?icons\.svg)?#([\w-]+)\1/g
  )) {
    const [, , sprite, id] = m;
    const inPage = !sprite && new RegExp(`id=["']${id}["']`).test(src);
    if (!icons.has(id) && !inPage) {
      fail("MDS-ICON-01", `${file}: icon "${id}" is not in assets/icons.svg`);
    }
  }
  if (kind === "page") {
    for (const m of src.matchAll(/style="([^"]*)"/g)) {
      if (!/^\s*(--mds-[\w-]+\s*:[^;]+;?\s*)+$/.test(m[1])) {
        fail("MDS-COMP-01", `${file}: inline style "${m[1]}"`);
      }
    }
    if (!/<html lang="[\w-]+" dir="(ltr|rtl)" data-app="\w+">/.test(src)) {
      fail("MDS-LAY-03", `${file}: <html> lacks lang, dir or data-app`);
    }
  }
}
// The line the manifest reads a card from; a card without it is left out of
// the manifest without a word.
const cardSize = new Map();
for (const f of cards) {
  const [first, second = ""] = read(f).split("\n");
  const m = first.match(/^<!--\s*@dsCard\s+(.*?)\s*-->\s*$/);
  const attrs = Object.fromEntries(
    [...(m?.[1] ?? "").matchAll(/(\w+)="([^"]*)"/g)].map((a) => [a[1], a[2]])
  );
  const lacking = ["group", "viewport", "name", "subtitle"].filter(
    (k) => !attrs[k]
  );
  if (!m || lacking.length) {
    fail(
      "CARD",
      `${f}: the first line is not <!-- @dsCard group viewport name subtitle --> (lacks ${lacking.join(", ")})`
    );
  }
  const size = attrs.viewport?.match(/^(\d+)x(\d+)$/);
  if (attrs.viewport && !size) {
    fail("CARD", `${f}: viewport "${attrs.viewport}" is not <width>x<height>`);
  }
  if (size) cardSize.set(f, [+size[1], +size[2]]);
  if (!/^<!doctype html><html lang="[\w-]+"/i.test(second)) {
    fail("CARD", `${f}: the second line is not <!doctype html><html lang="…">`);
  }
}
if (exists("tokens/typography.css")) {
  const typo = cssBlocks(read("tokens/typography.css"));
  const decls = (pick) =>
    new Map(typo.filter(pick).flatMap((b) => [...b.decls]));
  const island = decls((b) =>
    b.selector.startsWith(":is(:lang(ar), :lang(ota-Arab)) [lang]")
  );
  const defaults = decls((b) => b.selector === ":root" && !b.parent);
  const arabic = decls((b) => b.selector.startsWith("html:lang(ar)"));
  for (const [k, v] of island) {
    if (defaults.get(k) !== v) {
      fail(
        "MDS-TOK-02",
        `typography.css: the Latin island sets ${k}: ${v}, the default is ${defaults.get(k)}`
      );
    }
  }
  for (const k of arabic.keys()) {
    if (!island.has(k)) {
      fail(
        "MDS-TOK-02",
        `typography.css: the Arabic region re-points ${k} and the Latin island does not reset it`
      );
    }
  }
}
console.log(
  `static: ${sources.length} files (${LAYERS.length} class layers, ${specimens.length} specimens, ${cards.length} cards), ${declared.size} tokens declared, ${findings.length} findings`
);
if (flags.static) finish();

// ------------------------------------------------------------ in the page
// These functions are sent to the page as source text: they may read only
// their arguments and the page's own globals. Each starts from the page and
// every same-origin frame in it (a card shows a phone width in an iframe).

async function settle() {
  const docs = [document];
  for (let i = 0; i < docs.length; i++) {
    for (const f of docs[i].querySelectorAll("iframe")) {
      if (f.contentDocument) docs.push(f.contentDocument);
    }
  }
  for (let i = 0; i < 5; i++) {
    for (const d of docs) d.body?.getBoundingClientRect();
    await Promise.all(docs.map((d) => d.fonts.ready));
    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(r))
    );
    if (docs.every((d) => d.fonts.status === "loaded")) break;
  }
  await new Promise((r) => setTimeout(r, 200));
}

function darkRoots() {
  const docs = [document];
  for (let i = 0; i < docs.length; i++) {
    for (const f of docs[i].querySelectorAll("iframe")) {
      if (f.contentDocument) docs.push(f.contentDocument);
    }
  }
  for (const d of docs) d.documentElement.dataset.theme = "dark";
}

// The light theme pinned on a dark system: what a viewer gets from the theme
// switcher, or a page that sets data-theme="light" itself.
function lightRoots() {
  const docs = [document];
  for (let i = 0; i < docs.length; i++) {
    for (const f of docs[i].querySelectorAll("iframe")) {
      if (f.contentDocument) docs.push(f.contentDocument);
    }
  }
  for (const d of docs) d.documentElement.dataset.theme = "light";
}

function nightIsland() {
  const d = document.createElement("div");
  d.id = "__island";
  d.dataset.theme = "dark";
  while (document.body.firstChild) d.append(document.body.firstChild);
  document.body.append(d);
}

// Marks what the browser run then addresses by node: every element that paints
// Arabic-script text of its own (data-check-ar), and every element a pointer
// could hover that is not disabled (data-check-hover). `off` removes the marks.
function mark(off) {
  const docs = [document];
  for (let i = 0; i < docs.length; i++) {
    for (const f of docs[i].querySelectorAll("iframe")) {
      if (f.contentDocument) docs.push(f.contentDocument);
    }
  }
  const arabic =
    /[\u0600-\u06FF\u0750-\u077F\u0870-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
  const HOVER =
    "a, button, summary, label, select, input, textarea, tr, li, .mds-chip, .mds-choice, .mds-tab, .mds-nav-item, .mds-nav-user, .mds-card--interactive, .mds-week__trigger, .mds-tooltip-anchor";
  for (const d of docs) {
    for (const e of d.querySelectorAll("[data-check-ar], [data-check-hover]")) {
      e.removeAttribute("data-check-ar");
      e.removeAttribute("data-check-hover");
    }
    if (off) continue;
    for (const e of d.body.querySelectorAll("*")) {
      if (
        [...e.childNodes].some(
          (n) => n.nodeType === 3 && arabic.test(n.textContent)
        )
      ) {
        e.setAttribute("data-check-ar", "");
      }
    }
    for (const e of d.body.querySelectorAll(HOVER)) {
      const v = d.defaultView;
      if (
        e.matches(":disabled, [aria-disabled='true']") ||
        v.getComputedStyle(e).pointerEvents === "none"
      ) {
        continue;
      }
      e.setAttribute("data-check-hover", "");
    }
  }
}

// Transitions off while the hover pass forces states on and off, so each is
// measured at its end value at once.
function stillness(on) {
  const docs = [document];
  for (let i = 0; i < docs.length; i++) {
    for (const f of docs[i].querySelectorAll("iframe")) {
      if (f.contentDocument) docs.push(f.contentDocument);
    }
  }
  for (const d of docs) {
    d.getElementById("__still")?.remove();
    if (!on) continue;
    const st = d.createElement("style");
    st.id = "__still";
    st.textContent = "*, *::before, *::after { transition: none !important; }";
    d.head.append(st);
  }
}

// Every token's computed value, and every painted text node measured against
// the background painted under it.
function probe(names) {
  const docs = [document];
  for (let i = 0; i < docs.length; i++) {
    for (const f of docs[i].querySelectorAll("iframe")) {
      if (f.contentDocument) docs.push(f.contentDocument);
    }
  }
  const style = (e, pseudo) =>
    e.ownerDocument.defaultView.getComputedStyle(e, pseudo);
  const cs = style(
    document.getElementById("__island") ?? document.documentElement
  );
  const tokens = Object.fromEntries(
    names.map((n) => [n, cs.getPropertyValue(n).trim()])
  );
  const cv = document
    .createElement("canvas")
    .getContext("2d", { willReadFrequently: true });
  const parse = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (m) {
      const p = m[1]
        .split(/[ ,/]+/)
        .filter(Boolean)
        .map(Number);
      return [p[0], p[1], p[2], p[3] ?? 1];
    }
    cv.clearRect(0, 0, 1, 1);
    cv.fillStyle = c;
    cv.fillRect(0, 0, 1, 1);
    const d = cv.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const over = (f, b) =>
    [0, 1, 2].map((i) => f[i] * f[3] + b[i] * (1 - f[3])).concat(1);
  const lin = (u) => {
    const c = u / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const lum = (c) =>
    0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)];
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const bgOf = (el) => {
    const stack = [];
    for (let e = el; e; e = e.parentElement) {
      const c = parse(style(e).backgroundColor);
      if (c[3] > 0) {
        stack.push(c);
        if (c[3] >= 1) break;
      }
    }
    // Under every painted ancestor is the white canvas.
    let b = [255, 255, 255, 1];
    for (const c of stack.reverse()) b = over(c, b);
    return b;
  };
  const className = (e) => (e.className?.baseVal ?? e.className) || e.tagName;
  const results = [];
  const arabicOutside = [];
  const diaOutside = [];
  const targets = [];
  const faded = [];
  const frames = [];
  for (const doc of docs) {
    const where = doc === document ? "" : "iframe › ";
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n.textContent.trim();
      const el = n.parentElement;
      if (
        !t ||
        !el ||
        el.closest(
          ".mds-sprite, .mds-visually-hidden, script, style, option, [hidden]"
        )
      ) {
        continue;
      }
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      // An author string of unknown language is marked dir="auto" only (MDS-TYPE-07).
      const lg = el.closest("[lang]");
      const auto = el.closest('[dir="auto"]');
      if (
        /[\u0600-\u06FF]/.test(t) &&
        !(lg?.lang || "").startsWith("ar") &&
        !(auto && (!lg || lg.contains(auto)))
      ) {
        arabicOutside.push(where + t.slice(0, 30));
      }
      const s = style(el);
      if (/[ḥṣṭẓḍġḳʿʾ]/.test(t) && !/^"?Literata/.test(s.fontFamily)) {
        diaOutside.push(
          `${where}${t.slice(0, 30)} in ${s.fontFamily.split(",")[0]}`
        );
      }
      const disabled = el.closest(
        "[disabled], [aria-disabled='true']:not([aria-busy='true']), .is-disabled, :has(> :disabled)"
      );
      const bg = bgOf(el);
      let op = 1;
      for (let e = el; e; e = e.parentElement) op *= +style(e).opacity;
      let fg = over(parse(s.color), bg);
      if (op < 1) fg = over([...fg.slice(0, 3), op], bg);
      const size = Number.parseFloat(s.fontSize);
      const large = size >= 24 || (size >= 18.66 && +s.fontWeight >= 700);
      results.push({
        t: where + t.slice(0, 40),
        r: +ratio(fg, bg).toFixed(2),
        need: op < 1 ? 0 : disabled || large ? 3 : 4.5,
        dis: !!disabled,
        cls: className(el),
      });
    }
    // A select paints its chosen option itself; no text node carries it.
    for (const e of doc.querySelectorAll("select")) {
      const r = e.getBoundingClientRect();
      const t = e.selectedOptions?.[0]?.textContent.trim();
      if (!r.width || !r.height || !t || e.closest(".mds-visually-hidden"))
        continue;
      const s = style(e);
      const bg = bgOf(e);
      let op = 1;
      for (let x = e; x; x = x.parentElement) op *= +style(x).opacity;
      const fg = over([...over(parse(s.color), bg).slice(0, 3), op], bg);
      const dis = e.disabled || !!e.closest("fieldset:disabled");
      results.push({
        t: `${where}select: ${t.slice(0, 32)}`,
        r: +ratio(fg, bg).toFixed(2),
        need: dis ? 3 : 4.5,
        dis,
        cls: className(e),
      });
    }
    // A control drops its tone when disabled and never fades (MDS-A11Y-11).
    for (const e of doc.querySelectorAll(
      "button, input, select, textarea, .mds-chip, .mds-choice, a.mds-btn"
    )) {
      if (e.matches(".mds-chip > input") || e.closest(".mds-sprite, [hidden]"))
        continue;
      const r = e.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      let op = 1;
      for (let x = e; x; x = x.parentElement) op *= +style(x).opacity;
      if (op < 1) {
        const t = e.matches("select")
          ? e.selectedOptions?.[0]?.textContent
          : e.textContent || e.value;
        faded.push(
          `${where}${className(e)} "${(t || "").trim().slice(0, 24)}" at opacity ${op.toFixed(2)}`
        );
      }
    }
    for (const e of doc.querySelectorAll(
      "button, select, summary, input, .mds-chip, .mds-nav-item, .mds-choice, a.mds-btn, .mds-tab, a"
    )) {
      if (
        e.closest(".mds-sprite, .mds-visually-hidden") ||
        (e.matches("input") && e.closest("label")) ||
        style(e, "::after").position === "absolute" ||
        style(e).display === "inline"
      ) {
        continue;
      }
      const r = e.getBoundingClientRect();
      const [w, h] = [Math.round(r.width), Math.round(r.height)];
      if (w && (w < 24 || h < 24)) {
        targets.push({
          cls: where + className(e),
          w,
          h,
          t: (e.textContent || e.getAttribute("aria-label") || "")
            .trim()
            .slice(0, 24),
        });
      }
    }
    const root = doc.documentElement;
    frames.push({
      title: doc === document ? "" : doc.defaultView.frameElement?.title,
      overflow: root.scrollWidth - root.clientWidth,
    });
  }
  return { tokens, results, arabicOutside, diaOutside, targets, faded, frames };
}

// The ring of the focused element, found on it or on an ancestor that draws it
// (a chip for its input). Focus inside a frame is followed into it.
function ringOfFocused() {
  const indexPath = (e) => {
    const p = [];
    for (; e?.parentElement; e = e.parentElement) {
      p.unshift([...e.parentElement.children].indexOf(e));
    }
    return p.join("/");
  };
  const at = [];
  let el = document.activeElement;
  while (el?.contentDocument?.activeElement) {
    at.push(indexPath(el));
    el = el.contentDocument.activeElement;
  }
  const doc = el?.ownerDocument;
  if (!el || el === doc.body || el === doc.documentElement) {
    return at.length ? { path: at.join(" › "), skip: true } : null;
  }
  const style = (e) => doc.defaultView.getComputedStyle(e);
  const swatch = doc.createElement("i");
  swatch.style.color = "var(--ring-focus-color)";
  (el.parentElement ?? doc.body).append(swatch);
  const ring = style(swatch).color;
  swatch.remove();
  const outlines = (s) =>
    s.outlineStyle !== "none" &&
    s.outlineColor === ring &&
    Number.parseFloat(s.outlineWidth) >= 2;
  const draws = (s) => s.boxShadow.includes(ring) || outlines(s);
  const outer = (s) => {
    let x = 0;
    if (s.boxShadow.includes(ring)) {
      for (const seg of s.boxShadow.split(/,(?![^(]*\))/)) {
        if (seg.includes("inset")) continue;
        const n = seg
          .replace(/rgba?\([^)]*\)/, "")
          .trim()
          .split(/\s+/)
          .map(Number.parseFloat);
        x = Math.max(x, n[3] || 0);
      }
    }
    if (outlines(s)) {
      x = Math.max(
        x,
        Number.parseFloat(s.outlineOffset) + Number.parseFloat(s.outlineWidth)
      );
    }
    return x;
  };
  let drawer = null;
  for (let e = el, i = 0; e && i < 4; e = e.parentElement, i++) {
    if (draws(style(e))) {
      drawer = e;
      break;
    }
  }
  const name = (e) =>
    e.tagName.toLowerCase() +
    (e.className && typeof e.className === "string"
      ? `.${e.className.trim().split(/\s+/).join(".")}`
      : "") +
    (e.getAttribute("aria-invalid") ? "[invalid]" : "");
  let escapes = 0;
  const modal = el.closest("dialog:modal");
  if (drawer && modal) {
    const r = drawer.getBoundingClientRect();
    const m = modal.getBoundingClientRect();
    const x = outer(style(drawer));
    escapes = Math.max(
      m.left - (r.left - x),
      m.top - (r.top - x),
      r.right + x - m.right,
      r.bottom + x - m.bottom
    );
  }
  return {
    path: [...at, indexPath(el)].join(" › "),
    name: (at.length ? "iframe › " : "") + name(el),
    text: (el.textContent || el.getAttribute("aria-label") || "")
      .trim()
      .slice(0, 24),
    ring: !!drawer,
    escapes,
  };
}

// A Latin island keeps each class; Naskh titles and body text have room for
// harakat; no inline Arabic sits in a vertical clip. Returns [rule, message].
function arabicChecks() {
  const docs = [document];
  for (let i = 0; i < docs.length; i++) {
    for (const f of docs[i].querySelectorAll("iframe")) {
      if (f.contentDocument) docs.push(f.contentDocument);
    }
  }
  const style = (e) => e.ownerDocument.defaultView.getComputedStyle(e);
  const out = [];
  const ref = document.querySelector('[data-fx="latin-ref"]');
  const ar = document.querySelector('[data-fx="ar-region"]');
  const fam = (s) => s.fontFamily.split(",")[0].replace(/"/g, "");
  if (ref && ar) {
    for (const a of ar.querySelectorAll("[data-fx-k]")) {
      const b = ref.querySelector(`[data-fx-k="${a.dataset.fxK}"]`);
      const [x, y] = [style(a), style(b)];
      if (fam(x) !== fam(y) || x.fontSize !== y.fontSize) {
        out.push([
          "MDS-TYPE-07",
          `the Latin island .${a.dataset.fxK} is ${fam(x)} ${x.fontSize} in an Arabic region, ${fam(y)} ${y.fontSize} on a Latin page`,
        ]);
      }
    }
  }
  for (const doc of docs) {
    for (const e of doc.querySelectorAll(
      ".mds-display, .mds-h1, .mds-h2, .mds-h3, .mds-h4, .mds-h5, .mds-h6, .mds-body, .mds-body-sm, .mds-reading"
    )) {
      const s = style(e);
      const lh =
        Number.parseFloat(s.lineHeight) / Number.parseFloat(s.fontSize);
      if (/^"?Noto Naskh Arabic/.test(s.fontFamily) && lh < 1.7) {
        out.push([
          "MDS-TYPE-04",
          `${e.className} sets Naskh at ${s.fontSize}/${lh.toFixed(2)}, below the measured 1.70: ${e.textContent.trim().slice(0, 30)}`,
        ]);
      }
    }
    for (const e of doc.querySelectorAll(".mds-arabic")) {
      for (let p = e.parentElement; p; p = p.parentElement) {
        const s = style(p);
        if (s.overflowY !== "visible") {
          out.push([
            "MDS-TYPE-04",
            `.mds-arabic inside ${p.className} (overflow-y ${s.overflowY}): its descent is clipped: ${e.textContent.trim().slice(0, 20)}`,
          ]);
          break;
        }
        if (!/^inline/.test(s.display)) break;
      }
    }
  }
  return out;
}

// [family, style, sizes, weights, glyphs]. A number is the ink runs the glyph
// must draw (its mark apart from its stem); a letter is the base whose ink top
// the capital's circumflex must clear by 0.1em. A flattened capital accent may
// touch the cap at 13–14px and still read as a circumflex, which is what a
// reader needs. 12px is --fs-eyebrow: uppercase only, so it is drawn in
// capitals.
const LOWER = { i: 2, ı: 1, â: 2, î: 2, û: 2 };
const UPPER = { İ: 2, I: 1, Â: "A", Î: "I", Û: "U" };
const BOTH = { ...LOWER, ...UPPER };
const FACES = [
  ["Instrument Sans", "normal", [12], [500, 600], UPPER],
  ["Instrument Sans", "normal", [13, 14, 16], [400, 500, 600], BOTH],
  [
    "Literata",
    "normal",
    [13, 14, 16, 18, 20, 24, 30, 40],
    [400, 500, 600],
    BOTH,
  ],
  ["Literata", "italic", [16, 18], [400], BOTH],
  ["Atkinson Hyperlegible Mono", "normal", [12, 13, 14], [400], BOTH],
];
async function turkishGate(faces) {
  const unloaded = [];
  for (const [f, st, , ws] of faces) {
    for (const w of ws) {
      const got = await document.fonts.load(
        `${st} ${w} 16px "${f}"`,
        "iıİIâîûÂÎÛl"
      );
      if (!got.length) unloaded.push(`${f} ${st} ${w}`);
    }
  }
  const draw = (f, st, s, w, ch, lang) => {
    const c = document.createElement("canvas");
    c.width = Math.ceil(s * 3);
    c.height = Math.ceil(s * 3);
    const x = c.getContext("2d", { willReadFrequently: true });
    x.lang = lang;
    x.fillStyle = "#fff";
    x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = "#000";
    x.font = `${st} ${w} ${s}px "${f}"`;
    x.fillText(ch, s * 0.6, s * 2);
    return x
      .getImageData(0, 0, c.width, c.height)
      .data.filter((_, i) => i % 4 === 0);
  };
  const top = (px, W) => {
    for (let y = 0; y * W < px.length; y++) {
      for (let x = 0; x < W; x++) if (255 - px[y * W + x] > 110) return y;
    }
    return 1e9;
  };
  const runs = (px, W) => {
    let r = 0;
    let prev = false;
    for (let y = 0; y * W < px.length; y++) {
      let m = 0;
      for (let x = 0; x < W; x++) m = Math.max(m, 255 - px[y * W + x]);
      const ink = m > 110;
      if (ink && !prev) r++;
      prev = ink;
    }
    return r;
  };
  const out = { fails: [], checked: 0, il: [], unloaded };
  for (const [f, st, sizes, ws, glyphs] of faces) {
    for (const s of sizes) {
      for (const w of ws) {
        const W = Math.ceil(s * 3);
        const at = `${f} ${st} ${w} ${s}px`;
        for (const [ch, want] of Object.entries(glyphs)) {
          const tr = draw(f, st, s, w, ch, "tr");
          const en = draw(f, st, s, w, ch, "en");
          out.checked++;
          if (typeof want === "string") {
            const lift = top(draw(f, st, s, w, want, "tr"), W) - top(tr, W);
            if (lift < s * 0.1) {
              out.fails.push(
                `${at}: the circumflex of '${ch}' rises only ${lift}px above '${want}'`
              );
            }
            if (top(tr, W) !== top(en, W)) {
              out.fails.push(
                `${at}: '${ch}' differs between lang=tr and lang=en`
              );
            }
            continue;
          }
          const [rt, re] = [runs(tr, W), runs(en, W)];
          if (rt !== want) {
            out.fails.push(
              `${at}: '${ch}' draws ${rt} ink run(s) under lang=tr (${re} under lang=en), expected ${want}`
            );
          } else if (rt !== re && want === 2) {
            out.fails.push(
              `${at}: '${ch}' differs between lang=tr and lang=en`
            );
          }
        }
        if (s === 14 && w === 400) {
          const a = draw(f, st, s, w, "I", "tr");
          const b = draw(f, st, s, w, "l", "tr");
          let d = 0;
          for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
          out.il.push(
            `${f} ${st}: I vs l differ by ${(d / 255).toFixed(1)} px of ink at 14px`
          );
        }
      }
    }
  }
  return out;
}

// ------------------------------------------------------------ server
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
};
const missing = new Map();
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, "http://x").pathname).slice(
    1
  );
  const [root, sub] = rel.startsWith(`${FIXTURE_MOUNT}/`)
    ? [FIXTURES, rel.slice(FIXTURE_MOUNT.length + 1)]
    : [dir, rel];
  const file = path.resolve(root, sub);
  if (
    !file.startsWith(root + path.sep) ||
    !fs.existsSync(file) ||
    !fs.statSync(file).isFile()
  ) {
    if (rel !== "favicon.ico" && !missing.has(rel)) {
      const from = req.headers.referer
        ? new URL(req.headers.referer).pathname.slice(1)
        : "a page";
      missing.set(rel, from.replace(FIXTURE_MOUNT, "fixtures"));
    }
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, {
    "content-type": TYPES[path.extname(file)] ?? "application/octet-stream",
  });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;

// ------------------------------------------------------------ browser
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "mds-check-"));
const chrome = spawn(
  CHROMIUM,
  [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--disable-gpu",
    "--hide-scrollbars",
    "--font-render-hinting=none",
    "--force-color-profile=srgb",
    "about:blank",
  ],
  { stdio: ["ignore", "ignore", "pipe"] }
);
let ws;
let broke = null;
try {
  const wsUrl = await new Promise((resolve, reject) => {
    let err = "";
    chrome.stderr.on("data", (d) => {
      err += d;
      const m = err.match(/DevTools listening on (ws:\S+)/);
      if (m) resolve(m[1]);
    });
    chrome.once("exit", () => reject(new Error(`Chromium exited: ${err}`)));
    setTimeout(() => reject(new Error("Chromium gave no DevTools URL")), 15000);
  });
  ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve);
    ws.addEventListener("error", reject);
  });
  await run();
} catch (e) {
  broke = e;
} finally {
  ws?.close();
  await new Promise((r) => {
    if (chrome.exitCode !== null) return r();
    chrome.once("exit", r);
    chrome.kill();
  });
  server.close();
  fs.rmSync(profile, { recursive: true, force: true });
}
finish(broke);

async function run() {
  let lastId = 0;
  const pending = new Map();
  const waiters = new Set();
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id === undefined) {
      for (const w of waiters) w(m);
      return;
    }
    const p = pending.get(m.id);
    pending.delete(m.id);
    if (m.error) p?.reject(new Error(`${p.method}: ${m.error.message}`));
    else p?.resolve(m.result);
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++lastId;
      pending.set(id, { resolve, reject, method });
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  const nextEvent = (sessionId, method, ms) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        waiters.delete(w);
        reject(new Error(`no ${method} within ${ms}ms`));
      }, ms);
      const w = (m) => {
        if (m.sessionId !== sessionId || m.method !== method) return;
        clearTimeout(timer);
        waiters.delete(w);
        resolve(m.params);
      };
      waiters.add(w);
    });
  const evaluate = async (sessionId, expression) => {
    const r = await send(
      "Runtime.evaluate",
      { expression, awaitPromise: true, returnByValue: true },
      sessionId
    );
    if (r.exceptionDetails) {
      throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400));
    }
    return r.result.value;
  };
  const call = (sessionId, fn, ...a) =>
    evaluate(
      sessionId,
      `(${fn})(${a.map((x) => JSON.stringify(x)).join(", ")})`
    );

  async function open(page, [width, height], scheme) {
    const { targetId } = await send("Target.createTarget", {
      url: "about:blank",
    });
    const { sessionId } = await send("Target.attachToTarget", {
      targetId,
      flatten: true,
    });
    for (const d of ["Page", "DOM", "CSS"]) {
      await send(`${d}.enable`, {}, sessionId);
    }
    await send(
      "Emulation.setDeviceMetricsOverride",
      { width, height, deviceScaleFactor: 1, mobile: false },
      sessionId
    );
    await send(
      "Emulation.setEmulatedMedia",
      { features: [{ name: "prefers-color-scheme", value: scheme }] },
      sessionId
    );
    const loaded = nextEvent(sessionId, "Page.loadEventFired", 30000);
    await send("Page.navigate", { url: `${origin}/${page}` }, sessionId);
    await loaded;
    await call(sessionId, settle);
    return { targetId, sessionId };
  }

  // A page starts from nothing focused; a modal starts where showModal() put
  // focus (Chromium resumes sequential navigation after a blurred element, so
  // blurring would skip the dialog's first stop).
  async function tabThrough(sid, label, fromCurrent = false) {
    let stops = 0;
    let first = null;
    if (!fromCurrent) {
      await evaluate(
        sid,
        "document.activeElement?.blur(), window.scrollTo(0, 0)"
      );
    }
    for (let i = 0; i < 800; i++) {
      if (i || !fromCurrent) {
        for (const type of ["keyDown", "keyUp"]) {
          await send(
            "Input.dispatchKeyEvent",
            { type, key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 },
            sid
          );
        }
      }
      const r = await call(sid, ringOfFocused);
      if (!r || r.path === first) break;
      first ??= r.path;
      if (r.skip) continue;
      stops++;
      if (!r.ring) {
        fail(
          "MDS-A11Y-01",
          `${label}: focused ${r.name} "${r.text}" paints no focus ring`
        );
      }
      if (r.escapes > 0.5) {
        fail(
          "MDS-A11Y-01",
          `${label}: the ring of ${r.name} "${r.text}" is drawn ${r.escapes.toFixed(1)}px outside its modal, on the page under the scrim`
        );
      }
    }
    return stops;
  }

  // Node ids for each selector in the page and in every frame inside it. One
  // DOM.getDocument per call: a second one invalidates the ids of the first.
  async function nodesFor(sid, ...selectors) {
    const { root } = await send(
      "DOM.getDocument",
      { depth: -1, pierce: true },
      sid
    );
    const docs = [];
    const walk = (n) => {
      if (n.nodeName === "#document") docs.push(n.nodeId);
      for (const c of n.children ?? []) walk(c);
      if (n.contentDocument) walk(n.contentDocument);
    };
    walk(root);
    const found = [];
    for (const selector of selectors) {
      const nodeIds = [];
      for (const nodeId of docs) {
        const r = await send("DOM.querySelectorAll", { nodeId, selector }, sid);
        nodeIds.push(...r.nodeIds);
      }
      found.push(nodeIds);
    }
    return selectors.length === 1 ? found[0] : found;
  }

  // Every Arabic-script glyph in a web font: Naskh, or Scheherazade New in
  // .mds-quran. A system face with Arabic glyphs (Arial, Times New Roman on
  // Windows) would otherwise paint an unmarked title.
  async function arabicFonts(sid, label) {
    const [q, ar] = await nodesFor(
      sid,
      ".mds-quran, .mds-quran *",
      "[data-check-ar]"
    );
    const quran = new Set(q);
    const nodeIds = new Set([...q, ...ar]);
    const glyphs = { all: 0, quran: 0 };
    for (const nodeId of nodeIds) {
      const r = await send("CSS.getPlatformFontsForNode", { nodeId }, sid);
      for (const f of r.fonts ?? []) {
        glyphs.all += f.glyphCount;
        if (quran.has(nodeId)) glyphs.quran += f.glyphCount;
        if (f.isCustomFont) continue;
        if (quran.has(nodeId)) {
          fail(
            "MDS-TYPE-04",
            `${label}: ${f.glyphCount} glyph(s) of .mds-quran painted in the system font ${f.familyName}, not in Scheherazade New`
          );
        } else {
          const { node } = await send("DOM.describeNode", { nodeId }, sid);
          const cls =
            (node.attributes ?? []).join(" ").match(/class (\S+)/)?.[1] ??
            node.localName;
          fail(
            "MDS-TYPE-01",
            `${label}: ${f.glyphCount} glyph(s) in ${cls} painted in the system font ${f.familyName}, not in a web font`
          );
        }
      }
    }
    return glyphs;
  }

  // :hover forced on (or off) for every marked element at once.
  async function forceHover(sid, on) {
    for (const nodeId of await nodesFor(sid, "[data-check-hover]")) {
      await send(
        "CSS.forcePseudoState",
        { nodeId, forcedPseudoClasses: on ? ["hover"] : [] },
        sid
      );
    }
  }

  const names = [...day.keys()].filter((n) => !primitives.has(n));
  const expectedIn = (values) => {
    const resolve = resolver(values);
    return Object.fromEntries(names.map((n) => [n, resolve(values.get(n))]));
  };
  const expected = { light: expectedIn(day), dark: expectedIn(night) };
  const norm = (v) =>
    (v ?? "")
      .replace(/\s+/g, " ")
      .replace(/\s*([,/()])\s*/g, "$1")
      .trim()
      .toLowerCase();
  const pages = [...specimens, ...cards, FIXTURE_PAGE].filter(
    (p) => !flags.only || p.includes(flags.only)
  );
  const labelOf = (p) => p.replace(FIXTURE_MOUNT, "fixtures");
  const sizeOf = (p) =>
    cardSize.get(p) ?? [/specimen-mobile\.html$/.test(p) ? 390 : 1440, 900];
  const modes = [
    ["light", "light", null],
    ["dark (prefers-color-scheme)", "dark", null],
    ["dark (data-theme)", "light", "dark"],
    ["dark (island)", "light", "island"],
    ["light (data-theme on a dark system)", "dark", "light"],
  ];
  let measured = 0;
  let focused = 0;
  const glyphs = { all: 0, quran: 0 };
  let hovered = 0;
  const minBy = {};
  for (const page of pages) {
    const f = labelOf(page);
    const seen = {};
    for (const [label, scheme, attr] of modes) {
      const { targetId, sessionId } = await open(page, sizeOf(page), scheme);
      if (attr === "dark") await call(sessionId, darkRoots);
      if (attr === "light") await call(sessionId, lightRoots);
      if (attr === "island") await call(sessionId, nightIsland);
      if (attr) await call(sessionId, settle);
      const out = await call(sessionId, probe, names);
      const theme =
        attr === "light"
          ? "light"
          : scheme === "dark" || attr
            ? "dark"
            : "light";
      const wrong = names.filter(
        (n) => norm(out.tokens[n]) !== norm(expected[theme][n])
      );
      if (wrong.length && Object.values(out.tokens).every((v) => !v)) {
        fail(
          "RESOLVE",
          `${f} ${label}: no token resolves; is styles.css linked?`
        );
      } else {
        for (const n of wrong) {
          fail(
            "RESOLVE",
            `${f} ${label}: ${n} is "${out.tokens[n]}" in the browser, "${expected[theme][n]}" from tokens/`
          );
        }
      }
      seen[label] = out.tokens;
      for (const r of out.results) {
        measured++;
        if (r.need) {
          const k = r.dis ? `${theme}, disabled` : theme;
          minBy[k] = Math.min(minBy[k] ?? 99, r.r);
        }
        if (r.r < r.need) {
          fail(
            "CONTRAST",
            `${f} ${label}: "${r.t}" (${r.cls}) ${r.r} < ${r.need}`
          );
        }
      }
      for (const t of out.faded) {
        fail("MDS-A11Y-11", `${f} ${label}: ${t}`);
      }
      if (label === "light" || label === "dark (data-theme)") {
        await call(sessionId, mark, false);
        await call(sessionId, stillness, true);
        await forceHover(sessionId, true);
        const h = await call(sessionId, probe, names);
        for (const r of h.results) {
          hovered++;
          if (r.r < r.need) {
            fail(
              "CONTRAST",
              `${f} ${label}, hovered: "${r.t}" (${r.cls}) ${r.r} < ${r.need}`
            );
          }
        }
        await forceHover(sessionId, false);
        await call(sessionId, stillness, false);
      }
      if (label === "light") {
        for (const t of out.arabicOutside) {
          fail("MDS-TYPE-07", `${f}: Arabic outside a lang="ar" element: ${t}`);
        }
        for (const t of out.diaOutside) {
          fail(
            "MDS-TYPE-01",
            `${f}: DİA transliteration outside Literata: ${t}`
          );
        }
        for (const t of out.targets) {
          fail(
            "MDS-A11Y-05",
            `${f}: target "${t.t}" (${t.cls}) is ${t.w}×${t.h}`
          );
        }
        for (const [rule, msg] of await call(sessionId, arabicChecks)) {
          fail(rule, `${f}: ${msg}`);
        }
        const g = await arabicFonts(sessionId, f);
        glyphs.all += g.all;
        glyphs.quran += g.quran;
      }
      for (const { title, overflow } of out.frames) {
        if (overflow > 0) {
          const what = title === "" ? "the page" : `the frame "${title}"`;
          fail(
            "MDS-LAY-04",
            `${f} ${label}: ${what} scrolls sideways by ${overflow}px`
          );
        }
      }
      await call(sessionId, mark, true);
      if (
        label === "light" ||
        label === "dark (data-theme)" ||
        label === "dark (island)"
      ) {
        focused += await tabThrough(sessionId, `${f} ${label}`);
        const dialogs = await evaluate(
          sessionId,
          "document.querySelectorAll('dialog').length"
        );
        for (let i = 0; i < dialogs; i++) {
          const d = `document.querySelectorAll("dialog")[${i}]`;
          // A dialog shown open on a card is closed first: showModal() throws
          // on an open dialog.
          await evaluate(
            sessionId,
            `window.__wasOpen = ${d}.open, ${d}.close(), ${d}.showModal()`
          );
          focused += await tabThrough(
            sessionId,
            `${f} ${label} <dialog> ${i + 1}`,
            true
          );
          await evaluate(
            sessionId,
            `${d}.close(), window.__wasOpen && ${d}.show()`
          );
        }
      }
      await send("Target.closeTarget", { targetId });
    }
    const [a, b] = [
      seen["dark (prefers-color-scheme)"],
      seen["dark (data-theme)"],
    ];
    for (const n of names) {
      if (norm(a[n]) !== norm(b[n])) {
        fail("THEME", `${f}: ${n} differs between the two dark paths`);
      }
    }
  }
  for (const [rel, from] of missing) {
    fail("MISSING", `${from} asks for ${rel}, which does not exist`);
  }
  const two = (x) => (x === undefined ? "none" : x.toFixed(2));
  const counts = [
    specimens.length && `${specimens.length} specimens`,
    cards.length && `${cards.length} cards`,
    "the fixtures",
  ].filter(Boolean);
  console.log(
    `browser: ${pages.length} pages${flags.only ? ` matching "${flags.only}"` : ` (${counts.join(", ")})`} × ${modes.length} theme paths; ${names.length} tokens resolved each time; ${measured} text nodes measured in place (lowest ratio held to a threshold: light ${two(minBy.light)}, dark ${two(minBy.dark)}; disabled text, held to 3:1: light ${two(minBy["light, disabled"])}, dark ${two(minBy["dark, disabled"])}); ${hovered} text nodes measured again with every hoverable element hovered, light and data-theme; ${focused} focus stops checked for their ring; ${glyphs.all} Arabic-script glyphs checked for a web face, ${glyphs.quran} of them Qur'an`
  );

  const { targetId, sessionId } = await open(FIXTURE_PAGE, [800, 900], "light");
  const g = await call(sessionId, turkishGate, FACES);
  for (const x of g.unloaded) {
    fail("FONTS", `${x} did not load (the faces come from Google Fonts)`);
  }
  for (const x of g.fails) fail("MDS-TYPE-05", `Turkish glyph gate: ${x}`);
  console.log(
    `turkish: ${g.checked} glyph renders (i ı İ I â î û Â Î Û × face × size × weight, lang=tr against lang=en), ${g.fails.length} failures`
  );
  for (const x of g.il) {
    notes.push(
      `I/l report — ${x}${/Instrument/.test(x) ? " (identifiers are set in --font-mono for this reason)" : ""}`
    );
  }
  await send("Target.closeTarget", { targetId });
}

// A run that broke off (Chromium died, a page never loaded) still prints what
// it found, and fails.
function finish(broke) {
  for (const n of notes) console.log(`  note: ${n}`);
  for (const f of findings) console.log(`  ${f}`);
  console.log(findings.length ? `${findings.length} findings` : "no findings");
  if (broke) console.error(`check.mjs could not finish: ${broke.message}`);
  process.exit(findings.length || broke ? 1 : 0);
}
