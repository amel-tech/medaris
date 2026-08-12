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
    ["exec", "nx", "show", "projects", "--affected", `--files=${file}`],
    { cwd: repoRoot, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }
  );
  if (result.status !== 0) {
    console.error(result.stdout ?? "");
    console.error(result.stderr ?? "");
    throw new Error(`\`nx show projects --affected\` failed for ${file}`);
  }
  // Nx prints the project list as JSON on stdout, possibly after banner lines.
  const line = result.stdout
    .split("\n")
    .map((l) => l.trim())
    .findLast((l) => l.startsWith("[") && l.endsWith("]"));
  if (!line) {
    console.error(result.stdout);
    throw new Error(`could not parse the affected project list for ${file}`);
  }
  return JSON.parse(line);
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
    "\n✖ affected-isolation: `nx affected` no longer isolates a single stack.\n" +
      "  A change to one app is scheduling work for projects that do not depend\n" +
      "  on it. Check nx.json namedInputs/sharedGlobals for an over-broad entry\n" +
      "  and `pnpm exec nx graph` for an unintended edge."
  );
  process.exit(1);
}

console.log("\n✔ affected-isolation: each stack's changes stay within it.");
