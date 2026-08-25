#!/usr/bin/env node
/**
 * Asserts that every prefixed key `.env.example` ships can actually reach a
 * container (MDRS-70).
 *
 * Since MDRS-25 replaced compose's `env_file:` with an explicit `environment:`
 * allowlist, a key that docker-compose.yml does not name cannot reach a
 * container by any route. Setting it in the root `.env` still changes
 * `nx run <api>:dev`, so dev and deployment disagree — quietly, and only about
 * the keys someone forgot to map. That has happened three times in one
 * integration: the MDRS-30 Keycloak keys (a boot failure), the two Keycloak
 * cache TTLs (a 24-hour stale-key window where the template asks for one hour),
 * and `DB_CA_CERT` plus the three OTLP exporter settings — four keys, seven
 * mappings, since `DB_CA_CERT` is tedrisat-only. Every one was found by reading
 * the two files side by side; none by a gate. This is that gate.
 *
 * The rule, in one line: a key whose prefix names a compose service must be
 * interpolated inside that service's `environment:` block, or be listed below
 * with a reason.
 *
 * GROUP vs APP prefixes. `API__` is a group prefix — it targets both Nest
 * services — and the bar for it is "reaches at least one of them", not "reaches
 * all of them". That is deliberate, and it is the exact class this gate is for:
 * a key that reaches NOTHING. tedrisat's seven `API__KEYCLOAK_*` keys
 * legitimately do not reach teskilat, which has no auth guard — nothing under
 * apps/teskilat/src reads a Keycloak variable — and MDRS-69 owns whether the
 * rest of that divergence is right. Requiring full group coverage here would
 * turn that documented decision into seven ignore-list entries, and teach the
 * next reader that the ignore list is where disagreements go. Partial coverage
 * is printed as a note instead, so it stays visible without being a failure.
 *
 * What this deliberately does NOT check:
 *
 *   * The reverse direction — a key compose names that `.env.example` does not
 *     ship. That one fails loudly on its own: compose either falls back to the
 *     `:-default` written next to it or, for a `:?` key, refuses to render and
 *     names the variable. A quiet disagreement is what this gate is about.
 *   * Whether the canonical name on the left of a mapping is the one the app
 *     actually reads. `SWAGGER_PATH` was handed to teskilat under a name its
 *     config does not use — it reads `SWAGGER_ENDPOINT` — and this check cannot
 *     see that: both sides are spelled correctly, they just mean different
 *     things. Catching it needs the app's config schema, not these two files.
 *   * Commented-out keys. `# API__DB_CA_CERT=` is documentation, not something
 *     the template ships, so it is out of scope — which is also why that
 *     particular divergence had to be found by reading.
 *
 * FAIL-CLOSED PARSING. docker-compose.yml is read as text, the way
 * assert-release-config.mjs reads pnpm-workspace.yaml, rather than pulling in a
 * YAML dependency for two nested blocks. A text parser that silently matches
 * nothing would make this gate pass on everything, so the parse asserts its own
 * results before anything else: no services, no `environment:` blocks, or no
 * env keys is a failure, not a green run.
 *
 * Usage: node tools/ci/assert-env-compose-parity.mjs
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const ENV_EXAMPLE_PATH = ".env.example";
const COMPOSE_PATH = "docker-compose.yml";

/**
 * `prefix -> compose services it can reach`, as the `.env.example` header
 * defines the convention. Spelled out rather than derived from the compose file
 * so that a service being added, removed or renamed is caught here: deriving
 * the expectation from the thing under test would make the check vacuous.
 * Adding `apps/muhasebe` to docker-compose.yml is a deliberate edit here, in
 * the same PR.
 */
const PREFIX_TARGETS = {
  API: ["tedrisat", "teskilat"],
  TEDRISAT: ["tedrisat"],
  TESKILAT: ["teskilat"],
};

/**
 * Prefixes that name an app docker-compose.yml does not build. These are not
 * exemptions — there is no container on the other side to compare against — but
 * they are listed rather than pattern-skipped, so that a NEW prefix nobody has
 * classified fails instead of vanishing into a default branch.
 */
