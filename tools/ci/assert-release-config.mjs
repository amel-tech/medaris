#!/usr/bin/env node
/**
 * Asserts the release identity chain of ADR-001 §D3 (MDRS-17):
 *
 *   Nx project = release-please component = commitlint scope
 *              = Docker image suffix = tag prefix
 *
 * Why this is a CI assertion and not a review checklist item: every link in that
 * chain lives in a different file, and release-please fails *silently* when one
 * drifts. A component whose name left `commitlint.config.mjs`'s `scope-enum`
 * still releases, but its release PR title is rejected by the commit-hygiene job.
 * A component whose tag prefix stops matching its deploy workflow's
 * `startsWith(github.event.release.tag_name, ...)` guard still tags and still
 * publishes a GitHub release — and simply never deploys. Nothing goes red; the
 * component just quietly stops shipping. Both failures are cheap to catch here
 * and expensive to notice in production.
 *
 * The manifest gets the same treatment for a different reason: it is the only
 * file in the repo whose *values* release-please trusts blindly. A wrong version
 * there either re-releases a shipped version or skips one (MDRS-17's stated
 * risk), and the mistake is unrecoverable once tagged. Pinning each entry to the
 * `package.json` at the same path makes the two views un-driftable.
 *
 * What this gate deliberately does NOT check: whether the manifest matches the
 * last *actually published* release. That needs the GitHub API, and as of this
 * writing `amel-tech/medaris` carries 0 tags and 0 releases (see
 * docs/migration/mdrs-17-release-please-consolidation.md §3). Offline agreement
 * between the manifest and the working tree is the strongest local proxy.
 *
 * Usage: node tools/ci/assert-release-config.mjs
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const CONFIG_PATH = "release-please-config.json";
const MANIFEST_PATH = ".release-please-manifest.json";
const WORKSPACE_PATH = "pnpm-workspace.yaml";
const WORKFLOW_DIR = ".github/workflows";

/** The official schema, as required by MDRS-17's `$schema` acceptance criterion. */
const SCHEMA_URL =
  "https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json";

/**
 * The seven locked components of ADR-001 §D3, as `path -> component`. Spelled
 * out rather than derived from the config so that this gate can catch a
 * component being added, removed or renamed in the config alone — deriving the
 * expectation from the thing under test would make that check vacuous. Adding
 * `apps/muhasebe` is a deliberate edit here, in the same PR (§D10).
 */
const LOCKED_COMPONENTS = {
  "apps/tedrisat": "tedrisat",
  "apps/teskilat": "teskilat",
  "apps/tedris": "tedris-web",
  "apps/nizam": "nizam-web",
  "apps/nazir": "nazir-web",
  "apps/landing": "landing-web",
  "apps/keycloak-theme": "keycloak-theme",
};

const failures = [];
const notes = [];

function check(ok, label, detail) {
  if (ok) {
    console.log(`✔ ${label}`);
  } else {
    console.log(`✖ ${label}\n    ${detail}`);
    failures.push(label);
  }
}

function readJson(relPath) {
  return JSON.parse(readFileSync(join(repoRoot, relPath), "utf8"));
}

function sorted(list) {
  return [...list].sort();
}

