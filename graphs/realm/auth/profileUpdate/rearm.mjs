// Arms one of the stack's three "required action pending" accounts again, after a walk has used its page up (the stack's
// seed does the same, for every account at once; this does one, in a second). Through the local Keycloak's admin REST API,
// as the admin of accounts.env (E2E_KEYCLOAK_ADMIN_USER / _PASSWORD), read inside this process: no password is ever in a
// command line or printed.
//
//   node ../realm/auth/profileUpdate/rearm.mjs profile  [PENDING_PROFILE]   remove the privacy-notice tick
//   node ../realm/auth/profileUpdate/rearm.mjs email    [PENDING_EMAIL]      mark the e-mail address not verified
//   node ../realm/auth/profileUpdate/rearm.mjs password [PENDING_PASSWORD]  put the same password back and ask for a new one
//   node ../realm/auth/profileUpdate/rearm.mjs status   [PENDING_PROFILE]   print what the account holds (for an `effects` check)
//
// Each re-arm is idempotent: an account that is already armed is left alone and the line says so. The three prints:
//   rearm <ACCOUNT> profile: armed | already armed
//   rearm <ACCOUNT> email: armed | already armed
//   rearm <ACCOUNT> password: armed
//   status <ACCOUNT> privacyNoticeRead=<yes|none> gender=<FEMALE|MALE|none> emailVerified=<true|false> requiredActions=<a,b|none>
//
// Why `profile` needs more than a PUT. config/keycloak/user-profile.json lets only the person edit `privacyNoticeRead`
// (permissions.edit: ["user"]), and a PUT of a user without it does not remove it. So, as the stack's seed does, the
// administrator may edit the attribute for the length of the call: the realm's user profile is read, the attribute's edit
// permission widened, the user written without the attribute, and the profile put back in a `finally`. Nothing else of the
// profile is touched. The window is a second; a walk is under the replay lock, so no other walk signs in meanwhile.
//
// Never use this on a Keycloak that is not the local one: it refuses any address but localhost.
import { env, Fail, run } from "../../../bindings/helpers/lib.mjs";

const MODES = {
  profile: "PENDING_PROFILE",
  email: "PENDING_EMAIL",
  password: "PENDING_PASSWORD",
  status: "PENDING_PROFILE",
};

const settings = () => {
  const e = env();
  const issuer = e.E2E_KEYCLOAK_ISSUER;
  const user = e.E2E_KEYCLOAK_ADMIN_USER;
  const password = e.E2E_KEYCLOAK_ADMIN_PASSWORD;
  if (!issuer || !user || !password)
    throw new Fail(
      "graphs/.local/accounts.env has no E2E_KEYCLOAK_ISSUER, E2E_KEYCLOAK_ADMIN_USER or E2E_KEYCLOAK_ADMIN_PASSWORD"
    );
  const url = new URL(issuer);
  if (!/^(localhost|127\.0\.0\.1)$/.test(url.hostname))
    throw new Fail(
      `rearm.mjs only talks to a local Keycloak, not ${url.hostname}`
    );
  const realm = url.pathname.split("/").filter(Boolean).pop();
  return { origin: url.origin, realm, user, password };
};