const UNCONTAINERISED_PREFIXES = {
  WEB: "group prefix for the four Next apps; docker-compose.yml builds only the two Nest APIs and the database, so no WEB__ key has a container to reach.",
  TEDRIS: "apps/tedris (tedris-web) has no compose service.",
  NIZAM: "apps/nizam (nizam-web) has no compose service.",
  NAZIR: "apps/nazir (nazir-web) has no compose service.",
  LANDING: "apps/landing (landing-web) has no compose service.",
};

/**
 * Unprefixed keys that are read by compose itself and handed to no app. The
 * `.env.example` header reads a bare `KEY=` as "every app", so without this
 * list they would be checked as group keys against every built service and fail
 * for a reason nobody could act on. Each entry is verified below to be present
 * in `.env.example` AND interpolated somewhere in docker-compose.yml — a
 * "root-only" key that compose never reads is dead, not root-only.
 */
const ROOT_ONLY_KEYS = {
  TEDRISAT_PORT:
    "compose's own `ports:` mapping for the tedrisat service; the container's internal port comes from TEDRISAT__PORT.",
  TESKILAT_PORT:
    "compose's own `ports:` mapping for the teskilat service; the container's internal port comes from TESKILAT__PORT.",
  MEDARIS_POSTGRES_USER:
    "read by the upstream postgres:17-alpine image through the medaris-db service, which is not a Medaris app; the APIs get DB_USERNAME from their own prefixed keys.",
  MEDARIS_POSTGRES_PASSWORD:
    "same: the medaris-db superuser credential, not an app credential. docker/init-db.sql creates the per-app users.",
  MEDARIS_POSTGRES_DB:
    "same: the bootstrap database of the medaris-db container. The APIs name their own with DB_NAME.",
  MEDARIS_POSTGRES_PORT:
    "compose's own `ports:` mapping for medaris-db on the host; inside the network the APIs use DB_PORT.",
};

/**
 * In-scope keys that deliberately reach no container. Kept short on purpose:
 * every entry here is a place where `nx run <api>:dev` and a container disagree
 * BY DESIGN, and each has to say why. An entry that stops being true fails the
 * staleness checks below — the list cannot grow silently and cannot rot, which
 * is the only thing that would make it worse than no gate at all.
 */
const UNMAPPED_ON_PURPOSE = {
  API__DB_HOST:
    "compose pins `DB_HOST: medaris-db`, the service name the database answers on inside the compose network. The template's `localhost` is only ever correct for `nx run <api>:dev`, so interpolating it would let a host-side value break every container.",
  API__AUTO_MIGRATIONS_FOLDER:
    'compose pins `./dist/src/database/migrations`. The template names `./src/...` for `nest start`; the image runs compiled output, and tsc mirrors the source tree so the compiled migrations sit under dist/src/. Interpolating the template value made the service log "Can\'t find meta/_journal.json" and then serve traffic against an unmigrated database.',
};

const failures = [];

function check(ok, label, detail) {
  if (ok) {
    console.log(`✔ ${label}`);
  } else {
    console.log(`✖ ${label}\n    ${detail}`);
    failures.push(label);
  }
}

function sorted(list) {
  return [...list].sort();
}

function sameSet(a, b) {
  const x = sorted(a);
  const y = sorted(b);
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

/** Bails out rather than reporting a green run on a file it could not read. */
function abort(message) {
  console.error(`✖ env/compose parity: ${message}`);
  process.exit(1);
}

// ── The two files under test ──────────────────────────────────────────────────

for (const p of [ENV_EXAMPLE_PATH, COMPOSE_PATH]) {
  if (!existsSync(join(repoRoot, p))) {
    abort(`${p} is missing — there is nothing to compare.`);
  }
}

const envText = readFileSync(join(repoRoot, ENV_EXAMPLE_PATH), "utf8");
const composeText = readFileSync(join(repoRoot, COMPOSE_PATH), "utf8");

// ── Parsing ───────────────────────────────────────────────────────────────────

/**
 * Assignment lines only. A leading `#` cannot match, so a commented-out key is
 * not read as shipped — see the header.
 */
function parseEnvKeys(text) {
  const keys = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    if (m) keys.push(m[1]);
  }
  return keys;
}

