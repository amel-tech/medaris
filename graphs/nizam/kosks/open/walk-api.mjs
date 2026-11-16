#!/usr/bin/env node
// A walk's way to tedrisat's HTTP API, for a binding's `setup` and `teardown` (`run` commands: no page exists then).
// It signs in as one of the stack's accounts and calls the API as that person.
//
//   node walk-api.mjs <ACCOUNT> remove-kosk <handle>      delete every köşk with that short name (the başnazım may)
//   node walk-api.mjs <ACCOUNT> call <METHOD> <path> [json]   one call; prints "HTTP <status> <body>"
//
// <ACCOUNT> is the role key of graphs/.local/accounts.env (SYSTEM_ADMIN, KOSK_NAZIM, ...). The file is read here and
// nothing of it is printed. The apps' clients allow no password grant (as in production), so for the second it takes to
// get the token this switches the password grant on for the client of E2E_KEYCLOAK_CLIENT_ID, as the stack's seed does,
// and back off, through the realm's admin API. The stack's admin is read from KC_ADMIN_USER and KC_ADMIN_PASSWORD in the
// environment (local only; never written in a file of the repository).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const env = Object.fromEntries(
  readFileSync(
    fileURLToPath(new URL("../../../.local/accounts.env", import.meta.url)),
    "utf8"
  )
    .split("\n")
    .map((l) => l.match(/^([A-Z][A-Z0-9_]*)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]])
);
const API = process.env.TEDRISAT_URL ?? "http://localhost:3001";
const issuer = new URL(env.E2E_KEYCLOAK_ISSUER);
const realm = issuer.pathname.split("/").filter(Boolean).pop();
const KC = issuer.origin;
if (!/^localhost(:\d+)?$/.test(issuer.host))
  throw new Error("walk-api talks to a local Keycloak only");

const form = (o) => new URLSearchParams(o);
async function adminToken() {
  const user = process.env.KC_ADMIN_USER;
  const password = process.env.KC_ADMIN_PASSWORD;
  if (!user || !password)
    throw new Error(
      "set KC_ADMIN_USER and KC_ADMIN_PASSWORD (the local stack's Keycloak admin)"
    );
  const res = await fetch(`${KC}/realms/master/protocol/openid-connect/token`, {
    method: "POST",
    body: form({
      grant_type: "password",
      client_id: "admin-cli",
      username: user,
      password,
    }),
  });
  if (!res.ok) throw new Error(`Keycloak admin sign-in refused: ${res.status}`);
  return (await res.json()).access_token;
}

async function grant(role) {
  const body = form({
    grant_type: "password",
    client_id: env.E2E_KEYCLOAK_CLIENT_ID,
    client_secret: env.E2E_KEYCLOAK_CLIENT_SECRET,
    username: env[`E2E_${role}_EMAIL`],
    password: env[`E2E_${role}_PASSWORD`],
    scope: "openid email profile",
  });
  return fetch(`${issuer.href}/protocol/openid-connect/token`, {
    method: "POST",
    body,
  });
}

async function tokenOf(role) {
  if (!env[`E2E_${role}_EMAIL`])
    throw new Error(`no account ${role} in accounts.env`);
  let res = await grant(role);
  if (res.ok) return (await res.json()).access_token;
  // switched off, as in production: on for the length of the request, then off again
  const headers = {
    authorization: `Bearer ${await adminToken()}`,
    "content-type": "application/json",
  };
  const base = `${KC}/admin/realms/${realm}`;
  const [client] = await (
    await fetch(
      `${base}/clients?clientId=${encodeURIComponent(env.E2E_KEYCLOAK_CLIENT_ID)}`,
      { headers }
    )
  ).json();
  const put = (directAccessGrantsEnabled) =>
    fetch(`${base}/clients/${client.id}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ ...client, directAccessGrantsEnabled }),
    });
  await put(true);
  try {
    // another walk may switch it off while this one asks: ask again a few times
    for (let i = 0; i < 6; i++) {
      res = await grant(role);
      if (res.ok) return (await res.json()).access_token;
      await put(true);
      await new Promise((r) => setTimeout(r, 200 + Math.random() * 400));
    }
    throw new Error(`sign-in as ${role} refused: ${res.status}`);
  } finally {
    await put(client.directAccessGrantsEnabled === true);
  }
}

async function call(token, method, path, json) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(json === undefined ? {} : { "content-type": "application/json" }),
    },
    body: json === undefined ? undefined : json,
  });
  const text = await res.text();
  return { status: res.status, text };
}

const [role, command, ...rest] = process.argv.slice(2);
const token = await tokenOf(role);
if (command === "call") {
  const [method, path, json] = rest;
  const { status, text } = await call(token, method, path, json);
  console.log(`HTTP ${status} ${text.slice(0, 400)}`);
  process.exit(status < 400 ? 0 : 1);
} else if (command === "remove-kosk") {
  const [handle] = rest;
  const found = await call(
    token,
    "GET",
    `/kosks/directory?q=${encodeURIComponent(handle)}&limit=50`
  );
  if (found.status !== 200) throw new Error(`directory: HTTP ${found.status}`);
  const same = (found.text ? JSON.parse(found.text).items : []).filter(
    (k) =>
      (k.handle ?? "").replace(/^@/, "").toLowerCase() === handle.toLowerCase()
  );
  for (const k of same) {
    const gone = await call(token, "DELETE", `/kosks/${k.id}`);
    if (gone.status >= 300)
      throw new Error(`delete ${k.id}: HTTP ${gone.status}`);
  }
  console.log(`removed ${same.length} kosk with the short name ${handle}`);
} else {
  throw new Error(
    "commands: call <METHOD> <path> [json] | remove-kosk <handle>"
  );
}
