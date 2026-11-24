#!/usr/bin/env node
// The person who registers in realm.auth.register's walk is a real Keycloak user, and this is how a binding makes
// the walk's starting place, reads the mail it sends, and takes everything away. A `run` of a scenario's `setup`,
// `teardown` and `events`, and of the `effects`, in binding.yaml.
//
//   node walk-user.mjs prepare <username> <email>   delete every earlier copy of the person (Keycloak user, tedrisat row,
//                                                   mail), then write the walk's password in graphs/.local/register-walk.env
//   node walk-user.mjs link <email>                 wait for the verification mail (read with helpers/mail.mjs), take the
//                                                   address of its button and add it to the walk file as WALK_LINK
//   node walk-user.mjs state <username>             one line for an `effects` check: `user exists emailVerified=false gender=FEMALE
//                                                   privacyNoticeRead=yes`, or `user absent`
//   node walk-user.mjs remove <username> <email>    the way back: the same removal as `prepare`, and the walk file deleted
//
// What it reads, and never prints or takes on a command line: the local Keycloak admin's user and password
// (E2E_KEYCLOAK_ADMIN_USER and E2E_KEYCLOAK_ADMIN_PASSWORD in graphs/.local/accounts.env, or the same names in the
// environment), and the walk's own password, which `prepare` makes at random and writes, mode 600, in the git-ignored
// graphs/.local/register-walk.env (a binding reads it as the data source `walk`, a dotenv, so a replay masks it and the link).
// The password is never in a committed file and never in argv. Local only: it refuses a Keycloak that is not on localhost.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  env as accounts,
  Fail,
  LOCAL,
  parseEnvFile,
  run,
} from "../../../bindings/helpers/lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const HELPERS = resolve(here, "../../../bindings/helpers");
const WALK = resolve(LOCAL, "register-walk.env");

const secrets = () => ({ ...accounts(), ...process.env });

function realm() {
  const issuer = new URL(secrets().E2E_KEYCLOAK_ISSUER);
  if (!/^localhost(:\d+)?$/.test(issuer.host))
    throw new Fail("walk-user talks to a local Keycloak only");
  return {
    origin: issuer.origin,
    name: issuer.pathname.split("/").filter(Boolean).pop(),
  };
}

async function adminToken() {
  const e = secrets();
  const user = e.E2E_KEYCLOAK_ADMIN_USER;
  const password = e.E2E_KEYCLOAK_ADMIN_PASSWORD;
  if (!user || !password)
    throw new Fail(
      "E2E_KEYCLOAK_ADMIN_USER and E2E_KEYCLOAK_ADMIN_PASSWORD are in neither graphs/.local/accounts.env nor the environment"
    );
  const res = await fetch(
    `${realm().origin}/realms/master/protocol/openid-connect/token`,
    {
      method: "POST",
      body: new URLSearchParams({
        grant_type: "password",
        client_id: "admin-cli",
        username: user,
        password,
      }),
      signal: AbortSignal.timeout(30_000),
    }
  );
  if (!res.ok)
    throw new Fail(`Keycloak's admin sign-in was refused: ${res.status}`);
  return (await res.json()).access_token;
}

async function admin(token, method, path) {
  const res = await fetch(
    `${realm().origin}/admin/realms/${realm().name}${path}`,
    {
      method,
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30_000),
    }
  );
  if (!res.ok && !(method === "DELETE" && res.status === 404))
    throw new Fail(
      `Keycloak's admin API answered ${res.status} to ${method} ${path.split("?")[0]}`
    );
  return res.status === 204 ? null : method === "DELETE" ? null : res.json();
}

/** Every user with this user name or this address (exact matches). */
async function find(token, username, email) {
  const found = new Map();
  for (const q of [
    `username=${encodeURIComponent(username)}`,
    `email=${encodeURIComponent(email ?? "")}`,
  ]) {
    if (q.endsWith("=")) continue;
    for (const u of await admin(token, "GET", `/users?${q}&exact=true`))
      found.set(u.id, u);
  }
  return [...found.values()];
}