/**
 * `service -> { hasBuild, envVars }` where `envVars` is every `${VAR}` name
 * interpolated inside that service's `environment:` block, or null when the
 * service declares no such block.
 *
 * Indentation-driven, and narrow on purpose: only `environment:` counts, so a
 * variable used in `ports:` or `volumes:` is not mistaken for something the
 * container receives. Comment lines are dropped before anything else, so a
 * variable merely *named* in a comment — docker-compose.yml has several — is
 * not counted as mapped.
 */
function parseComposeServices(text) {
  /** @type {Record<string, {hasBuild: boolean, envVars: Set<string>|null}>} */
  const services = {};
  /**
   * Every `${VAR}` on any non-comment line of the file, `environment:` or not.
   * The ROOT_ONLY_KEYS check needs this: those keys are read by compose's own
   * `ports:` entries rather than handed to a container, so `envVars` cannot
   * answer for them — but testing the RAW file text instead would let a comment
   * that merely names a key satisfy the check, which is the one thing the
   * header promises comments never do.
   */
  const interpolated = new Set();
  let inServices = false;
  let current = null;
  let inEnv = false;

  for (const raw of text.split("\n")) {
    const line = raw.replace(/\s+$/, "");
    if (line === "" || /^\s*#/.test(line)) continue;

    for (const m of line.matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)/g)) {
      interpolated.add(m[1]);
    }

    // Any key at column 0 opens or closes the `services:` mapping.
    if (/^\S/.test(line)) {
      inServices = /^services:$/.test(line);
      current = null;
      inEnv = false;
      continue;
    }
    if (!inServices) continue;

    const indent = line.match(/^ */)[0].length;

    // A list item continues the block it sits in rather than opening a new key,
    // so it must be tested before the indent-4 sibling-key branch. `environment:`
    // written as a YAML sequence puts its items at the SAME indent as the key:
    //
    //     environment:
    //     - PORT=${TEDRISAT__PORT:-3001}
    //
    // which the indent-4 branch below would otherwise swallow, leaving the block
    // parsed but empty and every one of its keys reported as reaching nothing.
    if (inEnv && /^ *- /.test(line) && indent >= 4) {
      for (const m of line.matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)/g)) {
        services[current].envVars.add(m[1]);
      }
      continue;
    }

    if (indent === 2) {
      const name = line.match(/^ {2}([A-Za-z0-9_.-]+):$/);
      current = name ? name[1] : null;
      inEnv = false;
      if (current) services[current] = { hasBuild: false, envVars: null };
      continue;
    }
    if (!current) continue;

    if (indent === 4) {
      inEnv = /^ {4}environment:$/.test(line);
      if (inEnv) services[current].envVars = new Set();
      if (/^ {4}build:$/.test(line)) services[current].hasBuild = true;
      continue;
    }

    if (inEnv && indent > 4) {
      for (const m of line.matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)/g)) {
        services[current].envVars.add(m[1]);
      }
    }
  }
  return { services, interpolated };
}

const parsedEnvKeys = parseEnvKeys(envText);

// Deduplicated before anything counts them. A key assigned twice is a latent
// bug of its own — dotenv keeps the LAST assignment, so the value a reader sees
// is not necessarily the one that applies — and it would also quietly break the
// arithmetic in the report below, where "in scope + exempt + out of scope"
// should always equal the number of keys shipped.
const envKeys = [...new Set(parsedEnvKeys)];
const duplicateKeys = [
  ...new Set(parsedEnvKeys.filter((k, i) => parsedEnvKeys.indexOf(k) !== i)),
];

const { services, interpolated } = parseComposeServices(composeText);
const serviceNames = Object.keys(services);
const withEnvBlock = serviceNames.filter((s) => services[s].envVars !== null);
const builtServices = serviceNames.filter((s) => services[s].hasBuild);
const mappedVarCount = serviceNames.reduce(
  (n, s) => n + (services[s].envVars?.size ?? 0),
  0
);

// ── 0. The parse itself, before it is trusted ─────────────────────────────────
//
// Everything below is a negative check ("no service names this key"), so a
// parser that matched nothing would report a clean bill of health on a broken
// repo. These four abort instead of failing softly.

if (envKeys.length === 0)
  abort(
    `parsed 0 assignments out of ${ENV_EXAMPLE_PATH}. The parser expects \`KEY=value\` at column 0; every check below would pass vacuously.`
  );
