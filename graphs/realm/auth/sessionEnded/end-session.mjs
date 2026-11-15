// Ends a person's single sign-on session at Keycloak, as another Medaris app's sign-out, an administrator or an idle
// timeout would, so that a walk of realm.auth.sessionEnded can see what an open page does next.
//
//   node ../realm/auth/sessionEnded/end-session.mjs end <ACCOUNT> [--client <clientId>] [--within <seconds>]
//   node ../realm/auth/sessionEnded/end-session.mjs gone <ACCOUNT>
//   node ../realm/auth/sessionEnded/end-session.mjs count <ACCOUNT> [--client <clientId>] [--within <seconds>]
//
// `end` lists the account's sessions through the Keycloak admin REST API (GET /users/{sub}/sessions) and deletes each one
// (DELETE /sessions/{id}). The account has many (every helper token and every earlier walk leaves one, and other walks sign
// it in too), and only the walk's own should go, so `--within` keeps the sessions that started in the last that many seconds
// (default 600: the walk signed in a moment ago) and `--client` the ones that name that client (tedris-local). It prints
// `ended <ACCOUNT> <n>`, and fails when it ended none: a walk that "ended the session" of nobody would only look as if it had.
// The ids it ended are kept in graphs/.local/sessions-ended.json (git-ignored, ids only), for `gone`.
//
// `gone` is the check that the end took: it reads those ids back and prints `gone <ACCOUNT> <alive>/<ended>`, `0/1` when every
// session `end` deleted is no longer there. (Counting the account's live sessions would also count the ones other walks start
// meanwhile.) `count` prints `sessions <ACCOUNT> <n>` for the same selection as `end`, to look at by hand.
//
// What the walk does after `end` is its own: the apps keep the session in the browser's cookie here (no Valkey), so a session
// ended at Keycloak is noticed only when libs/auth's proxy next asks Keycloak's userinfo, at most once a minute per session
// (SESSION_CHECK_INTERVAL_MS, libs/auth/src/server/config.ts:132), and the access token Keycloak issued stays valid for tedrisat
// until it runs out (5 minutes). The binding's MINUTE_PASSES waits 62 s for that.
//
// The admin credentials are E2E_KEYCLOAK_ADMIN_USER and E2E_KEYCLOAK_ADMIN_PASSWORD of graphs/.local/accounts.env; they
// and the access token they give are never printed. Only a local Keycloak is spoken to.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  accountKey,
  env,
  Fail,
  LOCAL,
  run,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const KEPT = resolve(LOCAL, "sessions-ended.json");

const optionOf = (args, name) => {
  const at = args.indexOf(name);
  return at < 0 ? undefined : args[at + 1];
};

const need = (key) => {
  const value = env()[key];
  if (!value) throw new Fail(`graphs/.local/accounts.env has no ${key}`);
  return value;
};

const origin = () => {
  const issuer = need("E2E_KEYCLOAK_ISSUER");
  const { origin, pathname } = new URL(issuer);
  if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    throw new Fail(
      `end-session.mjs speaks only to a local Keycloak, not ${origin}`
    );
  }
  return { origin, realm: pathname.split("/").filter(Boolean).at(-1) };
};

async function adminToken(base) {
  const response = await fetch(
    `${base}/realms/master/protocol/openid-connect/token`,
    {
      method: "POST",
      body: new URLSearchParams({
        grant_type: "password",
        client_id: "admin-cli",
        username: need("E2E_KEYCLOAK_ADMIN_USER"),
        password: need("E2E_KEYCLOAK_ADMIN_PASSWORD"),
      }),
      signal: AbortSignal.timeout(20_000),
    }
  );
  if (!response.ok)
    throw new Fail(`Keycloak's admin sign-in answered ${response.status}`);
  return (await response.json()).access_token;
}

/** The account's sessions at Keycloak, and a function that calls the admin API with the token. */
async function sessionsOf(account) {
  const { origin: base, realm } = origin();
  const token = await adminToken(base);
  const call = async (method, path) => {
    const response = await fetch(`${base}/admin/realms/${realm}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok)
      throw new Fail(`${method} ${path} answered ${response.status}`);
    const text = await response.text();
    return text ? JSON.parse(text) : undefined;
  };
  return { all: await call("GET", `/users/${subOf(account)}/sessions`), call };
}

const selected = (all, args) => {
  const client = optionOf(args, "--client");
  const since = Date.now() - Number(optionOf(args, "--within") ?? 600) * 1000;
  return all.filter(
    (s) =>
      s.start >= since &&
      (!client || Object.values(s.clients ?? {}).includes(client))
  );
};

const kept = () =>
  existsSync(KEPT) ? JSON.parse(readFileSync(KEPT, "utf8")) : {};

run("end-session", async () => {
  const [command, account, ...rest] = process.argv.slice(2);
  if (!["end", "gone", "count"].includes(command) || !account) {
    throw new Fail(
      "usage: end-session.mjs end|gone|count <ACCOUNT> [--client <clientId>] [--within <seconds>]",
      2
    );
  }
  const { all, call } = await sessionsOf(account);
  if (command === "count") {
    console.log(`sessions ${account} ${selected(all, rest).length}`);
    return;
  }
  const key = accountKey(account);
  if (command === "gone") {
    const ids = kept()[key];
    if (!ids?.length)
      throw new Fail(
        `no session of ${account} was ended by this helper (graphs/.local/sessions-ended.json)`
      );
    const alive = ids.filter((id) => all.some((s) => s.id === id));
    console.log(`gone ${account} ${alive.length}/${ids.length}`);
    return;
  }
  const mine = selected(all, rest);
  if (mine.length === 0) {
    throw new Fail(
      `no session of ${account} started in the last ${optionOf(rest, "--within") ?? 600} s (of ${all.length})`
    );
  }
  for (const session of mine)
    await call("DELETE", `/sessions/${session.id}?isOffline=false`);
  writeFileSync(
    KEPT,
    `${JSON.stringify({ ...kept(), [key]: mine.map((s) => s.id) })}\n`,
    { mode: 0o600 }
  );
  console.log(`ended ${account} ${mine.length}`);
});
