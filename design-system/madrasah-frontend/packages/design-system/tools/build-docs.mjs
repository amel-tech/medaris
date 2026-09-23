#!/usr/bin/env node
/**
 * Rebuilds docs/ds-components.jsx from src/components/.
 * Run after editing any component, or the docs pages render the previous version.
 * Zero dependencies.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const src = resolve(root, "src/components");

// Order matters: a component may reference one defined above it.
const ORDER = [
  [
    "brand",
    [
      "Icon",
      "Logo",
      "CoverPattern"
    ]
  ],
  [
    "core",
    [
      "Button",
      "IconButton",
      "Badge",
      "Pill",
      "Avatar",
      "Card",
      "Progress"
    ]
  ],
  [
    "forms",
    [
      "Field",
      "Input",
      "Select",
      "CheckboxRow"
    ]
  ],
  [
    "navigation",
    [
      "Breadcrumb",
      "Tabs",
      "SidebarItem"
    ]
  ],
  [
    "data",
    [
      "DataTable",
      "WeekAccordion",
      "LessonRow"
    ]
  ],
  [
    "feedback",
    [
      "Dialog",
      "Toast"
    ]
  ]
];

const all = [];
let body = "";
for (const [group, names] of ORDER) {
  for (const name of names) {
    let s = readFileSync(resolve(src, group, name + ".jsx"), "utf8")
      .replace(/^import[\s\S]*?from\s+["'][^"']+["'];?\s*$/gm, "")
      .replace(/^import\s+["'][^"']+["'];?\s*$/gm, "");
    const exp = [...s.matchAll(/export\s+(?:function|const)\s+([A-Za-z0-9_]+)/g)].map((m) => m[1]);
    s = s.replace(/export\s+(function|const)\s+/g, "$1 ").trim();
    all.push(...exp);
    body += `\n/* ---------- ${group}/${name} ---------- */\nconst { ${exp.join(", ")} } = (function () {\n${s}\nreturn { ${exp.join(", ")} };\n})();\n`;
  }
}
const uniq = [...new Set(all)];
const header = [
  "/* Browser bundle of the design-system components - GENERATED.",
  " *",
  " * Concatenated from ../src/components/ with imports/exports stripped and each",
  " * file wrapped in its own scope, so Babel-standalone can compile the set in a",
  " * plain browser with no bundler. This is what the docs pages load.",
  " *",
  " * Regenerate after editing ANY component:",
  " *   node tools/build-docs.mjs",
  " *",
  " * Application code should NOT load this - import from the package instead.",
  " * Exposes: window.MadrasahDS",
  " */",
].join("\n");

writeFileSync(
  resolve(root, "docs/ds-components.jsx"),
  header + "\n" + body + "\nwindow.MadrasahDS = { " + uniq.join(", ") + " };\nObject.assign(window, window.MadrasahDS);\n"
);
console.log("  ✓ docs/ds-components.jsx — " + uniq.length + " exports");