if (serviceNames.length === 0)
  abort(
    `parsed 0 services out of ${COMPOSE_PATH}. The parser expects a top-level \`services:\` key with service names indented two spaces.`
  );
if (withEnvBlock.length === 0)
  abort(
    `parsed 0 \`environment:\` blocks out of ${COMPOSE_PATH}'s ${serviceNames.length} service(s). Every key would look unmapped — or, if the comparison were ever inverted, every key would look mapped.`
  );
if (builtServices.length === 0)
  abort(
    `parsed 0 services with a \`build:\` section out of ${COMPOSE_PATH}. This gate compares the template against images built from this repo; with none found there is nothing to compare.`
  );
// Counting `environment:` blocks is not the same as reading them. A block whose
// items the parser walked straight past still counts as a block, so this is the
// guard that actually means "the parser matched nothing".
if (mappedVarCount === 0)
  abort(
    `parsed ${withEnvBlock.length} \`environment:\` block(s) out of ${COMPOSE_PATH} but 0 interpolated variables inside them. The blocks were found and their contents were not read, so every key would be reported as reaching nothing.`
  );

console.log(
  `  ${COMPOSE_PATH}: ${serviceNames.length} services (${builtServices.length} built here), ` +
    `${withEnvBlock.length} with an environment block`
);
console.log(`  ${ENV_EXAMPLE_PATH}: ${envKeys.length} keys shipped\n`);

// ── 1. The template says each thing once ──────────────────────────────────────

check(
  duplicateKeys.length === 0,
  `${ENV_EXAMPLE_PATH} assigns every key once`,
  `assigned more than once: ${JSON.stringify(sorted(duplicateKeys))}\n` +
    "    The loader keeps the LAST assignment, so the value a reader finds by\n" +
    "    searching the file is not necessarily the one that applies."
);

// ── 2. The tables above are well formed ───────────────────────────────────────
//
// Both of these would otherwise be silent. A prefix listed in BOTH tables loses
// every one of its keys — the out-of-scope branch is tested first, so `API` in
// UNCONTAINERISED_PREFIXES would skip all 21 API__ keys while every other check
// still reported green. An empty target list is the same hole by another route.

const doubleClassified = Object.keys(PREFIX_TARGETS).filter(
  (p) => p in UNCONTAINERISED_PREFIXES
);
check(
  doubleClassified.length === 0,
  "no prefix is classified both ways",
  `in PREFIX_TARGETS and UNCONTAINERISED_PREFIXES: ${JSON.stringify(sorted(doubleClassified))}\n` +
    "    The out-of-scope branch wins, so every key under that prefix would be skipped silently."
);

const emptyTargets = Object.keys(PREFIX_TARGETS).filter(
  (p) => PREFIX_TARGETS[p].length === 0
);
check(
  emptyTargets.length === 0,
  "every prefix target list names at least one service",
  `empty in PREFIX_TARGETS: ${JSON.stringify(sorted(emptyTargets))}\n` +
    "    A prefix with no targets cannot reach anything, so its keys would fail with a message naming no service.\n" +
    "    Move it to UNCONTAINERISED_PREFIXES if the app has no compose service."
);

// ── 3. Every built service is classified ──────────────────────────────────────

const targetedServices = new Set(Object.values(PREFIX_TARGETS).flat());

check(
  sameSet(builtServices, [...targetedServices]),
  "every service built from this repo is a prefix target",
  `compose builds: ${JSON.stringify(sorted(builtServices))}\n` +
    `    targeted:       ${JSON.stringify(sorted([...targetedServices]))}\n` +
    "    A service nobody targets is never checked; a target that is not a service is stale.\n" +
    "    Fix PREFIX_TARGETS in this file, in the PR that changed docker-compose.yml."
);

for (const service of targetedServices) {
  check(
    services[service] !== undefined && services[service].envVars !== null,
    `${service}: declares an environment: block`,
    services[service] === undefined
      ? `no service named ${service} in ${COMPOSE_PATH}`
      : `${service} has no environment: block, so it can receive no key from the template at all.`
  );
}

// ── 4. Every prefix in the template is accounted for ──────────────────────────

const prefixOf = (key) => {
  const m = key.match(/^([A-Z][A-Z0-9]*)__/);
  return m ? m[1] : null;
};

