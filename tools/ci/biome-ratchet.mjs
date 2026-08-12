#!/usr/bin/env node
/**
 * Workspace-root Biome gate with a diagnostic ratchet (MDRS-15).
 *
 * Two holes in the MDRS-12 lint setup, both measured on origin/main c59d467:
 *
 *  1. `nx run-many -t lint` never sees the workspace root. The `lint` target is
 *     `biome check {projectRoot}` and all 16 projects live under apps/ or libs/,
 *     so `biome check apps libs` covers 508 files while `biome check .` covers
 *     521. The 13-file difference is real config — eslint.config.mjs,
 *     commitlint.config.mjs, nx.json, biome.json, package.json, tsconfig.json,
 *     tsconfig.base.json, audit-ci.json, .depcheckrc.json, .mcp.json and the
 *     three .vscode/*.json files. `nx affected -t lint` has the same hole: a
 *     root-config-only change yields zero affected projects.
 *
 *  2. `biome ci .` exits 0 with 94 warnings and 27 infos, so the lint gate could
 *     not fail on any warn-severity rule.
 *
 * This script closes both: it runs Biome over the whole tree from the root
 * (fixing #1) and fails when any severity count exceeds the committed baseline
 * (fixing #2). It is deliberately NOT an Nx target — a second cached per-project
 * lint target racing the first is the trap MDRS-12 measured. It runs once, at
 * the root, uncached.
 *
 * Usage: node tools/ci/biome-ratchet.mjs
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const baselinePath = join(here, "biome-baseline.json");
const biomeBin = join(repoRoot, "node_modules", ".bin", "biome");

const SEVERITIES = ["errors", "warnings", "infos"];

function fail(message) {
  console.error(`\n✖ biome-ratchet: ${message}`);
  process.exit(1);
}

if (!existsSync(biomeBin)) {
  fail(
    `Biome binary not found at ${biomeBin}. Run \`pnpm install\` before this gate.`
  );
}

const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));

const result = spawnSync(
  biomeBin,
  ["ci", ".", "--reporter=json", "--colors=off"],
  { cwd: repoRoot, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }
);

if (result.error) {
  fail(`could not run Biome: ${result.error.message}`);
}

let report;
try {
  report = JSON.parse(result.stdout);
} catch {
  // Biome only emits non-JSON here when it crashed or was misconfigured;
  // surfacing its raw output is the only useful thing we can do.
  console.error(result.stdout?.slice(0, 4000) ?? "");
  console.error(result.stderr?.slice(0, 4000) ?? "");
  fail(
    `Biome did not produce a JSON report (exit ${result.status}). See output above.`
  );
}

const summary = report.summary;

// Without these guards the ratchet fails OPEN, which is worse than not having
// it. If Biome renames a summary key on upgrade, or biome.json grows an ignore
// that narrows `files.includes`, every count reads as 0, the gate reports
// "below baseline", and it cheerfully recommends lowering the baseline to zero —
// silently disabling the only lint covering the 13 root config files. So: the
// severity keys must be present and numeric, and the number of files actually
// checked must not fall meaningfully below what the baseline was measured on.
if (!summary || typeof summary !== "object") {
  fail(
    "Biome's JSON report had no `summary` object — cannot evaluate the gate."
  );
}
for (const severity of SEVERITIES) {
  if (typeof summary[severity] !== "number") {
    fail(
      `Biome's report is missing a numeric \`summary.${severity}\`. Biome's JSON ` +
        "shape probably changed on upgrade; fix this gate rather than bypassing it."
    );
  }
}

const filesChecked = (summary.unchanged ?? 0) + (summary.changed ?? 0);
const minFiles = baseline.minFilesChecked ?? 0;
if (filesChecked < minFiles) {
  fail(
    `Biome checked ${filesChecked} files but the baseline was measured on at ` +
      `least ${minFiles}. Something is excluding files from the root gate — ` +
      "check biome.json `files.includes` and .gitignore. Lower " +
      "`minFilesChecked` in tools/ci/biome-baseline.json only if the drop is " +
      "intended (e.g. code was genuinely deleted)."
  );
}

const actual = {
  errors: summary.errors,
  warnings: summary.warnings,
  infos: summary.infos,
};

console.log(
  `biome-ratchet: checked ${filesChecked} files at the workspace root ` +
    `(${summary.unchanged ?? 0} unchanged / ${summary.changed ?? 0} changed, ` +
    `floor ${minFiles})`
);
for (const severity of SEVERITIES) {
  console.log(
    `  ${severity.padEnd(9)} ${String(actual[severity]).padStart(4)}  (baseline ${baseline[severity] ?? 0})`
  );
}

const regressions = SEVERITIES.filter(
  (severity) => actual[severity] > (baseline[severity] ?? 0)
);

if (regressions.length > 0) {
  const byCategory = new Map();
  for (const diagnostic of report.diagnostics ?? []) {
    if (!regressions.includes(`${diagnostic.severity}s`)) continue;
    const key = `${diagnostic.severity} ${diagnostic.category}`;
    byCategory.set(key, (byCategory.get(key) ?? 0) + 1);
  }
  console.error("\nDiagnostics in the regressing severities, by rule:");
  for (const [key, count] of [...byCategory].sort((a, b) => b[1] - a[1])) {
    console.error(`  ${String(count).padStart(4)}  ${key}`);
  }
  fail(
    `${regressions
      .map(
        (severity) =>
          `${severity} rose ${baseline[severity] ?? 0} → ${actual[severity]}`
      )
      .join(", ")}.\n` +
      "  Fix the new diagnostics (`pnpm exec biome check --write .` handles the\n" +
      "  mechanical ones), or — only if the increase is genuinely intended —\n" +
      "  raise the number in tools/ci/biome-baseline.json in the same PR."
  );
}

const improved = SEVERITIES.filter(
  (severity) => actual[severity] < (baseline[severity] ?? 0)
);
if (improved.length > 0) {
  console.log(
    `\n✔ biome-ratchet: below baseline (${improved
      .map(
        (severity) =>
          `${severity} ${baseline[severity] ?? 0} → ${actual[severity]}`
      )
      .join(", ")}).`
  );
  console.log(
    "  Please lower tools/ci/biome-baseline.json to lock the win in:\n" +
      `  ${JSON.stringify(actual)}`
  );
} else {
  console.log("\n✔ biome-ratchet: no severity count exceeded its baseline.");
}
