#!/usr/bin/env node
/**
 * tools/keycloak/backfill-gender.mjs — step 2 of the gender production order
 * (#317, config/keycloak/RUNBOOK.md, "Copy the genders tedrisat already has").
 *
 * Keycloak becomes the one source of a person's gender (#317). People who
 * chose one in tedris before that have it in tedrisat's `user_profiles` only;
 * this copies it into their Keycloak account, so the realm does not ask them
 * again once the attribute is required.
 *
 * Reads   tedrisat's `user_profiles` (`user_id` is the Keycloak `sub`), the
 *         rows whose `gender` is FEMALE or MALE.
 * Writes  the account's `gender` attribute, through the admin REST API, and
 *         only where the account has none. An account that has one keeps it,
 *         whatever tedrisat says: Keycloak is the source from now on.
 * Modes   a dry run by default (reads both sides, writes nothing); `--apply`
 *         writes.
 * Prints  counts, never an id, a name, a URL with credentials, a password or
 *         a token.
 *
 * Usage:
 *   node tools/keycloak/backfill-gender.mjs --env-file <file> [--env-file <file>] [--apply]
 *
 * Everything else comes from the env files, which are read here and never
 * loaded into the process environment; nothing secret is ever an argument:
 *
 *   TEDRISAT_DATABASE_URL  postgres://<user>:<password>@<host>:<port>/<db>[?sslmode=require]
 *                          (a read is enough: a role with SELECT on user_profiles)
 *   KC_URL                 default http://localhost:8080
 *   KC_REALM               default medaris
 *   KC_ADMIN_USER          a master-realm admin (default admin on localhost only)
 *   KC_ADMIN_PASSWORD      its password (default admin on localhost only)
 *   ALLOW_REMOTE=1         required for a KC_URL that is not http://localhost
 *   ALLOW_INSECURE_HTTP=1  required for a remote http:// KC_URL
 *
 * `config/keycloak/env/prod.env` (RUNBOOK.md, "Provision") already holds the
 * KC_* values; the database URL goes in a second file of its own.
 *
 * The write is Keycloak's own read-modify-write: GET the user, set
 * `attributes.gender` in what came back, PUT it to the same path. The PUT
 * replaces the attribute map, so every other attribute travels back as it
 * was read. The realm must let an administrator write `gender`: the
 * temporary "Unmanaged attributes: Only administrators can edit" of #317's
 * step 2.1, or the profile with the `gender` attribute in place.
 *
 * Exit code: 0 when the run went through (a user Keycloak refused with 400 is
 * counted, not fatal); 1 on a bad argument or setting, a database error, or
 * any other answer from Keycloak (401, 403, 5xx), which stops the run: a
 * refusal must never read as "no such user".
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";

export const GENDERS = ["FEMALE", "MALE"];

const PREFIX = "backfill-gender";
const USAGE =
  "usage: node tools/keycloak/backfill-gender.mjs --env-file <file> [--env-file <file>] [--apply]";

/** A master-realm admin token lives 60 seconds; renewed after 45, as config/keycloak/scripts do. */
const TOKEN_RENEW_MS = 45_000;
/** Each call to Keycloak may take this long. */
const HTTP_TIMEOUT_MS = 10_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REALM = /^[a-z0-9][a-z0-9-]*$/;

/** A setting or an argument the run cannot start with; its message names no secret. */
export class UsageError extends Error {}

/** Keycloak answered something that must stop the run; the message names no id. */
export class KeycloakError extends Error {}

/**
 * `--env-file <file>` (or `--env-file=<file>`, repeatable) and `--apply`.
 * Nothing else: a stray argument is refused rather than guessed at, so a URL
 * or a password typed on the command line never reaches anything.
 */
export function parseArgs(argv) {
  const envFiles = [];
  let apply = false;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--apply") {
      apply = true;
    } else if (arg === "--env-file") {
      const file = argv[++index];
      if (!file || file.startsWith("--")) {
        throw new UsageError(`--env-file needs a file. ${USAGE}`);
      }
      envFiles.push(file);
    } else if (arg.startsWith("--env-file=")) {
      envFiles.push(arg.slice("--env-file=".length));
    } else {
      throw new UsageError(`unknown argument #${index + 1}. ${USAGE}`);
    }
  }
  if (envFiles.length === 0) throw new UsageError(USAGE);
  return { envFiles, apply };
}

/** The env files merged in order (a later file wins). The process environment is not read. */
export function readEnvFiles(files, readFile) {
  const env = {};
  for (const file of files) {
    let text;
    try {
      text = readFile(file);
    } catch {
      throw new UsageError(`cannot read the env file ${file}`);
    }
    Object.assign(env, parseEnv(text));
  }
  return env;
}