const seenPrefixes = [...new Set(envKeys.map(prefixOf).filter(Boolean))];
const unknownPrefixes = seenPrefixes.filter(
  (p) => !(p in PREFIX_TARGETS) && !(p in UNCONTAINERISED_PREFIXES)
);

check(
  unknownPrefixes.length === 0,
  "every prefix in the template is classified",
  `unclassified: ${JSON.stringify(sorted(unknownPrefixes))}\n` +
    "    A prefix belongs in PREFIX_TARGETS (it names compose services) or in\n" +
    "    UNCONTAINERISED_PREFIXES (it names an app compose does not build).\n" +
    "    Until it is in one of them, nothing checks its keys."
);

// ── 5. The assertion: every in-scope key reaches a container ──────────────────

/** `key -> the services its prefix targets`, for the keys actually checked. */
const inScope = new Map();
/** `key -> reason`, printed in full at the bottom so no exemption is silent. */
const exempted = new Map();
const outOfScope = [];

for (const key of envKeys) {
  const prefix = prefixOf(key);

  if (prefix && prefix in UNCONTAINERISED_PREFIXES) {
    outOfScope.push(key);
    continue;
  }
  if (!prefix && key in ROOT_ONLY_KEYS) {
    exempted.set(key, `root-only — ${ROOT_ONLY_KEYS[key]}`);
    continue;
  }
  // Only prefixed keys, and only prefixes this gate targets. UNMAPPED_ON_PURPOSE
  // is for a key that COULD have reached a container and deliberately does not;
  // an unprefixed key belongs in ROOT_ONLY_KEYS instead. Honouring an unprefixed
  // entry here would exempt it silently while the staleness check below rejected
  // the very same entry — a branch no green run could ever reach.
  if (prefix && prefix in PREFIX_TARGETS && key in UNMAPPED_ON_PURPOSE) {
    exempted.set(key, `unmapped on purpose — ${UNMAPPED_ON_PURPOSE[key]}`);
    continue;
  }

  // An unprefixed key means "every app" per the template's own header, so it
  // has to reach the built services just as a group key does.
  inScope.set(key, prefix ? PREFIX_TARGETS[prefix] : [...targetedServices]);
}

/** Group keys reaching some targets but not all — a note, not a failure. */
const partial = [];

for (const [key, targets] of inScope) {
  const reached = targets.filter((s) => services[s]?.envVars?.has(key));

  // The remedy differs by key shape, and naming the wrong list sends the reader
  // into a second failure: an unprefixed key added to UNMAPPED_ON_PURPOSE is
  // rejected by the staleness check ("names a prefix this gate checks"), because
  // an unprefixed key is root-only by definition if it is exempt at all.
  const declareAdvice = prefixOf(key)
    ? "      * declare it — if the key is deliberately dev-only, add it to\n" +
      "        UNMAPPED_ON_PURPOSE in this file with the reason, in the same PR."
    : "      * declare it — an unprefixed key that compose reads and hands to no app\n" +
      "        belongs in ROOT_ONLY_KEYS in this file, with the reason, in the same PR.\n" +
      "        (Not UNMAPPED_ON_PURPOSE: that list is for prefixed keys only.)";

  check(
    reached.length > 0,
    `${key} → ${reached.join(", ") || "(nothing)"}`,
    `${ENV_EXAMPLE_PATH} ships ${key}, but no \`environment:\` entry in ` +
      `${targets.join(" or ")} interpolates \${${key}...}.\n` +
      "    Under `nx run <api>:dev` the loader strips the prefix and the app sees " +
      `${key.replace(/^[A-Z0-9]+__/, "")}; in a container it sees nothing. Fix one side:\n` +
      "      * map it — add the canonical name to that service's environment: block in\n" +
      `        ${COMPOSE_PATH}, e.g. \`NAME: \${${key}:-<default>}\`; or\n` +
      declareAdvice
  );

  if (reached.length > 0 && reached.length < targets.length) {
    partial.push(
      `${key} → ${reached.join(", ")} (not ${targets
        .filter((s) => !reached.includes(s))
        .join(", ")})`
    );
  }
}

