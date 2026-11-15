// What the helpers in this folder share. It is not a command: the `.mjs` files next to it are.
//
// - The accounts: graphs/.local/accounts.env, read here and never printed. An ACCOUNT is the role key of that file
//   (TALEBE_MALE) or the name a binding gives the account (talebeMale); both mean the same person.
// - A token: the real OIDC authorization-code flow with PKCE against the stack's `tedris-local` client, through the login
//   form of the Medaris theme (the address it posts to is window.kcContext.loginAction). No password grant, so no Keycloak
//   admin credentials. The token is cached per account in graphs/.local/tokens/ (git-ignored, mode 600) until it runs
//   out, then refreshed with its refresh token, and a new sign-in only when neither works.
// - A call to tedrisat as that account.
// Nothing secret is ever printed: no password, no token, no client secret, no database URL.
import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const LOCAL = resolve(here, "../../.local");
export const API = (
  process.env.TEDRISAT_URL ?? "http://localhost:3001"
).replace(/\/$/, "");
export const MAILPIT = (
  process.env.MAILPIT_URL ?? "http://localhost:8025"
).replace(/\/$/, "");
const REDIRECT = "http://localhost:4000/api/auth/callback/keycloak"; // tedris-local's registered address; never followed
const TOKENS = resolve(LOCAL, "tokens");

/** A failure with a message for the person reading the report; `code` is the exit status (2 for a wrong call). */
export class Fail extends Error {
  constructor(message, code = 1) {
    super(message);
    this.code = code;
  }
}

/** Runs a helper's main function: its failure is one line on stderr and a non-zero exit, never a stack trace. */
export function run(name, main) {
  main().then(
    () => process.exit(0),
    (e) => {
      const cause = e?.cause?.code ? ` (${e.cause.code})` : "";
      console.error(`${name}: ${e?.message ?? e}${cause}`);
      process.exit(e instanceof Fail ? e.code : 1);
    }
  );
}

export function parseEnvFile(path) {
  if (!existsSync(path))
    throw new Fail(
      `${path} does not exist: the stack's seed has not run, or the link is broken`
    );
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  return out;
}

let envCache;
/** graphs/.local/accounts.env as an object. */
export const env = () =>
  (envCache ??= parseEnvFile(resolve(LOCAL, "accounts.env")));

let seedCache;
/** graphs/.local/seed.json as an object. */
export function seed() {
  if (!seedCache) {
    const path = resolve(LOCAL, "seed.json");
    if (!existsSync(path))
      throw new Fail(
        `${path} does not exist: the stack's seed has not run, or the link is broken`
      );
    seedCache = JSON.parse(readFileSync(path, "utf8"));
  }
  return seedCache;
}

const ALIASES = {
  BASMUDERRIS: "MEDRESE_BASMUDERRIS",
  SISTEM_ADMIN: "SYSTEM_ADMIN",
};

/** `talebeMale`, `TALEBE_MALE` and `talebe-male` all give TALEBE_MALE; an unknown account is a wrong call. */
export function accountKey(name) {
  if (!name) throw new Fail("an ACCOUNT is missing", 2);
  const snake = String(name)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/-/g, "_")
    .toUpperCase();
  const key = ALIASES[snake] ?? snake;
  if (!env()[`E2E_${key}_EMAIL`] || !env()[`E2E_${key}_PASSWORD`]) {
    const known = [
      ...new Set(
        Object.keys(env())
          .map((k) => /^E2E_(.+)_EMAIL$/.exec(k)?.[1])
          .filter(Boolean)
      ),
    ];
    throw new Fail(
      `no account ${name} in graphs/.local/accounts.env (known: ${known.join(", ")})`,
      2
    );
  }
  return key;
}

/** The Keycloak sub of an account, which is its user id in tedrisat. */
export const subOf = (name) => {
  const sub = env()[`E2E_${accountKey(name)}_SUB`];
  if (!sub)
    throw new Fail(
      `graphs/.local/accounts.env has no E2E_${accountKey(name)}_SUB`
    );
  return sub;
};

const need = (k) => {
  if (!env()[k]) throw new Fail(`graphs/.local/accounts.env has no ${k}`);
  return env()[k];
};

const timeout = () => AbortSignal.timeout(60_000);