/**
 * The run's settings, with the same refusals as config/keycloak/scripts/lib/core.sh:
 * a Keycloak that is not http://localhost needs ALLOW_REMOTE=1 and explicit
 * admin credentials, and a remote http:// one also ALLOW_INSECURE_HTTP=1.
 */
export function settingsFrom(env) {
  const databaseUrl = env.TEDRISAT_DATABASE_URL ?? "";
  if (!/^postgres(ql)?:\/\//.test(databaseUrl)) {
    throw new UsageError(
      "TEDRISAT_DATABASE_URL is missing or not a postgres:// URL"
    );
  }

  const kcUrl = (env.KC_URL || "http://localhost:8080").replace(/\/+$/, "");
  let target;
  try {
    target = new URL(kcUrl);
  } catch {
    throw new UsageError("KC_URL is not a URL");
  }
  if (target.username || target.password) {
    throw new UsageError("KC_URL must not carry credentials");
  }
  const realm = env.KC_REALM || "medaris";
  if (!REALM.test(realm)) {
    throw new UsageError(
      `KC_REALM '${realm}' is not a realm name (lower-case letters, digits, -)`
    );
  }

  const isLocal =
    target.protocol === "http:" &&
    (target.hostname === "localhost" || target.hostname === "127.0.0.1");
  if (!isLocal) {
    if (env.ALLOW_REMOTE !== "1") {
      throw new UsageError(
        `${target.origin} is not localhost. Set ALLOW_REMOTE=1 to confirm you mean to change that realm.`
      );
    }
    if (!env.KC_ADMIN_USER || !env.KC_ADMIN_PASSWORD) {
      throw new UsageError(
        "KC_ADMIN_USER and KC_ADMIN_PASSWORD have no default for a remote Keycloak."
      );
    }
    if (target.protocol === "http:" && env.ALLOW_INSECURE_HTTP !== "1") {
      throw new UsageError(
        `${target.origin} would send the admin password in cleartext. Use https://, or set ALLOW_INSECURE_HTTP=1 if this is a trusted local network.`
      );
    }
  }

  return {
    databaseUrl,
    kcUrl,
    realm,
    adminUser: env.KC_ADMIN_USER || "admin",
    adminPassword: env.KC_ADMIN_PASSWORD || "admin",
  };
}

/**
 * The admin REST API as this run needs it: one user read, one user write.
 * The password goes in a request body and the token in a header; neither is
 * ever part of a URL, an argument or a message.
 */
