#!/usr/bin/env node
// Loads a design system's _ds_bundle.js the way the claude.ai/design canvas
// does (a `window` object, React as a global) and renders every exposed
// component once with react-dom/server. Fails on a load error recorded in
// `__errors`, a missing export, a throw during render, or a component whose
// `<Name>Props` has a required member that its sample below does not supply.
//
// Rendering is server-side: effects do not run and there is no DOM, so this
// proves each component module evaluates and renders its markup, not how it
// behaves after hydration.
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import { fromRoot, parseArgs, usageError } from "./lib.mjs";

const USAGE =
  "node tools/design-system/smoke.mjs <design-system-dir | path/to/_ds_bundle.js>";
const { args } = parseArgs(USAGE, []);
if (args.length !== 1) usageError(USAGE, "expected one path");

const require = createRequire(import.meta.url);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const target = fromRoot(args[0]);
const isDir = fs.existsSync(target) && fs.statSync(target).isDirectory();
const bundlePath = isDir ? path.join(target, "_ds_bundle.js") : target;
if (!fs.existsSync(bundlePath)) usageError(USAGE, `no bundle at ${bundlePath}`);
const sourceDir = path.dirname(bundlePath);

// A sample per component that has required props or cannot take children;
// every other component gets `{ children: "Kaydet" }`. A component gaining a
// required prop needs its sample here, or the run fails and names the prop.
const SAMPLES = {
  AvatarStack: () => ({ people: [{ name: "İsmail Ağa" }, { name: "Ayşe" }] }),
  Field: (ns) => ({
    label: "E-posta",
    children: React.createElement(ns.Input ?? "input"),
  }),
  IconButton: () => ({ icon: "×", label: "Kapat" }),
  Input: () => ({ placeholder: "ornek@medaris.org" }),
  Textarea: () => ({ rows: 3 }),
  Stat: () => ({ label: "Talebe", value: 42 }),
  Table: () => ({
    columns: [{ key: "ad", header: "Ad" }],
    rows: [{ ad: "İsmail Ağa" }],
  }),
  Tabs: () => ({
    tabs: [{ value: "dersler", label: "Dersler" }],
    value: "dersler",
  }),
};

// Members of `export interface <name> { … }` with whether each is optional.
function interfaceMembers(dts, name) {
  const m = dts.match(
    new RegExp(`export interface ${name}(?:<[^>]*>)?[^{]*\\{`)
  );
  if (!m) return null;
  let i = m.index + m[0].length;
  let depth = 1;
  while (depth && i < dts.length) {
    if (dts[i] === "{") depth++;
    else if (dts[i] === "}") depth--;
    i++;
  }
  const body = dts
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
      const mm = cur.trim().match(/^(\w+)(\??)\s*:/);
      if (mm) members.push({ name: mm[1], optional: mm[2] === "?" });
      cur = "";
    } else cur += ch;
  }
  return members;
}

const text = fs.readFileSync(bundlePath, "utf8");
const header = JSON.parse(
  text
    .split("\n")[0]
    .replace(/^\/\* @ds-bundle: /, "")
    .replace(/ \*\/$/, "")
);
const window = {};
vm.runInNewContext(text, { window, React, console });
const ns = window[header.namespace];

let bad = 0;
for (const e of ns.__errors) {
  bad++;
  console.log(`ERR load ${e.path}: ${e.error}`);
}
const dtsSeen = fs.existsSync(path.join(sourceDir, "components"));
if (!dtsSeen) {
  console.log(
    `note: no components/ beside the bundle; required props unchecked`
  );
}
for (const c of header.components) {
  const Comp = ns[c.name];
  if (typeof Comp !== "function") {
    bad++;
    console.log(`ERR ${c.name.padEnd(14)} not exported by the bundle`);
    continue;
  }
  const props = SAMPLES[c.name]?.(ns) ?? { children: "Kaydet" };
  const dts = path.join(sourceDir, c.sourcePath.replace(/\.jsx$/, ".d.ts"));
  if (dtsSeen && fs.existsSync(dts)) {
    const members = interfaceMembers(
      fs.readFileSync(dts, "utf8"),
      `${c.name}Props`
    );
    const missing = (members ?? [])
      .filter((m) => !m.optional && !(m.name in props))
      .map((m) => m.name);
    if (missing.length) {
      bad++;
      console.log(
        `ERR ${c.name.padEnd(14)} no sample for required ${missing.join(", ")}`
      );
      continue;
    }
  }
  try {
    const html = renderToStaticMarkup(React.createElement(Comp, props));
    console.log(`ok  ${c.name.padEnd(14)} ${html.slice(0, 80)}`);
  } catch (e) {
    bad++;
    console.log(`ERR ${c.name.padEnd(14)} ${e.message}`);
  }
}
console.log(
  `smoke: ${header.components.length} components, ${bad} failure${bad === 1 ? "" : "s"}`
);
process.exit(bad ? 1 : 0);