// one cookie jar per sign-in: the login page and its form post belong to one authentication session
function remember(res, jar) {
  for (const c of res.headers.getSetCookie()) {
    const [pair] = c.split(";");
    jar.set(
      pair.slice(0, pair.indexOf("=")),
      pair.slice(pair.indexOf("=") + 1)
    );
  }
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function signIn(key) {
  const issuer = need("E2E_KEYCLOAK_ISSUER");
  const clientId = need("E2E_KEYCLOAK_CLIENT_ID");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const url = new URL(`${issuer}/protocol/openid-connect/auth`);
  for (const [k, v] of Object.entries({
    client_id: clientId,
    redirect_uri: REDIRECT,
    response_type: "code",
    scope: "openid email profile",
    state: "graphs",
    code_challenge: challenge,
    code_challenge_method: "S256",
  }))
    url.searchParams.set(k, v);
  const jar = new Map();
  const page = await fetch(url, { redirect: "manual", signal: timeout() });
  const cookie = remember(page, jar);
  const html = await page.text();
  // the theme draws the form in the browser; where it posts to is in window.kcContext
  const action = /"loginAction"\s*:\s*"([^"]+)"/.exec(html)?.[1];
  if (!action)
    throw new Fail(
      `${key}: the sign-in page has no loginAction (status ${page.status}); is the Medaris theme in place?`
    );
  const post = await fetch(JSON.parse(`"${action}"`), {
    method: "POST",
    redirect: "manual",
    signal: timeout(),
    headers: { "content-type": "application/x-www-form-urlencoded", cookie },
    body: new URLSearchParams({
      username: need(`E2E_${key}_EMAIL`),
      password: need(`E2E_${key}_PASSWORD`),
      credentialId: "",
    }),
  });
  const back = post.headers.get("location");
  if (post.status !== 302 || !back?.startsWith(REDIRECT)) {
    const where = back ? `, sent on to ${new URL(back, issuer).pathname}` : "";
    throw new Fail(
      `${key}: the sign-in did not hand back a code (status ${post.status}${where}); a required action or a locked account stops it`
    );
  }
  const code = new URL(back).searchParams.get("code");
  return tokenRequest(key, {
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT,
    code_verifier: verifier,
  });
}

async function tokenRequest(key, params) {
  const res = await fetch(
    `${need("E2E_KEYCLOAK_ISSUER")}/protocol/openid-connect/token`,
    {
      method: "POST",
      signal: timeout(),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        ...params,
        client_id: need("E2E_KEYCLOAK_CLIENT_ID"),
        client_secret: need("E2E_KEYCLOAK_CLIENT_SECRET"),
      }),
    }
  );
  const body = await res.json().catch(() => ({}));
  if (!body.access_token)
    return {
      error: `${key}: no token (status ${res.status}, ${body.error ?? "unknown"})`,
    };
  const now = Date.now();
  return {
    access_token: body.access_token,
    expires_at: now + (body.expires_in ?? 300) * 1000,
    refresh_token: body.refresh_token,
    refresh_expires_at: body.refresh_token
      ? now + (body.refresh_expires_in ?? 0) * 1000
      : 0,
  };
}

// what the cache is valid for: another password, user or client (a purged and seeded stack) is another entry
const fingerprint = (key) =>
  createHash("sha256")
    .update(
      JSON.stringify([
        need("E2E_KEYCLOAK_ISSUER"),
        need("E2E_KEYCLOAK_CLIENT_ID"),
        need(`E2E_${key}_EMAIL`),
        need(`E2E_${key}_PASSWORD`),
        env()[`E2E_${key}_SUB`],
      ])
    )
    .digest("hex");

function readCache(key) {
  try {
    const c = JSON.parse(readFileSync(resolve(TOKENS, `${key}.json`), "utf8"));
    return c.fp === fingerprint(key) ? c : null;
  } catch {
    return null;
  }
}

function writeCache(key, t) {
  mkdirSync(TOKENS, { recursive: true, mode: 0o700 });
  const file = resolve(TOKENS, `${key}.json`);
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify({ fp: fingerprint(key), ...t }), {
    mode: 0o600,
  });
  chmodSync(tmp, 0o600);
  renameSync(tmp, file); // a helper running at the same time reads the old file or the new one, never half of it
}

/** A valid access token of the account: the cache, else a refresh, else a new sign-in. `fresh` skips the cache. */
export async function token(name, { fresh = false } = {}) {
  const key = accountKey(name);
  const cached = fresh ? null : readCache(key);
  if (cached && cached.expires_at - Date.now() > 20_000)
    return cached.access_token;
  if (
    cached?.refresh_token &&
    cached.refresh_expires_at - Date.now() > 20_000
  ) {
    const t = await tokenRequest(key, {
      grant_type: "refresh_token",
      refresh_token: cached.refresh_token,
    });
    if (!t.error) {
      writeCache(key, t);
      return t.access_token;
    }
  }
  const t = await signIn(key);
  if (t.error) throw new Fail(t.error);
  writeCache(key, t);
  return t.access_token;
}