function sameSet(a, b) {
  const x = sorted(a);
  const y = sorted(b);
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

// ── The two files under test ───────────────────────────────────────────────────

for (const p of [CONFIG_PATH, MANIFEST_PATH]) {
  if (!existsSync(join(repoRoot, p))) {
    console.error(`✖ ${p} is missing — release-please cannot run without it.`);
    process.exit(1);
  }
}

const config = readJson(CONFIG_PATH);
const manifest = readJson(MANIFEST_PATH);
const packages = config.packages ?? {};
const paths = Object.keys(packages);
const lockedPaths = Object.keys(LOCKED_COMPONENTS);

// ── 1. Top-level config shape (ADR-001 §D10) ──────────────────────────────────

check(
  config.$schema === SCHEMA_URL,
  "config declares the official $schema",
  `expected ${SCHEMA_URL}\n    actual:  ${config.$schema ?? "(absent)"}`
);

check(
  config["separate-pull-requests"] === true,
  "config sets separate-pull-requests",
  "ADR-001 §D10 locks one release PR per component; a shared PR would couple all 7 releases."
);

// ── 2. Exactly the seven locked components ────────────────────────────────────

check(
  sameSet(paths, lockedPaths),
  "config declares exactly the 7 locked components",
  `config:   ${JSON.stringify(sorted(paths))}\n    expected: ${JSON.stringify(
    sorted(lockedPaths)
  )}\n    Adding a component means editing LOCKED_COMPONENTS in this file too (ADR-001 §D10).`
);

check(
  sameSet(Object.keys(manifest), lockedPaths),
  "manifest declares exactly the same 7 paths",
  `manifest: ${JSON.stringify(
    sorted(Object.keys(manifest))
  )}\n    expected: ${JSON.stringify(sorted(lockedPaths))}\n` +
    "    A path in one file but not the other means that component never releases," +
    " or releases with no known baseline version."
);

// ── 3. Per-component invariants ───────────────────────────────────────────────

for (const path of lockedPaths) {
  const component = LOCKED_COMPONENTS[path];
  const pkg = packages[path];

  if (!pkg) continue; // already reported by check 2

  check(
    pkg.component === component,
    `${component}: component name matches ADR-001 §D3`,
    `config component is ${JSON.stringify(pkg.component)}; the tag prefix, Nx project and commit scope all derive from it.`
  );

  // `path` duplicates the object key. Both inherited configs carried it, so it
  // is kept rather than dropped — but a duplicate that can disagree is a lie
  // waiting to happen, so the duplication is pinned instead of trusted.
  check(
    pkg.path === path,
    `${component}: redundant \`path\` agrees with its config key`,
    `key ${path} vs path ${JSON.stringify(pkg.path)}`
  );

  check(
    pkg["include-component-in-tag"] === true,
    `${component}: include-component-in-tag is true`,
    "Without it the tag is a bare `v<version>`, which collides across all 7 components."
  );

  check(
    pkg["release-type"] === "node",
    `${component}: release-type is node`,
    `actual: ${JSON.stringify(pkg["release-type"])}`
  );

  // MDRS-14 §3.3: release-please's own release commits must pass `scope-enum`,
  // and its unconfigured default (`chore(main): release ...`) does not.
  check(
    pkg["pull-request-title-pattern"] ===
      `chore(${component}): release \${version}`,
    `${component}: release PR title pattern keeps a valid commitlint scope`,
    `actual: ${JSON.stringify(pkg["pull-request-title-pattern"])}\n` +
      "    The default `chore(main): ...` fails scope-enum and blocks the release PR (MDRS-14 §3.3)."
  );

  check(
    pkg["package-name"] === component,
    `${component}: package-name collapses onto the component name`,
    `actual: ${JSON.stringify(pkg["package-name"])} — MDRS-17 keeps these one list.`
  );

  // ADR-001 §D10 drops `extra-files`: it is a version-string replacement
  // feature, not change detection, so `["libs/**"]` / `["shared/**"]` never did
  // what either source repo believed. Re-adding it would resurrect that.
  check(
    pkg["extra-files"] === undefined,
    `${component}: no extra-files glob`,
    `actual: ${JSON.stringify(pkg["extra-files"])} — ADR-001 §D10 drops this; it replaces version strings, it does not detect changes.`
  );

  // ── Manifest version vs the working tree ──
  const pkgJsonPath = join(repoRoot, path, "package.json");
  if (!existsSync(pkgJsonPath)) {
    check(false, `${component}: ${path}/package.json exists`, "path not found");
    continue;
  }
  const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf8"));

  check(
    manifest[path] === pkgJson.version,
    `${component}: manifest version matches ${path}/package.json`,
    `manifest ${JSON.stringify(manifest[path])} vs package.json ${JSON.stringify(
      pkgJson.version
    )} — release-please would bump from the manifest value and overwrite the other.`
  );

  // ADR-001 §D6: apps are named `@medaris/<release-component>`.
  check(
    pkgJson.name === `@medaris/${component}`,
    `${component}: package name is @medaris/${component} (ADR-001 §D6)`,
    `actual: ${JSON.stringify(pkgJson.name)}`
  );
}

// ── 4. No component name may prefix another ───────────────────────────────────
//
// The deploy workflows dispatch on `startsWith(tag_name, '<component>-')`, so if
// one component name were a prefix of another, one component's release would
// trigger the other's deploy. `tedrisat` and `tedris-web` are the near miss that
// makes this worth asserting: they share `tedris` but diverge before the `-`.

const components = lockedPaths.map((p) => LOCKED_COMPONENTS[p]);
const prefixCollisions = [];
for (const a of components) {
  for (const b of components) {
    if (a !== b && `${b}-`.startsWith(`${a}-`))
      prefixCollisions.push(`${a} ⊂ ${b}`);
  }
}
check(
  prefixCollisions.length === 0,
  "no component tag prefix shadows another",
  `collisions: ${prefixCollisions.join(", ")}`
);

// ── 5. Components are commitlint scopes ───────────────────────────────────────

const commitlint = await import(
  new URL("../../commitlint.config.mjs", import.meta.url).href
);
const scopeRule = commitlint.default?.rules?.["scope-enum"];
const scopes = Array.isArray(scopeRule) ? scopeRule[2] : undefined;

if (!Array.isArray(scopes)) {
  check(
    false,
    "commitlint scope-enum is readable",
    "could not read rules['scope-enum'][2]"
  );
} else {
  const missing = components.filter((c) => !scopes.includes(c));
  check(
    missing.length === 0,
    "every component is a commitlint scope",
    `missing from scope-enum: ${JSON.stringify(missing)}\n` +
      "    Its release PR title would be rejected by the commit-hygiene job."
  );
}

// ── 6. Components are registered workspace packages ───────────────────────────
//
// Read as text on purpose: pnpm-workspace.yaml is not parsed anywhere else in
// the repo and pulling in a YAML dependency for one list of quoted paths is not
// worth it. The `packages:` block is an explicit enumeration (ADR-001 §D11), so
// a line match is exact.

const workspace = readFileSync(join(repoRoot, WORKSPACE_PATH), "utf8");
const unregistered = lockedPaths.filter(
  (p) => !new RegExp(`^\\s*-\\s*['"]?${p}['"]?\\s*$`, "m").test(workspace)
);
check(
  unregistered.length === 0,
  "every component is enumerated in pnpm-workspace.yaml",
  `not registered: ${JSON.stringify(unregistered)} (ADR-001 §D11)`
);

// ── 7. Every component has a deploy workflow that accepts its tags ────────────

const workflowDir = join(repoRoot, WORKFLOW_DIR);
/** @type {Record<string, string>} filename -> contents */
const workflowText = {};
if (existsSync(workflowDir)) {
  for (const file of readdirSync(workflowDir)) {
    workflowText[file] = readFileSync(join(workflowDir, file), "utf8");
  }
}

for (const component of components) {
  const guard = `startsWith(github.event.release.tag_name, '${component}-')`;
  const owner = Object.keys(workflowText).find((f) =>
    workflowText[f].includes(guard)
  );
  check(
    Boolean(owner),
    `${component}: a deploy workflow guards on the \`${component}-\` tag prefix`,
    `no file in ${WORKFLOW_DIR} contains ${guard}\n` +
      "    release-please would tag and publish a release that deploys nothing."
  );
  if (owner) notes.push(`${component} → ${WORKFLOW_DIR}/${owner}`);
}

// ── Result ────────────────────────────────────────────────────────────────────

if (notes.length > 0) {
  console.log("\n  tag prefix → deploy workflow");
  for (const n of notes) console.log(`    ${n}`);
}

if (failures.length > 0) {
  console.error(
    `\n✖ release config: ${failures.length} assertion(s) failed.\n` +
      "  These files must agree, or a component releases wrongly or stops shipping\n" +
      "  without anything going red:\n" +
      `    ${CONFIG_PATH}\n` +
      `    ${MANIFEST_PATH}\n` +
      "    <component>/package.json (version + name)\n" +
      "    commitlint.config.mjs (scope-enum)\n" +
      `    ${WORKSPACE_PATH} (packages)\n` +
      `    ${WORKFLOW_DIR}/<component>*.yaml (release tag guard)\n` +
      "  See docs/migration/mdrs-17-release-please-consolidation.md and ADR-001 §D3/§D10."
  );
  process.exit(1);
}

console.log(
  `\n✔ release config: ${components.length} components, one config, one manifest, chain intact.`
);
