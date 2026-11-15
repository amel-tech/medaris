// The walk data of nazar.pano.decideApplications, made and removed through tedrisat's HTTP API: waiting applications on
// the seeded course that asks for approval, and (for the walk where the başmüderris may decide) the başmüderris as a
// second müderris of that course. It is the binding's `setup` and `teardown`: `node applications.mjs up|down ...`.
//
//   up   --course <id> --madrasah <id> --applicants KEY,KEY [--head-teaches]
//   down --course <id> --madrasah <id> --applicants KEY,KEY [--head-teaches]
//   seat --course <id> --who KEY      prints `seat KEY ENROLLED|PENDING|none`: what the course holds for that account
//
// KEY is the role key of an account in graphs/.local/accounts.env (MEDARIS_NAZIM, KOSK_NAZIM, ...). An application is made
// by that account itself (POST /courses/:id/enroll), so it is a real PENDING row with the account's own name. The seed's
// own waiting application (TALEBE_MALE) is never read or touched here. A person is signed in as a person is: the OIDC
// authorization-code flow with PKCE against the local Keycloak, through the login form of the Medaris theme, with the
// stack's `tedris-local` client; the direct grant is off on every web client and is not switched on here.
// Nothing secret is printed: no password, no token.
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(resolve(here, "../../../.local/accounts.env"), "utf8")
    .split("\n")
    .map((l) => /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(l))
    .filter(Boolean)
    .map((m) => [m[1], m[2].trim().replace(/^(["'])(.*)\1$/, "$2")])
);
const API = process.env.TEDRISAT_URL ?? "http://localhost:3001";
const REDIRECT = "http://localhost:4000/api/auth/callback/keycloak"; // tedris-local's registered address; never followed

const need = (k) => {
  if (!env[k]) throw new Error(`graphs/.local/accounts.env has no ${k}`);
  return env[k];
};

const jar = (res, into) => {
  for (const c of res.headers.getSetCookie()) {
    const [pair] = c.split(";");
    into.set(
      pair.slice(0, pair.indexOf("=")),
      pair.slice(pair.indexOf("=") + 1)
    );
  }
  return [...into].map(([k, v]) => `${k}=${v}`).join("; ");
};

async function tokenOf(key) {
  const issuer = need("E2E_KEYCLOAK_ISSUER");
  const clientId = need("E2E_KEYCLOAK_CLIENT_ID");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const url = new URL(`${issuer}/protocol/openid-connect/auth`);
  for (const [k, v] of Object.entries({
    client_id: clientId,
    redirect_uri: REDIRECT,
    response_type: "code",
    scope: "openid",
    state: "graphs",
    code_challenge: challenge,
    code_challenge_method: "S256",
  }))
    url.searchParams.set(k, v);
  const cookies = new Map();
  const page = await fetch(url, { redirect: "manual" });
  const cookie = jar(page, cookies);
  const html = await page.text();
  // the theme renders the form in the browser; the address it posts to is in window.kcContext
  const action = /"loginAction"\s*:\s*"([^"]+)"/.exec(html)?.[1];
  if (!action)
    throw new Error(
      `${key}: the sign-in page has no loginAction (status ${page.status})`
    );
  const post = await fetch(JSON.parse(`"${action}"`), {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie },
    body: new URLSearchParams({
      username: need(`E2E_${key}_EMAIL`),
      password: need(`E2E_${key}_PASSWORD`),
      credentialId: "",
    }),
  });
  const back = post.headers.get("location");
  if (post.status !== 302 || !back?.startsWith(REDIRECT))
    throw new Error(
      `${key}: the sign-in did not hand back a code (status ${post.status}${back ? `, to ${new URL(back).origin}${new URL(back).pathname}` : ""})`
    );
  const code = new URL(back).searchParams.get("code");
  const res = await fetch(`${issuer}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      client_id: clientId,
      client_secret: need("E2E_KEYCLOAK_CLIENT_SECRET"),
      code_verifier: verifier,
    }),
  });
  const body = await res.json();
  if (!body.access_token)
    throw new Error(
      `${key}: no token (status ${res.status}, ${body.error ?? "unknown"})`
    );
  return body.access_token;
}

const tokens = new Map();
async function call(key, method, path, body) {
  if (!tokens.has(key)) tokens.set(key, await tokenOf(key));
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${tokens.get(key)}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // not JSON
  }
  return { status: res.status, json };
}

const args = process.argv.slice(2);
const verb = args.shift();
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? undefined : args[i + 1];
};
const course = opt("course");
const madrasah = opt("madrasah");
const applicants = (opt("applicants") ?? "").split(",").filter(Boolean);
const headTeaches = args.includes("--head-teaches");
if (!["up", "down", "seat"].includes(verb) || !course) {
  console.error(
    "usage: applications.mjs up|down --course <id> --madrasah <id> --applicants KEY,KEY [--head-teaches] | seat --course <id> --who KEY"
  );
  process.exit(2);
}

// the course's müderrisler as the seed leaves them: the one müderris, who is the imam
async function setTeam(withHead) {
  const ids = [
    need("E2E_MUDERRIS_SUB"),
    ...(withHead ? [need("E2E_MEDRESE_BASMUDERRIS_SUB")] : []),
  ];
  const r = await call(
    "SYSTEM_ADMIN",
    "PUT",
    `/madrasahs/${madrasah}/courses/${course}/muderrises`,
    {
      muderrisUserIds: ids,
      imamUserId: ids[0],
    }
  );
  if (r.status !== 200)
    throw new Error(
      `the course's müderrisler were not set (status ${r.status}, ${r.json?.code ?? "no code"})`
    );
}

if (verb === "seat") {
  const who = opt("who");
  const r = await call(who, "GET", "/courses/enrolled?includePending=true");
  if (r.status !== 200)
    throw new Error(`${who}: the courses were not read (status ${r.status})`);
  const mine = (r.json ?? []).find((c) => c.id === course);
  console.log(`seat ${who} ${mine?.enrollment?.status ?? "none"}`);
} else if (verb === "up") {
  if (headTeaches) {
    if (!madrasah) throw new Error("--head-teaches needs --madrasah");
    await setTeam(true);
  }
  for (const key of applicants) {
    await call(key, "DELETE", `/courses/${course}/enrollment`); // a row an aborted walk left; none is fine
    const r = await call(key, "POST", `/courses/${course}/enroll`);
    if (r.status !== 201 || r.json?.status !== "PENDING")
      throw new Error(
        `${key} did not get a waiting application (status ${r.status}, ${r.json?.status ?? r.json?.code ?? "no status"})`
      );
  }
  console.log(
    `ready: ${applicants.length} waiting application(s)${headTeaches ? ", the başmüderris teaches the course" : ""}`
  );
} else {
  const left = [];
  for (const key of applicants) {
    const r = await call(key, "DELETE", `/courses/${course}/enrollment`); // a waiting or an approved row goes; 404 means it is gone already
    if (![200, 404].includes(r.status))
      left.push(`${key} (${r.status}, ${r.json?.code ?? "no code"})`);
  }
  if (headTeaches) await setTeam(false);
  if (left.length) throw new Error(`not removed: ${left.join(", ")}`);
  console.log(
    `restored: ${applicants.length} application(s) removed${headTeaches ? ", the course has its one müderris again" : ""}`
  );
}