const helper = (name, ...args) =>
  execFileSync(process.execPath, [resolve(HELPERS, name), ...args], {
    cwd: HELPERS,
    encoding: "utf8",
    timeout: 60_000,
  });

/** The walk's person taken away: Keycloak user, tedrisat row (made by the first sign-in), mail. */
async function removeAll(username, email) {
  // never a person of the stack's seed: every one of them has an e2e- user name and an address of accounts.env
  const seeded = new Set(
    Object.entries(accounts())
      .filter(([k]) => /^E2E_.*_EMAIL$/.test(k))
      .map(([, v]) => v.toLowerCase())
  );
  if (/^e2e-/i.test(username) || seeded.has(email.toLowerCase()))
    throw new Fail(
      `refusing to remove ${username} / ${email}: it is an account of the stack's seed`,
      2
    );
  const token = await adminToken();
  const users = await find(token, username, email);
  for (const u of users) await admin(token, "DELETE", `/users/${u.id}`);
  // tedrisat keeps a `users` row and a `user_profiles` row, made when the person first calls the API (the home page's
  // first read); no table has a foreign key to them and no other table holds the person's id after a walk like this one
  const mine = `lower('${email.replace(/'/g, "''")}')`;
  helper(
    "sql.mjs",
    `delete from user_profiles where user_id in (select id from users where lower(email) = ${mine}); delete from users where lower(email) = ${mine}`
  );
  helper("mail.mjs", "clear", `to:${email}`);
  rmSync(WALK, { force: true });
  return users.length;
}

run("walk-user", async () => {
  const [verb, ...args] = process.argv.slice(2);
  if (verb === "prepare") {
    const [username, email] = args;
    if (!username || !email)
      throw new Fail("usage: walk-user.mjs prepare <username> <email>", 2);
    const n = await removeAll(username, email);
    // a password that meets the realm's policy (length 10, not the e-mail address or the user name)
    const password = `Kk-${randomBytes(9).toString("base64url")}`;
    writeFileSync(WALK, `WALK_PASSWORD=${password}\n`, { mode: 0o600 });
    chmodSync(WALK, 0o600);
    console.log(`prepared (earlier copies removed: ${n})`);
  } else if (verb === "link") {
    const [email] = args;
    if (!email) throw new Fail("usage: walk-user.mjs link <email>", 2);
    if (!existsSync(WALK)) throw new Fail("no walk file: run `prepare` first");
    const out = helper(
      "mail.mjs",
      "search",
      `to:${email}`,
      "--text",
      "--wait",
      "30"
    );
    // the newest mail comes first; the verification mail's button points at the realm's action-token address
    for (const line of out.trim().split("\n")) {
      const mail = JSON.parse(line);
      const link = /https?:\/\/[^\s"<>]*action-token\?key=[^\s"<>]+/.exec(
        mail.text ?? ""
      )?.[0];
      if (!link) continue;
      const old = parseEnvFile(WALK);
      writeFileSync(
        WALK,
        `WALK_PASSWORD=${old.WALK_PASSWORD}\nWALK_LINK=${link}\n`,
        { mode: 0o600 }
      );
      console.log(`link ready (mail: ${mail.subject})`);
      return;
    }
    throw new Fail(`no mail to ${email} carries an action-token link`);
  } else if (verb === "state") {
    const [username] = args;
    if (!username) throw new Fail("usage: walk-user.mjs state <username>", 2);
    const token = await adminToken();
    const [u] = await find(token, username, undefined);
    if (!u) return console.log("user absent");
    const a = u.attributes ?? {};
    console.log(
      `user exists emailVerified=${u.emailVerified} gender=${a.gender?.[0] ?? "none"} privacyNoticeRead=${a.privacyNoticeRead?.[0] ?? "none"}`
    );
  } else if (verb === "remove") {
    const [username, email] = args;
    if (!username || !email)
      throw new Fail("usage: walk-user.mjs remove <username> <email>", 2);
    console.log(`removed ${await removeAll(username, email)}`);
  } else {
    throw new Fail("usage: walk-user.mjs prepare|link|state|remove ...", 2);
  }
});
