// The Keycloak side of realm.auth.signInFailures's walks: what the local stack's seed does not make, made and unmade through
// Keycloak's admin REST API (realm medaris). It is this flow's own helper; graphs/bindings/helpers/ is not touched.
//
//   node ../realm/auth/signInFailures/kc.mjs lock <ACCOUNT>     the account's lock: wrong passwords through the real login form
//                                                               until Keycloak's brute-force detector says "disabled"
//   node ../realm/auth/signInFailures/kc.mjs unlock <ACCOUNT>   the way back: clears the account's failures (a lock that is not
//                                                               there is not a failure)
//   node ../realm/auth/signInFailures/kc.mjs make-disabled      a throwaway user that is switched off, with a random password
//                                                               written to graphs/.local/sign-in-failures.env (git-ignored,
//                                                               mode 600) for the binding's `data`, never to argv or stdout
//   node ../realm/auth/signInFailures/kc.mjs drop-disabled      deletes that user and the file
//   node ../realm/auth/signInFailures/kc.mjs none               does nothing and says so (a scenario that needs no preparation)
//
// ACCOUNT is a role key of graphs/.local/accounts.env or the name a binding gives it (applicantB). The walk locks only
// applicantB, the one spare account the brief allows; the admin's name and password come from the same file
// (E2E_KEYCLOAK_ADMIN_USER, E2E_KEYCLOAK_ADMIN_PASSWORD) and are read here, never printed. The binding runs this with
// `graphs/bindings/` as its working directory, with no shell and no stdin; it prints one short line on success and exits non-zero
// with one line on stderr otherwise.
import { createHash, randomBytes } from "node:crypto";
import { chmodSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  accountKey,
  env,
  Fail,
  LOCAL,
  run,
} from "../../../bindings/helpers/lib.mjs";

const KC = (process.env.KEYCLOAK_URL ?? "http://localhost:8080").replace(
  /\/$/,
  ""
);
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(KC))
  throw new Fail(`kc.mjs only talks to a local Keycloak, not ${KC}`, 2);
const REALM = "medaris";
const THROWAWAY = "e2e-devre-disi";
const OUT = resolve(LOCAL, "sign-in-failures.env");
// tedris-local's registered address; the login form is opened through its authorization endpoint and never followed
const REDIRECT = "http://localhost:4000/api/auth/callback/keycloak";
const timeout = () => AbortSignal.timeout(30_000);

const need = (k) => {
  if (!env()[k]) throw new Fail(`graphs/.local/accounts.env has no ${k}`);
  return env()[k];
};

async function adminToken() {
  const res = await fetch(`${KC}/realms/master/protocol/openid-connect/token`, {
    method: "POST",
    signal: timeout(),
    body: new URLSearchParams({
      grant_type: "password",
      client_id: "admin-cli",
      username: need("E2E_KEYCLOAK_ADMIN_USER"),
      password: need("E2E_KEYCLOAK_ADMIN_PASSWORD"),
    }),
  });
  if (!res.ok)
    throw new Fail(`the Keycloak admin sign-in answered ${res.status}`);
  return (await res.json()).access_token;
}