async function adminSession() {
  const s = settings();
  const res = await fetch(
    `${s.origin}/realms/master/protocol/openid-connect/token`,
    {
      method: "POST",
      body: new URLSearchParams({
        grant_type: "password",
        client_id: "admin-cli",
        username: s.user,
        password: s.password,
      }),
    }
  );
  if (!res.ok) throw new Fail(`the admin token was refused: ${res.status}`);
  const token = (await res.json()).access_token;
  const base = `${s.origin}/admin/realms/${s.realm}`;
  return async (method, path, body, ok = []) => {
    const r = await fetch(`${base}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!r.ok && !ok.includes(r.status))
      throw new Fail(
        `${method} ${path} -> ${r.status} ${(await r.text()).slice(0, 200)}`
      );
    const text = await r.text();
    return text ? JSON.parse(text) : undefined;
  };
}

const first = (attributes, name) => attributes?.[name]?.[0];

run("rearm", async () => {
  const [mode, given, ...more] = process.argv.slice(2);
  if (!(mode in MODES) || more.length)
    throw new Fail(
      `usage: rearm.mjs ${Object.keys(MODES).join("|")} [PENDING_ACCOUNT]`,
      2
    );
  const key = (given ?? MODES[mode]).toUpperCase();
  if (!/^PENDING_(PROFILE|EMAIL|PASSWORD)$/.test(key))
    throw new Fail(`${key} is not one of the three pending accounts`, 2);
  const address = env()[`E2E_${key}_EMAIL`];
  if (!address)
    throw new Fail(`graphs/.local/accounts.env has no E2E_${key}_EMAIL`);

  const kc = await adminSession();
  const found = await kc(
    "GET",
    `/users?exact=true&email=${encodeURIComponent(address)}`
  );
  const user = found.find((u) => u.email === address);
  if (!user)
    throw new Fail(`${key}: no user with that e-mail address in the realm`);
  const read = () => kc("GET", `/users/${user.id}`);
  const actions = (u) =>
    u.requiredActions?.length ? u.requiredActions.join(",") : "none";

  if (mode === "status") {
    const u = await read();
    console.log(
      `status ${key} privacyNoticeRead=${first(u.attributes, "privacyNoticeRead") ?? "none"} gender=${first(u.attributes, "gender") ?? "none"} emailVerified=${u.emailVerified} requiredActions=${actions(u)}`
    );
    return;
  }

  // a walk's session at Keycloak must not outlive it: the next walk starts from a form, not from a lingering session
  await kc("POST", `/users/${user.id}/logout`, undefined, [204]);

  if (mode === "email") {
    const u = await read();
    const was = u.emailVerified === false;
    if (!was)
      await kc("PUT", `/users/${user.id}`, { ...u, emailVerified: false });
    console.log(`rearm ${key} email: ${was ? "already armed" : "armed"}`);
    return;
  }

  if (mode === "password") {
    const password = env()[`E2E_${key}_PASSWORD`];
    if (!password)
      throw new Fail(`graphs/.local/accounts.env has no E2E_${key}_PASSWORD`);
    // the same password, not a temporary one: a walk that set a new one is put back to the one accounts.env holds
    await kc("PUT", `/users/${user.id}/reset-password`, {
      type: "password",
      value: password,
      temporary: false,
    });
    const u = await read();
    await kc("PUT", `/users/${user.id}`, {
      ...u,
      requiredActions: ["UPDATE_PASSWORD"],
    });
    console.log(`rearm ${key} password: armed`);
    return;
  }

  // profile
  const u = await read();
  if (first(u.attributes, "privacyNoticeRead") === undefined) {
    console.log(`rearm ${key} profile: already armed`);
    return;
  }
  const original = await kc("GET", "/users/profile");
  const widened = structuredClone(original);
  const attribute = widened.attributes.find(
    (a) => a.name === "privacyNoticeRead"
  );
  if (!attribute)
    throw new Fail(
      "the realm's user profile has no privacyNoticeRead attribute"
    );
  const wasEditable = (
    original.attributes.find((a) => a.name === "privacyNoticeRead").permissions
      ?.edit ?? []
  ).includes("admin");
  attribute.permissions = {
    ...(attribute.permissions ?? {}),
    edit: ["admin", "user"],
  };
  // put back what the config says (the person alone edits it), also when an earlier run died with it widened
  const restored = structuredClone(original);
  restored.attributes.find((a) => a.name === "privacyNoticeRead").permissions =
    {
      ...(attribute.permissions ?? {}),
      edit: ["user"],
    };
  await kc("PUT", "/users/profile", widened);
  try {
    // the seed's account holds the gender and nothing else: a `locale`, if a save left one, goes too
    const {
      privacyNoticeRead: _tick,
      locale: _language,
      ...rest
    } = u.attributes ?? {};
    await kc("PUT", `/users/${user.id}`, { ...u, attributes: rest });
  } finally {
    await kc("PUT", "/users/profile", restored);
  }
  const after = await read();
  if (first(after.attributes, "privacyNoticeRead") !== undefined)
    throw new Fail(`${key}: privacyNoticeRead is still set after the PUT`);
  console.log(
    `rearm ${key} profile: armed${wasEditable ? " (the realm's profile had been left editable by an administrator; put back)" : ""}`
  );
});