/** One call to tedrisat as the account: `{ status, body, text }`, body parsed when it is JSON. `body` is an object or a JSON string. */
export async function call(name, method, path, body) {
  if (!path.startsWith("/"))
    throw new Fail(`the path must start with /, not ${path}`, 2);
  for (let attempt = 0; ; attempt++) {
    const bearer = await token(name, { fresh: attempt > 0 });
    const res = await fetch(`${API}${path}`, {
      method: method.toUpperCase(),
      signal: timeout(),
      headers: {
        authorization: `Bearer ${bearer}`,
        accept: "application/json",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body:
        body === undefined
          ? undefined
          : typeof body === "string"
            ? body
            : JSON.stringify(body),
    });
    if (res.status === 401 && attempt === 0) continue; // a token the API no longer takes: sign in again once
    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }
    return { status: res.status, body: json ?? text, text };
  }
}

/** The API's own words for a refusal: `HTTP 403 AUTHZ_FORBIDDEN: message`. */
export function refusal(r) {
  const code =
    r.body && typeof r.body === "object"
      ? (r.body.code ?? r.body.error)
      : undefined;
  const message =
    r.body && typeof r.body === "object"
      ? r.body.message
      : String(r.text ?? "").slice(0, 200);
  return `HTTP ${r.status}${code ? ` ${code}` : ""}${message ? `: ${Array.isArray(message) ? message.join("; ") : message}` : ""}`;
}

/** call() that fails unless the status is 2xx (or one of `also`). */
export async function must(name, method, path, body, also = []) {
  const r = await call(name, method, path, body);
  if ((r.status < 200 || r.status >= 300) && !also.includes(r.status))
    throw new Fail(
      `${accountKey(name)} ${method.toUpperCase()} ${path}: ${refusal(r)}`
    );
  return r;
}

/** What a course holds for the account: ENROLLED, PENDING, COMPLETED..., or `none`. */
export async function seatOf(name, courseId) {
  const r = await must(name, "GET", "/courses/enrolled?includePending=true");
  const list = Array.isArray(r.body) ? r.body : (r.body?.items ?? []);
  return list.find((c) => c.id === courseId)?.enrollment?.status ?? "none";
}

/** `--name value` and `--flag` of an argument list, and what is left over. */
export function options(args, { values = [], flags = [] } = {}) {
  const out = { rest: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--") && a.length > 2) {
      const name = a.slice(2);
      if (flags.includes(name)) out[name] = true;
      else if (values.includes(name)) {
        if (i + 1 >= args.length) throw new Fail(`--${name} needs a value`, 2);
        out[name] = args[++i];
      } else throw new Fail(`unknown option ${a}`, 2);
    } else out.rest.push(a);
  }
  return out;
}

/**
 * Changes a course's müderrisler as the başnazım may: `edit(team, imamUserId)` returns `{ team, imam }` (team is a list of
 * { userId, name, title }) or null for nothing to change. A course of a medrese goes through the medrese's route, a köşk's own
 * course through the köşk's, which also needs the course's version. Returns true when something was written.
 */
export async function reseatMuderris(courseId, edit) {
  const course = (await must("SYSTEM_ADMIN", "GET", `/courses/${courseId}`))
    .body;
  const team = (course.muderris ?? []).map((m) => ({
    userId: m.userId,
    name: m.name,
    title: m.title ?? undefined,
  }));
  const imam =
    (course.muderris ?? []).find((m) => m.isImam)?.userId ?? team[0]?.userId;
  const next = await edit(team, imam);
  if (!next) return false;
  if (course.madrasahId) {
    await must(
      "SYSTEM_ADMIN",
      "PUT",
      `/madrasahs/${course.madrasahId}/courses/${courseId}/muderrises`,
      {
        muderrisUserIds: next.team.map((m) => m.userId),
        imamUserId: next.imam,
      }
    );
  } else {
    await must("SYSTEM_ADMIN", "PUT", `/courses/${courseId}/muderris`, {
      version: course.version,
      muderris: next.team.map((m) => ({
        userId: m.userId,
        name: m.name,
        ...(m.title ? { title: m.title } : {}),
      })),
      imamUserId: next.imam,
    });
  }
  return true;
}

/** The name a person goes by in tedrisat: their own `GET /me`. */
export async function nameOf(account) {
  const me = (await must(account, "GET", "/me")).body;
  return [me.givenName, me.familyName].filter(Boolean).join(" ") || me.email;
}
