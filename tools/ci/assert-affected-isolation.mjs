#!/usr/bin/env node
/**
 * Asserts the stack-isolation property of `nx affected` (MDRS-15, AC #2:
 * "a backend-only change does not trigger frontend builds, and vice versa").
 *
 * Why this exists as a CI assertion rather than a one-off manual check: the PR
 * that introduced the unified pipeline necessarily edits nx.json, package.json
 * and .github/workflows/ci.yaml, all of which are `sharedGlobals` inputs, so it
 * correctly affects all 16 projects and cannot itself demonstrate isolation.
 * Encoding the property here makes every subsequent PR re-prove it, which is
 * strictly better than observing it once.
 *
 * The check is deliberately exact rather than a subset test: a leaf source file
 * belonging to one app must affect exactly that one project. That single
 * assertion catches the whole failure class — a broken project graph, an
 * over-broad namedInput, or a stray root-level dependency — because any of
 * those make the affected set larger than one.
 *
 * Usage: node tools/ci/assert-affected-isolation.mjs
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Leaf files, each owned by exactly one project and imported by nothing else.
 * If one is moved or deleted, this gate fails loudly rather than silently
 * passing — that is intentional; update the path in the same PR.
 */
const CASES = [
  {
    label: "backend-only change (NestJS app)",
    file: "apps/tedrisat/src/main.ts",
    expected: ["tedrisat"],
  },
  {
    label: "frontend-only change (Next.js app)",
    file: "apps/nizam/app/[locale]/decks/[id]/cards/page.tsx",
    expected: ["nizam-web"],
  },
];

function affectedFor(file) {
  const result = spawnSync(
    "pnpm",
    [
      "exec",
      "nx",
      "show",
      "projects",
      "--affected",
      `--files=${file}`,
      "--json",
    ],
    { cwd: repoRoot, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }
  );
  if (result.status !== 0) {
    console.error(result.stdout ?? "");
    console.error(result.stderr ?? "");
    throw new Error(`\`nx show projects --affected\` failed for ${file}`);
  }
  return parseProjectList(result.stdout, file);
}

/**
 * `nx show projects` does not commit to one output shape: it emits a JSON array
 * in some environments and bare newline-separated project names in others (this
 * gate's first CI run printed `tedrisat`, while every local run — piped, and with
 * CI=true and NX_BASE/NX_HEAD set — printed `["tedrisat"]`). `--json` is passed
 * above, but since the difference was never reproducible locally it is not
 * trusted on its own; both shapes are accepted.
 */
export function parseProjectList(stdout, file) {
  const lines = (stdout ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const jsonLine = lines.findLast((l) => l.startsWith("[") && l.endsWith("]"));
  if (jsonLine) return JSON.parse(jsonLine);

  // Plain shape: one project name per line. Nx banner lines (" NX  ..."), pnpm's
  // "> nx show ..." echo and update notices are filtered out by shape rather than
  // by guesswork — a project name carries no whitespace and no leading
  // punctuation. The pattern is deliberately lowercase-only (no `i` flag): that
  // drops a bare "NX" while still matching every project name this workspace uses.
  const names = lines.filter((l) => /^[@a-z0-9][a-z0-9._/-]*$/.test(l));
  if (names.length > 0) return names;

  // An empty affected set is a legitimate answer, not a parse failure — but only
  // when Nx genuinely printed nothing. Any other unrecognised output means the
  // shape changed again, and must be surfaced instead of being read as "nothing
  // affected", which would make this gate pass vacuously.
  if (lines.length === 0) return [];

  console.error(stdout);
  throw new Error(`could not parse the affected project list for ${file}`);
}

let failed = false;

for (const { label, file, expected } of CASES) {
  if (!existsSync(join(repoRoot, file))) {
    console.error(
      `✖ ${label}: probe file no longer exists: ${file}\n` +
        "  Point this case at another leaf file owned by the same project."
    );
    failed = true;
    continue;
  }

  const actual = affectedFor(file).sort();
  const want = [...expected].sort();
  const ok =
    actual.length === want.length && actual.every((p, i) => p === want[i]);

  console.log(
    `${ok ? "✔" : "✖"} ${label}\n    ${file}\n    affected: ${JSON.stringify(
      actual
    )}${ok ? "" : `\n    expected: ${JSON.stringify(want)}`}`
  );

  if (!ok) failed = true;
}

if (failed) {
  console.error(
    "\n✖ affected-isolation: the affected set for a single app's leaf file is not\n" +
      "  what this gate expects. Two very different causes, so check which one:\n" +
      "\n" +
      "  1. A REGRESSION — a change to one app is scheduling work for projects\n" +
      "     that do not depend on it. Look for an over-broad entry in nx.json\n" +
      "     `namedInputs`/`sharedGlobals`, and for an unintended edge in\n" +
      "     `pnpm exec nx graph`. This is the failure the gate exists to catch.\n" +
      "\n" +
      "  2. LEGITIMATE GRAPH GROWTH — a newly added project genuinely depends on\n" +
      "     the probe's project, so it correctly appears alongside it. The\n" +
      "     reserved `apps/e2e` in pnpm-workspace.yaml is the obvious candidate.\n" +
      "     Nothing is wrong: add the new project to that case's `expected` list\n" +
      "     in tools/ci/assert-affected-isolation.mjs, in the same PR.\n" +
      "\n" +
      "  The check is exact on purpose — a subset test would stop catching (1)."
  );
  process.exit(1);
}

console.log("\n✔ affected-isolation: each stack's changes stay within it.");