// ── 6. No exemption may go stale ──────────────────────────────────────────────
//
// An ignore list is only as good as the pressure to shrink it. Both lists are
// pinned to the two files, so an entry that has been mapped since, or whose key
// has left the template, fails here instead of sitting there forever looking
// like a reason.

const shippedKeys = new Set(envKeys);

for (const key of Object.keys(UNMAPPED_ON_PURPOSE)) {
  const prefix = prefixOf(key);
  const targets = prefix
    ? (PREFIX_TARGETS[prefix] ?? [])
    : [...targetedServices];
  const reached = targets.filter((s) => services[s]?.envVars?.has(key));

  check(
    shippedKeys.has(key),
    `UNMAPPED_ON_PURPOSE[${key}] still applies to a shipped key`,
    `${key} is not in ${ENV_EXAMPLE_PATH} any more. Drop the entry — a stale exemption is one nobody will re-examine.`
  );
  check(
    reached.length === 0,
    `UNMAPPED_ON_PURPOSE[${key}] is still unmapped`,
    `${key} now reaches ${reached.join(", ")}. The exemption is obsolete: remove it so the key is checked like every other one.`
  );
  check(
    prefix !== null && prefix in PREFIX_TARGETS,
    `UNMAPPED_ON_PURPOSE[${key}] names a prefix this gate checks`,
    `prefix ${JSON.stringify(prefix)} is not in PREFIX_TARGETS, so the key was never in scope and the entry exempts nothing.`
  );
}

for (const key of Object.keys(ROOT_ONLY_KEYS)) {
  check(
    shippedKeys.has(key),
    `ROOT_ONLY_KEYS[${key}] still applies to a shipped key`,
    `${key} is not in ${ENV_EXAMPLE_PATH} any more. Drop the entry.`
  );
  // `interpolated`, not the raw file text. Matching the text would let a comment
  // that merely names the key satisfy this — measured: replacing
  // `- "${MEDARIS_POSTGRES_PORT:-5432}:5432"` with a literal port plus a
  // `# was: ${MEDARIS_POSTGRES_PORT...}` comment left the key dead on BOTH sides
  // and still printed a tick. This check is the whole reason the parser collects
  // interpolations from non-comment lines separately from `envVars`.
  check(
    interpolated.has(key),
    `ROOT_ONLY_KEYS[${key}] is read by compose`,
    `${COMPOSE_PATH} never interpolates \${${key}} outside a comment. "Root-only" means compose reads it and hands it to no app; a key neither side reads is dead and belongs deleted from ${ENV_EXAMPLE_PATH}, not exempted.`
  );
}

// ── Report ────────────────────────────────────────────────────────────────────

console.log(
  `\n  exempt by declaration (${exempted.size}) — every one carries its reason:`
);
for (const [key, reason] of [...exempted].sort()) {
  console.log(`    ${key}\n      ${reason}`);
}

console.log(
  `\n  out of scope (${outOfScope.length}) — prefixes naming apps compose does not build:`
);
for (const [prefix, reason] of Object.entries(UNCONTAINERISED_PREFIXES)) {
  const count = outOfScope.filter((k) => prefixOf(k) === prefix).length;
  console.log(`    ${prefix}__ (${count} keys) — ${reason}`);
}

if (partial.length > 0) {
  console.log(
    `\n  NOTE — group keys reaching some targets but not all (${partial.length}).` +
      "\n  Not a failure: this gate asserts that a key reaches SOMETHING. Whether each" +
      "\n  divergence below is right is MDRS-69's question, not this file's:"
  );
  for (const line of partial) console.log(`    ${line}`);
}

if (failures.length > 0) {
  console.error(
    `\n✖ env/compose parity: ${failures.length} assertion(s) failed.\n` +
      "  Since MDRS-25 the compose `environment:` block is an allowlist, so a key it\n" +
      "  does not name reaches no container — while still changing `nx run <api>:dev`.\n" +
      "  These two files must agree:\n" +
      `    ${ENV_EXAMPLE_PATH}\n` +
      `    ${COMPOSE_PATH}\n` +
      "  See docs/migration/mdrs-70-env-compose-parity.md."
  );
  process.exit(1);
}

console.log(
  `\n✔ env/compose parity: ${inScope.size} in-scope keys all reach a container; ` +
    `${exempted.size} exempt by declaration, ${outOfScope.length} out of scope.`
);
