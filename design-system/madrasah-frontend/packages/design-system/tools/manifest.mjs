#!/usr/bin/env node
/**
 * Emits MANIFEST.json: a sha256 per syncable file plus a rollup hash that
 * identifies the whole design system at a point in time.
 *
 * This is what makes design -> codebase sync deterministic. The repo does not
 * judge whether it copied everything; it recomputes and compares.
 *
 *   node tools/manifest.mjs           # write MANIFEST.json
 *   node tools/manifest.mjs --check   # exit 1 if any file drifted from it
 *
 * Zero dependencies.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve, relative, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

/** Everything the codebase consumes. Anything not listed is design-project-local. */
const INCLUDE_DIRS = ["tokens", "src", "tools", "docs"];
const INCLUDE_FILES = ["package.json", "tsup.config.ts", "tsconfig.json", "project.json", "DESIGN_RULES.md", "GUIDE.md", "PROMPTS.md", "README.md", "SYNC.md"];

/** Never synced: build output. Everything else in the package ships. */
const EXCLUDE = [/^dist\//, /^node_modules\//, /^MANIFEST\.json$/];

const walk = (dir, acc = []) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
};

const sha = (buf) => createHash("sha256").update(buf).digest("hex");

function collect() {
  const files = [];
  for (const d of INCLUDE_DIRS) {
    try { files.push(...walk(resolve(root, d))); } catch { /* dir may not exist yet */ }
  }
  for (const f of INCLUDE_FILES) {
    try { statSync(resolve(root, f)); files.push(resolve(root, f)); } catch { /* optional */ }
  }
  return files
    .map((f) => relative(root, f).split(sep).join("/"))
    .filter((p) => !EXCLUDE.some((re) => re.test(p)))
    .sort();
}

function build() {
  const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  const files = {};
  for (const p of collect()) files[p] = sha(readFileSync(resolve(root, p)));

  // Rollup: hash of "path:hash" lines, so it changes if ANY file or the file set changes.
  const rollup = sha(Object.entries(files).map(([p, h]) => `${p}:${h}`).join("\n"));

  return {
    name: pkg.name,
    version: pkg.version,
    /** Short rollup — quote this when asking "which version are you on?". */
    fingerprint: rollup.slice(0, 12),
    rollup,
    generatedAt: new Date().toISOString(),
    fileCount: Object.keys(files).length,
    files,
  };
}

const manifestPath = resolve(root, "MANIFEST.json");

if (process.argv.includes("--check")) {
  let prev;
  try {
    prev = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    console.error("✗ MANIFEST.json missing. Run: node tools/manifest.mjs");
    process.exit(1);
  }
  const next = build();
  const problems = [];
  for (const [p, h] of Object.entries(next.files)) {
    if (!(p in prev.files)) problems.push(`+ ${p} (not in manifest)`);
    else if (prev.files[p] !== h) problems.push(`~ ${p} (changed)`);
  }
  for (const p of Object.keys(prev.files)) {
    if (!(p in next.files)) problems.push(`- ${p} (missing)`);
  }

  if (problems.length) {
    console.error(`✗ design system drifted from MANIFEST.json (${problems.length}):`);
    for (const l of problems.slice(0, 40)) console.error("   " + l);
    if (problems.length > 40) console.error(`   … and ${problems.length - 40} more`);
    console.error("\n  In the DESIGN project: regenerate with  node tools/manifest.mjs");
    console.error("  In the CODEBASE: your vendored copy is edited or stale — re-sync.");
    process.exit(1);
  }
  console.log(`✓ in sync — ${next.fingerprint} (${next.fileCount} files)`);
} else {
  const m = build();
  writeFileSync(manifestPath, JSON.stringify(m, null, 2) + "\n");
  console.log(`✓ MANIFEST.json — ${m.fingerprint} (${m.fileCount} files)`);
}
