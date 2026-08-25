// The workspace's environment, in one file and one implementation.
//
// MDRS-25 introduced these rules and MDRS-66 made this the only place they
// exist. Before MDRS-66 the walk-up below was copied into all four
// `next.config.js` files and both `apps/<api>/src/load-env.ts` files, and the
// two shapes had already drifted: the Next copies threw when no marker was
// found, the Nest copies returned null and skipped in silence.
//
// There is exactly one `.env`, at the repository root. A prefix says which app a
// key belongs to, and is stripped when that app is handed the key, so
// `NIZAM__NEXTAUTH_URL` reaches apps/nizam as the plain `NEXTAUTH_URL` that
// NextAuth actually reads:
//
//   KEY=value          every app
//   WEB__KEY=value     landing, nazir, nizam, tedris   (overrides shared)
//   API__KEY=value     tedrisat, teskilat              (overrides shared)
//   NIZAM__KEY=value   that one app                    (overrides both)
//
// `loadRootEnv(app)` applies that to process.env before anything reads it, so
// nothing downstream needs to know the scheme exists: t3-env validates, Nest's
// ConfigService resolves, and Next inlines NEXT_PUBLIC_* into the client bundle
// exactly as they would from a per-app file. (Measured, not assumed: with no
// apps/nizam/.env present at all, a `WEB__NEXT_PUBLIC_*` value from the root
// file lands in .next/static — see the MDRS-25 commit message.)
//
// WHY .cjs
// next.config.js is ESM and the Nest apps compile to CommonJS. A .cjs module is
// the one shape both can consume without a second copy of these rules, and it
// needs no build step — `next.config.js` is evaluated before any TypeScript in
// this repo has been compiled, so a package that only existed as `dist/` could
// not be the single implementation. `src/root-env.d.ts` types it for the two
// TypeScript call sites.
//
// THE TWO NOT-FOUND CASES ARE NOT THE SAME CASE (MDRS-66)
//
//   1. No `pnpm-workspace.yaml` anywhere up the tree -> THROW.
//      This says the code is not running inside a checkout of this workspace,
//      which no supported deployment produces. The four Next apps and the two
//      Nest apps now share this single behaviour: the loud one. Silence here was
//      the bug MDRS-66 exists to close — it let an app boot fully configured by
//      whatever happened to be in the ambient environment, with no signal that
//      the file it was supposed to read had never been looked for.
//
//   2. The marker was found but there is no `.env` beside it -> return empty.
//      This is production. In a container every value arrives through the real
//      environment and there is no file to read, so an absent file is a normal
//      state and not an error. The two Nest runtime images therefore carry
//      `pnpm-workspace.yaml` and `libs/env` (see apps/<api>/Dockerfile) — that
//      is what keeps them in case 2 rather than case 1.
//
// Values already present in process.env always win in either case: a deployed
// secret must never be overridden by a file that happens to be in the image.

const { existsSync, readFileSync } = require("node:fs");
const { dirname, join, resolve } = require("node:path");

const WEB_APPS = ["landing", "nazir", "nizam", "tedris"];
const API_APPS = ["tedrisat", "teskilat"];
const APPS = [...WEB_APPS, ...API_APPS];

const GROUPS = { WEB: WEB_APPS, API: API_APPS };

// Read from the root file by docker-compose under these exact names, so they
// carry no prefix and belong to no app.
const ROOT_ONLY = new Set([
  "TEDRISAT_PORT",
  "TESKILAT_PORT",
  "MEDARIS_POSTGRES_USER",
  "MEDARIS_POSTGRES_PASSWORD",
  "MEDARIS_POSTGRES_DB",
  "MEDARIS_POSTGRES_PORT",
]);

/** The one marker. Chosen in MDRS-25, asserted in one place since MDRS-66. */
const MARKER = "pnpm-workspace.yaml";

/**
 * Walk up for the workspace root. `pnpm-workspace.yaml` is the marker rather
 * than package.json, which every app also has, or .git, which is a file rather
 * than a directory inside a worktree.
 *
 * Reaching the filesystem root without finding it throws — case 1 in the header.
 * This is the only expression of that decision in the repository; every call
 * site inherits it by importing this function rather than re-deriving it.
 */
