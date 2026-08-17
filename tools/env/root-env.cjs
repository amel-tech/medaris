// The workspace's environment, in one file and one implementation (MDRS-25).
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
// the one shape both can consume without a second copy of these rules, and a
// second copy is precisely the failure this issue exists to end.
//
// PRODUCTION HAS NO FILE
// In a container every value arrives through the real environment and there is
// no .env to read. A missing file is therefore a normal state, not an error, and
// values already present in process.env always win: a deployed secret must never
// be overridden by a file that happens to be sitting in the image.

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

/**
 * Walk up for the workspace root. `pnpm-workspace.yaml` is the marker rather
 * than package.json, which every app also has, or .git, which is a file rather
 * than a directory inside a worktree.
 */
function findRepoRoot(from = __dirname) {
  let dir = resolve(from);
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Parse KEY=VALUE lines, dropping comments and blank lines.
 *
 * The rules below are Docker Compose's, measured against `docker compose config`
 * rather than taken from documentation, because compose reads this same file for
 * the `${...}` interpolation in docker-compose.yml. It is the one reader whose
 * behaviour cannot be changed here, so any disagreement means one file meaning
 * two different things — which is what MDRS-25 exists to prevent.
 *
 *   KEY="quoted"        -> quoted      a matched quote pair is removed
 *   KEY='single'        -> single      single quotes too
 *   KEY="q" # note      -> q           anything after the closing quote is dropped
 *   KEY=unq # note      -> unq         a comment needs whitespace before the #
 *   KEY=a#b             -> a#b         so this is a value, not a comment
 *   KEY="esc\"inside"   -> esc"inside  \" does not close the value
 *   KEY="line1\nline2"  -> line1\nline2  literal, NOT a newline
 *
 * That last row is the one to leave alone. dotenv expands `\n` inside double
 * quotes and compose does not; expanding it here would rebuild the divergence
 * for anyone passing a PEM through API__DB_CA_CERT. dotenv also truncates
 * unquoted values at the first `#` whatever precedes it, which is why this is
 * documented as compose parity and not dotenv parity.
 */
function parseEnv(text) {
  const entries = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;

    const rest = line.slice(eq + 1).trim();
    const quote = rest[0];
    let value;

    if (quote === '"' || quote === "'") {
      // Walk to the closing quote so a `\"` inside the value does not end it,
      // and so a trailing comment after it is discarded rather than kept.
      let i = 1;
      let body = "";
      for (; i < rest.length; i++) {
        if (rest[i] === "\\" && rest[i + 1] === quote) {
          body += quote;
          i++;
        } else if (rest[i] === quote) {
          break;
        } else {
          body += rest[i];
        }
      }
      // Unterminated: treat the whole remainder as the value rather than
      // silently truncating at end-of-line.
      value = i === rest.length ? rest : body;
    } else {
      value = rest.replace(/\s+#.*$/, "").trim();
    }

    entries.push({ key: line.slice(0, eq).trim(), value });
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
 * caller can log or assert on them; an empty result means the file was absent,
 * which is the normal production shape.
 */
function loadRootEnv(app, options = {}) {
  if (!APPS.includes(app)) {
    throw new Error(
      `loadRootEnv: unknown app "${app}". Expected one of: ${APPS.join(", ")}.`
    );
  }

  const root = options.root ?? findRepoRoot();
  if (!root) return new Map();

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
