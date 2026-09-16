#!/usr/bin/env node
/**
 * Fails when `libs/services/swagger-docs/tedrisat.json` is not what the
 * exporter would write today.
 *
 * WHY THIS EXISTS (PR #69 review)
 * MDRS-58 added an exporter so the committed spec would stop going stale, and
 * left the freshness of the artifact resting on whoever edited a controller
 * remembering to run `pnpm run openapi:tedrisat`. They did not: four handlers
 * gained `403`/`404` declarations that never reached the published contract,
 * and the exporter itself was broken for weeks — `openapi:export` could not
 * run at all — without any gate noticing, because nothing in CI executes it.
 *
 * WHY `info.version` IS EXCLUDED
 * It is bound to `apps/tedrisat/package.json`, which release-please bumps on
 * every tedrisat release without anyone touching a route or a DTO. Comparing it
 * would make every release PR fail this check, and — worse — would make a
 * version-only diff indistinguishable from a real contract diff, consuming the
 * one signal this chain has. The same reasoning is why a release bump alone is
 * not a reason to regenerate the client.
 *
 * WHY ONLY THE EXPORT HALF
 * `generate:tedrisat` needs openapi-generator's Java toolchain; the export
 * needs `ts-node` and nothing else. The spec is the input to the client, so a
 * fresh spec is the check that matters — and `assertNoPathsLost` inside the
 * exporter already makes it safe to run unattended.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const COMMITTED = join(
  ROOT,
  "libs",
  "services",
  "swagger-docs",
  "tedrisat.json"
);
const REGENERATE = "pnpm run openapi:tedrisat";

/** The document, minus the one field a release bump moves on its own. */
function comparable(json) {
  const doc = JSON.parse(json);
  if (doc.info) delete doc.info.version;
  return JSON.stringify(doc, null, 2);
}

function fail(message) {
  console.error(`\n✖ openapi spec freshness: ${message}\n`);
  process.exit(1);
}

const workDir = mkdtempSync(join(tmpdir(), "openapi-fresh-"));
const target = join(workDir, "tedrisat.json");

try {
  let committed;
  try {
    committed = readFileSync(COMMITTED, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    fail(
      `${COMMITTED} is missing. It is a committed artifact, so its absence is ` +
        `a broken checkout rather than a normal state. Run \`${REGENERATE}\`.`
    );
  }

  try {
    execFileSync(
      "pnpm",
      ["--filter", "@medaris/tedrisat", "run", "openapi:export", target],
      { cwd: ROOT, stdio: "pipe" }
    );
  } catch (error) {
    const detail = [error.stdout, error.stderr]
      .map((buffer) => buffer?.toString().trim())
      .filter(Boolean)
      .join("\n");
    fail(
      "the exporter itself could not run, so the spec cannot be checked — " +
        "which is the state MDRS-58 shipped in and nothing caught:\n" +
        `${detail}`
    );
  }

  const fresh = readFileSync(target, "utf8");
  if (comparable(fresh) === comparable(committed)) {
    const paths = Object.keys(JSON.parse(fresh).paths ?? {}).length;
    console.log(
      `✔ openapi spec freshness: ${paths} paths, identical to what the ` +
        "exporter writes today (info.version excluded by design)."
    );
    process.exit(0);
  }

  fail(
    "the committed spec is not what the exporter writes from the current " +
      "controllers and DTOs. Something changed the HTTP contract without " +
      `regenerating the artifact. Run \`${REGENERATE}\` and commit both the ` +
      "spec and the regenerated client.\n\n" +
      "If the ONLY difference is info.version, this check would have passed — " +
      "it ignores that field, because release-please moves it on its own."
  );
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