function findRepoRoot(from = __dirname) {
  let dir = resolve(from);
  for (;;) {
    if (existsSync(join(dir, MARKER))) return dir;
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(
        `[@medaris/env] no ${MARKER} found walking up from ${resolve(from)}. ` +
          "The single root .env cannot be located, so this process would " +
          "start with whatever happens to be in the ambient environment. " +
          "Refusing that silently is the MDRS-66 decision: if this is a " +
          "container image, it must carry pnpm-workspace.yaml and libs/env " +
          "the way apps/tedrisat/Dockerfile does."
      );
    }
    dir = parent;
  }
}

/** Parse KEY=VALUE lines, dropping comments and blank lines. */
function parseEnv(text) {
  const entries = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;

    let value = line.slice(eq + 1);
    // dotenv drops an unquoted trailing comment; match that, or the same line
    // would mean one thing here and another to every other reader of the file.
    if (!/^\s*["']/.test(value)) value = value.replace(/\s+#.*$/, "");

    entries.push({ key: line.slice(0, eq).trim(), value: value.trim() });
  }
  return entries;
}

/** Split `NIZAM__NEXTAUTH_URL` into its targets and its canonical key name. */
function classify(key) {
  const split = key.indexOf("__");
  if (split === -1) {
    return ROOT_ONLY.has(key)
      ? { scope: "root", targets: [], key }
      : { scope: "shared", targets: APPS, key };
  }

  const prefix = key.slice(0, split);
  const canonical = key.slice(split + 2);

  if (canonical === "") {
    throw new Error(`"${key}" has a prefix but no key after it.`);
  }
  if (GROUPS[prefix]) {
    return { scope: "group", targets: GROUPS[prefix], key: canonical };
  }

  const app = prefix.toLowerCase();
  if (APPS.includes(app)) {
    return { scope: "app", targets: [app], key: canonical };
  }

  throw new Error(
    `"${key}" names "${prefix}", which is not an app or a group. Expected one of: ` +
      `${[...Object.keys(GROUPS), ...APPS.map((a) => a.toUpperCase())].join(", ")}.`
  );
}

/**
 * Reduce the root file to what one app should see. Precedence is the point:
 * shared, then group, then app, so the narrowest declaration wins wherever it
 * sits in the file.
 */
function resolveFor(app, entries) {
  const rank = { shared: 0, group: 1, app: 2 };
  const values = new Map();
  const winner = new Map();

  for (const { key, value } of entries) {
    const { scope, targets, key: canonical } = classify(key);
    if (!targets.includes(app)) continue;
    const seen = winner.get(canonical);
    if (seen !== undefined && seen > rank[scope]) continue;
    winner.set(canonical, rank[scope]);
    values.set(canonical, value);
  }

  return values;
}

/**
 * Apply the root file to process.env for one app. Returns the keys it set, so a
 * caller can log or assert on them; an empty result means the file was absent
 * (or set nothing new), which is the normal production shape — case 2 in the
 * header. A missing *workspace* is case 1 and throws out of findRepoRoot.
 */
function loadRootEnv(app, options = {}) {
  if (!APPS.includes(app)) {
    throw new Error(
      `loadRootEnv: unknown app "${app}". Expected one of: ${APPS.join(", ")}.`
    );
  }

  // No `if (!root)` guard: findRepoRoot throws rather than returning null, so
  // the not-found case is decided there and identically for all six call sites.
  const root = options.root ?? findRepoRoot();

  const path = join(root, options.file ?? ".env");
  if (!existsSync(path)) return new Map();

  // A leftover per-app file from before MDRS-25 is the one thing that can make
  // this scheme lie. Next still reads apps/<app>/.env on its own, and dotenv
  // does not override an existing process.env entry, so the stale file wins for
  // any key the root file does not set — silently, and only for that one app.
  const stale = join(root, "apps", app, ".env");
  if (existsSync(stale)) {
    console.warn(
      `[env] apps/${app}/.env still exists. Since MDRS-25 the only environment ` +
        `file is ${path}; delete the stale one, it can only shadow keys.`
    );
  }

  const values = resolveFor(app, parseEnv(readFileSync(path, "utf8")));
  const applied = new Map();
  for (const [key, value] of values) {
    if (process.env[key] !== undefined) continue;
    process.env[key] = value;
    applied.set(key, value);
  }
  return applied;
}

module.exports = {
  MARKER,
  APPS,
  API_APPS,
  WEB_APPS,
  ROOT_ONLY,
  classify,
  findRepoRoot,
  loadRootEnv,
  parseEnv,
  resolveFor,
};