async function admin(method, path, body) {
  const res = await fetch(`${KC}/admin/realms/${REALM}${path}`, {
    method,
    signal: timeout(),
    headers: {
      authorization: `Bearer ${await adminToken()}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  return { status: res.status, body: json };
}

const must = async (method, path, body) => {
  const r = await admin(method, path, body);
  if (r.status < 200 || r.status >= 300)
    throw new Fail(`${method} ${path} answered ${r.status}`);
  return r;
};

async function userOf(name) {
  const key = accountKey(name);
  const address = need(`E2E_${key}_EMAIL`);
  const found = (
    await must("GET", `/users?exact=true&email=${encodeURIComponent(address)}`)
  ).body;
  if (!found?.[0]) throw new Fail(`${key}: no such user in realm ${REALM}`);
  return { id: found[0].id, key, address };
}

// one wrong password through the real login form: the authorization endpoint, then a POST of the form it draws (the theme puts
// where it posts in window.kcContext)
async function wrongPassword(address) {
  const verifier = randomBytes(32).toString("base64url");
  const url = new URL(`${KC}/realms/${REALM}/protocol/openid-connect/auth`);
  for (const [k, v] of Object.entries({
    client_id: need("E2E_KEYCLOAK_CLIENT_ID"),
    redirect_uri: REDIRECT,
    response_type: "code",
    scope: "openid",
    state: "sif",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  }))
    url.searchParams.set(k, v);
  const jar = new Map();
  const remember = (res) => {
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      jar.set(
        pair.slice(0, pair.indexOf("=")),
        pair.slice(pair.indexOf("=") + 1)
      );
    }
    return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  };
  const page = await fetch(url, { redirect: "manual", signal: timeout() });
  const cookie = remember(page);
  const action = /"loginAction"\s*:\s*"([^"]+)"/.exec(await page.text())?.[1];
  if (!action)
    throw new Fail(
      "the sign-in page has no loginAction: is the Medaris theme in place?"
    );
  await fetch(JSON.parse(`"${action}"`), {
    method: "POST",
    redirect: "manual",
    signal: timeout(),
    headers: { "content-type": "application/x-www-form-urlencoded", cookie },
    body: new URLSearchParams({
      username: address,
      password: `not-${randomBytes(6).toString("hex")}`,
      credentialId: "",
    }),
  });
}

const commands = {
  async lock(name) {
    const u = await userOf(name);
    for (let n = 1; n <= 12; n++) {
      await wrongPassword(u.address);
      const status = (
        await must("GET", `/attack-detection/brute-force/users/${u.id}`)
      ).body;
      if (status?.disabled) {
        console.log(`lock ${u.key} locked after ${n} wrong passwords`);
        return;
      }
    }
    throw new Fail(`${u.key}: twelve wrong passwords did not lock the account`);
  },

  async unlock(name) {
    const u = await userOf(name);
    await must("DELETE", `/attack-detection/brute-force/users/${u.id}`);
    console.log(`unlock ${u.key} ok`);
  },

  async "make-disabled"() {
    await commands["drop-disabled"](true);
    const password = `Md-${randomBytes(9).toString("base64url").replace(/[-_]/g, "x")}-9`;
    const address = `${THROWAWAY}@medaris.test`;
    await must("POST", "/users", {
      username: THROWAWAY,
      email: address,
      firstName: "Hesap",
      lastName: "Devredışı",
      enabled: false,
      emailVerified: true,
      attributes: { gender: ["MALE"], privacyNoticeRead: ["yes"] },
      credentials: [{ type: "password", value: password, temporary: false }],
    });
    writeFileSync(
      OUT,
      `SIF_DISABLED_EMAIL=${address}\nSIF_DISABLED_PASSWORD=${password}\n`,
      { mode: 0o600 }
    );
    chmodSync(OUT, 0o600);
    console.log(`make-disabled ${THROWAWAY} ok`);
  },

  async "drop-disabled"(quiet = false) {
    const found = (await must("GET", `/users?exact=true&username=${THROWAWAY}`))
      .body;
    for (const u of found ?? []) await must("DELETE", `/users/${u.id}`);
    rmSync(OUT, { force: true });
    if (quiet !== true)
      console.log(`drop-disabled ${THROWAWAY} removed ${found?.length ?? 0}`);
  },

  async none() {
    console.log("none");
  },
};

run("kc", async () => {
  const [command, ...rest] = process.argv.slice(2);
  const f = commands[command];
  if (!f)
    throw new Fail(
      `usage: kc.mjs ${Object.keys(commands).join(" | ")} [ACCOUNT]`,
      2
    );
  await f(...rest);
});