export function keycloakAdmin({
  kcUrl,
  realm,
  adminUser,
  adminPassword,
  fetch,
  now,
}) {
  let token = null;
  let tokenAt = 0;

  const call = (url, init) =>
    fetch(url, { ...init, signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });

  async function bearer() {
    if (token && now() - tokenAt < TOKEN_RENEW_MS) return token;
    const response = await call(
      `${kcUrl}/realms/master/protocol/openid-connect/token`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "password",
          client_id: "admin-cli",
          username: adminUser,
          password: adminPassword,
        }).toString(),
      }
    );
    const body = response.ok ? await response.json() : null;
    if (typeof body?.access_token !== "string") {
      throw new KeycloakError(
        `could not authenticate to ${kcUrl} as the admin (${response.status})`
      );
    }
    token = body.access_token;
    tokenAt = now();
    return token;
  }

  const userUrl = (id) =>
    `${kcUrl}/admin/realms/${realm}/users/${encodeURIComponent(id)}`;

  return {
    /** The user's representation, or `null` when Keycloak has no such user. */
    async user(id) {
      const response = await call(userUrl(id), {
        headers: { authorization: `Bearer ${await bearer()}` },
      });
      if (response.status === 404) return null;
      if (!response.ok) {
        throw new KeycloakError(`GET user answered ${response.status}`);
      }
      return response.json();
    },
    /** `updated`, `refused` (400: the profile lacks something an admin must fill), or `missing`. */
    async update(id, representation) {
      const response = await call(userUrl(id), {
        method: "PUT",
        headers: {
          authorization: `Bearer ${await bearer()}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(representation),
      });
      if (response.ok) return "updated";
      if (response.status === 400) return "refused";
      if (response.status === 404) return "missing";
      throw new KeycloakError(`PUT user answered ${response.status}`);
    },
  };
}

/** The gender an account already has: a non-empty first value of the attribute. */
const genderOf = (representation) => {
  const values = representation?.attributes?.gender;
  const first = Array.isArray(values) ? values[0] : values;
  return typeof first === "string" && first.trim() ? first.trim() : null;
};

export const emptyCounts = () => ({
  profiles: 0,
  skipped: 0,
  notInKeycloak: 0,
  alreadySet: 0,
  alreadySetOther: 0,
  toWrite: 0,
  written: 0,
  refused: 0,
});

/**
 * The run itself, on whatever `profiles` and `keycloak` it is handed. Writes
 * only with `apply`, only the `gender` attribute and only where it is empty;
 * every other attribute is sent back as Keycloak gave it. `counts` is filled
 * as it goes, so a run that stops still says how far it got.
 */
export async function backfill({
  profiles,
  keycloak,
  apply,
  counts = emptyCounts(),
}) {
  for (const row of profiles) {
    counts.profiles++;
    // `user_profiles.user_id` is a uuid and the query keeps the two genders
    // only; a row that is neither is not ours to copy.
    if (!UUID.test(row.userId) || !GENDERS.includes(row.gender)) {
      counts.skipped++;
      continue;
    }
    const user = await keycloak.user(row.userId);
    if (!user) {
      counts.notInKeycloak++;
      continue;
    }
    const existing = genderOf(user);
    if (existing) {
      counts.alreadySet++;
      if (existing !== row.gender) counts.alreadySetOther++;
      continue;
    }
    counts.toWrite++;
    if (!apply) continue;

    const outcome = await keycloak.update(row.userId, {
      ...user,
      attributes: { ...(user.attributes ?? {}), gender: [row.gender] },
    });
    if (outcome === "updated") counts.written++;
    else if (outcome === "refused") counts.refused++;
    else counts.notInKeycloak++;
  }
  return counts;
}

/** The lines the run prints: counts and nothing else. */
export function report(counts, apply) {
  const lines = [
    apply
      ? `${PREFIX}: applied`
      : `${PREFIX}: dry run, nothing written (--apply writes)`,
    `  tedrisat profiles with a gender:     ${counts.profiles}`,
    `  not in Keycloak:                     ${counts.notInKeycloak}`,
    `  gender already set in Keycloak:      ${counts.alreadySet}`,
    `    of which another than tedrisat's:  ${counts.alreadySetOther}`,
  ];
  if (counts.skipped) {
    lines.push(`  skipped (not a uuid or a gender):    ${counts.skipped}`);
  }
  if (apply) {
    lines.push(
      `  written:                             ${counts.written}`,
      `  refused by Keycloak (400):           ${counts.refused}`
    );
  } else {
    lines.push(`  would write:                         ${counts.toWrite}`);
  }
  return lines;
}

/**
 * tedrisat's rows with a gender. `pg` is tedrisat's own dependency, reached
 * through its package so this tool adds no workspace package (and no line to
 * every Dockerfile).
 */
export async function readProfilesFromDatabase(databaseUrl) {
  const require = createRequire(
    new URL("../../apps/tedrisat/package.json", import.meta.url)
  );
  const { Client } = require("pg");
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await client.query(
      `select user_id::text as user_id, gender
         from user_profiles
        where gender in ('FEMALE', 'MALE')
        order by user_id`
    );
    return result.rows.map((row) => ({
      userId: row.user_id,
      gender: row.gender,
    }));
  } finally {
    await client.end();
  }
}

/** The whole run, with every outside thing injectable for the spec. Returns the exit code. */
export async function run(
  argv,
  {
    readFile = (file) => readFileSync(file, "utf8"),
    readProfiles = readProfilesFromDatabase,
    fetch = globalThis.fetch,
    now = Date.now,
    out = (line) => process.stdout.write(`${line}\n`),
    err = (line) => process.stderr.write(`${line}\n`),
  } = {}
) {
  let settings;
  let apply;
  try {
    const args = parseArgs(argv);
    apply = args.apply;
    settings = settingsFrom(readEnvFiles(args.envFiles, readFile));
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    err(`${PREFIX}: ${error.message}`);
    return 1;
  }

  let profiles;
  try {
    profiles = await readProfiles(settings.databaseUrl);
  } catch (error) {
    // A driver message can quote the connection; only its code leaves.
    err(
      `${PREFIX}: could not read user_profiles (${error?.code ?? error?.name ?? "error"})`
    );
    return 1;
  }

  const keycloak = keycloakAdmin({ ...settings, fetch, now });
  const counts = emptyCounts();
  try {
    await backfill({ profiles, keycloak, apply, counts });
    for (const line of report(counts, apply)) out(line);
    return 0;
  } catch (error) {
    // How far it got, then why it stopped: a rerun picks up where this one
    // ended, since a written account now has its gender.
    for (const line of report(counts, apply)) out(line);
    err(
      `${PREFIX}: stopped: ${
        error instanceof KeycloakError
          ? error.message
          : `Keycloak could not be reached (${error?.name ?? "error"})`
      }`
    );
    return 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = await run(process.argv.slice(2));
}
