#!/usr/bin/env node
/**
 * Writes the workspace's package.json files, normalised, for the dependency
 * install of the six app images (the `manifests` stage of each app's
 * Dockerfile).
 *
 *   node tools/docker/workspace-manifests.mjs <context dir> <out dir>
 *
 * The images install dependencies from these copies before the source is
 * copied in, so BuildKit can reuse the install layer for as long as they do
 * not change: it keys `COPY --from=manifests` on file content. Two things
 * make them change only when the dependencies do:
 *
 *   - Only the root package.json and the members pnpm-workspace.yaml lists
 *     are written (that list is explicit, ADR-001 §D11; a glob fails here),
 *     so a new workspace package needs no Dockerfile edit and stray
 *     package.json files (a generated API client, test fixtures) are not
 *     inputs.
 *   - The top-level `version` is dropped. Release-please bumps one app's
 *     version on every release, which used to invalidate the install layer
 *     of all six images. pnpm links `workspace:*` dependencies whatever the
 *     version; a member that some manifest requires through a version range
 *     (`workspace:^1.2.0`) keeps its version. None does today.
 *
 * Output is JSON.stringify with two-space indent and the input's key order,
 * so identical inputs give byte-identical files.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const [context, out] = process.argv.slice(2);
if (!context || !out) {
  console.error("usage: workspace-manifests.mjs <context dir> <out dir>");
  process.exit(2);
}

/** The `packages:` entries of pnpm-workspace.yaml, in order. */
function workspaceMembers(yaml) {
  const members = [];
  let inPackages = false;
  for (const line of yaml.split("\n")) {
    if (/^packages:\s*$/.test(line)) {
      inPackages = true;
      continue;
    }
    if (!inPackages) continue;
    // The next top-level key ends the list; comments and blank lines do not.
    if (/^[^\s#]/.test(line)) break;
    const entry = line.match(/^\s+-\s+(['"]?)([^'"#\s]+)\1\s*(#.*)?$/);
    if (entry) members.push(entry[2]);
  }
  return members;
}

const members = workspaceMembers(
  readFileSync(join(context, "pnpm-workspace.yaml"), "utf8")
);
if (members.length === 0) {
  throw new Error("pnpm-workspace.yaml lists no packages");
}
for (const member of members) {
  if (/[*?[\]{}!]/.test(member)) {
    throw new Error(
      `pnpm-workspace.yaml: "${member}" is a glob; the members are listed one by one (ADR-001 §D11)`
    );
  }
}

const dirs = [".", ...members];
const manifests = new Map(
  dirs.map((dir) => [
    dir,
    JSON.parse(readFileSync(join(context, dir, "package.json"), "utf8")),
  ])
);

// Names some manifest requires through a `workspace:` range with a version
// in it. `workspace:*`, `workspace:^` and `workspace:~` do not look at it.
const versionPinned = new Set();
for (const manifest of manifests.values()) {
  for (const field of [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
  ]) {
    for (const [name, spec] of Object.entries(manifest[field] ?? {})) {
      if (typeof spec === "string" && /^workspace:.*\d/.test(spec)) {
        versionPinned.add(name);
      }
    }
  }
}

for (const [dir, manifest] of manifests) {
  if (!versionPinned.has(manifest.name)) delete manifest.version;
  const target = join(out, dir, "package.json");
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`);
}
console.log(
  `workspace-manifests: wrote ${manifests.size} package.json files` +
    (versionPinned.size > 0
      ? `; kept the version of ${[...versionPinned].join(", ")}`
      : "")
);
