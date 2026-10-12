import { createHash } from "node:crypto";
import {
  exportJWK,
  generateKeyPair,
  type JWTPayload,
  SignJWT,
  UnsecuredJWT,
} from "jose";
import { createAuth } from "../src/server";
import { BACKCHANNEL_LOGOUT_EVENT } from "../src/server/backchannel";
import type { AuthConfig } from "../src/server/config";
import { resolveConfig } from "../src/server/config";
import {
  createSessionCookie,
  type StoredSession,
} from "../src/server/session-cookie";
import { createSessionStore } from "../src/server/session-store";
import {
  clock,
  cookieHeader,
  ORIGIN,
  request,
  session,
  testConfig,
} from "./support/fixtures";
import { MemoryBackend } from "./support/memory-store";
import * as openid from "./support/openid-client";

/**
 * `POST /api/auth/backchannel-logout` (auth Phase 2): OIDC Back-Channel
 * Logout 1.0, with a logout token signed by a key the stubbed `jwks_uri`
 * publishes, as Keycloak 26 shapes it.
 */

vi.mock("openid-client", () => import("./support/openid-client"));

const PREFIX = "test:auth:nazar:";
const JWKS_URI = `${openid.IDP}/protocol/openid-connect/certs`;
const noCookies = { get: () => undefined, getAll: () => [] };

const idp = await generateKeyPair("RS256");
const stranger = await generateKeyPair("RS256");

let backend: MemoryBackend;
let jti = 0;
beforeEach(async () => {
  openid.resetOpenidClient();
  openid.configuration.serverMetadata.mockImplementation(() => ({
    issuer: openid.IDP,
    end_session_endpoint: `${openid.IDP}/end-session`,
    jwks_uri: JWKS_URI,
  }));
  const jwk = { ...(await exportJWK(idp.publicKey)), kid: "k1", alg: "RS256" };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL) =>
      String(url) === JWKS_URI
        ? Response.json({ keys: [jwk] })
        : new Response(null, { status: 404 })
    )
  );
  backend = new MemoryBackend(() => clock.now);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const serverConfig = (): AuthConfig =>
  testConfig({ sessionStore: { backend, keyPrefix: "test" } });

const seconds = (ms: number) => Math.floor(ms / 1000);

/** The claims Keycloak 26 puts in a logout token (DefaultTokenManager.initLogoutToken). */
const claims = (overrides: JWTPayload = {}): JWTPayload => ({
  iss: openid.IDP,
  aud: "nazar-test",
  iat: seconds(clock.now),
  exp: seconds(clock.now) + 120,
  jti: `logout-${++jti}`,
  sub: "user-1",
  sid: "sso-1",
  events: { [BACKCHANNEL_LOGOUT_EVENT]: {} },
  ...overrides,
});

const sign = (
  payload: JWTPayload,
  key: CryptoKey = idp.privateKey,
  kid = "k1"
) =>
  new SignJWT(payload)
    .setProtectedHeader({ alg: "RS256", kid, typ: "logout+jwt" })
    .sign(key);

const post = (body: Record<string, string>) =>
  request("/api/auth/backchannel-logout", {
    method: "POST",
    body: new URLSearchParams(body),
    headers: { "content-type": "application/x-www-form-urlencoded" },
  });

/** A session of `sub` in SSO session `sid`, stored as a sign-in would; its cookie header. */
async function signedIn(
  config: AuthConfig,
  { sub = "user-1", sid = "sso-1" }: { sub?: string; sid?: string } = {}
) {
  const resolved = resolveConfig(config);
  const stored: StoredSession = session({
    user: { sub },
    idToken: new UnsecuredJWT({ sub, sid }).encode(),
  });
  const { writes } = await createSessionStore(
    resolved,
    createSessionCookie(resolved)
  ).create(noCookies, stored);
  return cookieHeader(writes);
}

const storeKeyOf = (cookie: string) =>
  `${PREFIX}s:${createHash("sha256")
    .update(cookie.slice(cookie.indexOf("=") + 1))
    .digest("hex")}`;

describe("POST /api/auth/backchannel-logout", () => {
  it("ends every session of the IdP session it names, and only those", async () => {
    const config = serverConfig();
    const auth = createAuth(config);
    // Two browsers in the same SSO session, and the same account elsewhere.
    const first = await signedIn(config);
    const second = await signedIn(config);
    const elsewhere = await signedIn(config, { sid: "sso-2" });

    const response = await auth.handlers.backchannelLogout(
      post({ logout_token: await sign(claims()) })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const keys = backend.keys();
    expect(keys).not.toContain(storeKeyOf(first));
    expect(keys).not.toContain(storeKeyOf(second));
    expect(keys).not.toContain(`${PREFIX}sid:sso-1`);
    expect(keys).toContain(storeKeyOf(elsewhere));
    expect(backend.raw(`${PREFIX}sub:user-1`)).toEqual([
      storeKeyOf(elsewhere).slice(`${PREFIX}s:`.length),
    ]);

    // The next request of an ended session goes to sign-in.
    const next = await auth.proxy(request("/ders/42", { cookie: first }));
    expect(next.headers.get("location")).toBe(
      `${ORIGIN}/auth/signin?callbackUrl=%2Fders%2F42`
    );
    const still = await auth.proxy(request("/ders/42", { cookie: elsewhere }));
    expect(still.headers.get("location")).toBeNull();
  });

  it("ends every session of the account when the token names no sid", async () => {
    const config = serverConfig();
    const auth = createAuth(config);
    const one = await signedIn(config, { sid: "sso-1" });
    const two = await signedIn(config, { sid: "sso-2" });
    const other = await signedIn(config, { sub: "user-2", sid: "sso-3" });

    const { sid: _, ...withoutSid } = claims();
    const response = await auth.handlers.backchannelLogout(
      post({ logout_token: await sign(withoutSid) })
    );

    expect(response.status).toBe(200);
    const keys = backend.keys();
    expect(keys).not.toContain(storeKeyOf(one));
    expect(keys).not.toContain(storeKeyOf(two));
    expect(keys).toContain(storeKeyOf(other));
  });

  it.each<[string, () => Promise<string>]>([
    ["another audience", () => sign(claims({ aud: "tedris-test" }))],
    [
      "another issuer",
      () => sign(claims({ iss: "https://evil.example/realms/medaris" })),
    ],
    [
      "a signature the IdP's key does not verify",
      () => sign(claims(), stranger.privateKey),
    ],
    ["a nonce, as an ID token has", () => sign(claims({ nonce: "n-1" }))],
    ["no back-channel logout event", () => sign(claims({ events: {} }))],
    ["no events at all", () => sign(claims({ events: undefined }))],
    [
      "neither sid nor sub",
      () => sign(claims({ sid: undefined, sub: undefined })),
    ],
    [
      "an iat older than two minutes and a half",
      () => sign(claims({ iat: seconds(clock.now) - 200, exp: undefined })),
    ],
    [
      "an exp that has passed",
      () => sign(claims({ exp: seconds(clock.now) - 60 })),
    ],
    ["no jti", () => sign(claims({ jti: undefined }))],
    ["an unsigned token", async () => new UnsecuredJWT(claims()).encode()],
  ])("refuses %s with 400 and ends nothing", async (_, token) => {
    const config = serverConfig();
    const auth = createAuth(config);
    const cookie = await signedIn(config);

    const response = await auth.handlers.backchannelLogout(
      post({ logout_token: await token() })
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_request",
    });
    expect(backend.keys()).toContain(storeKeyOf(cookie));
  });

  it("refuses a token it has seen (its jti) with 400", async () => {
    const config = serverConfig();
    const auth = createAuth(config);
    const token = await sign(claims());

    expect(
      (await auth.handlers.backchannelLogout(post({ logout_token: token })))
        .status
    ).toBe(200);
    // Another replica, sharing the store, sees the same jti.
    const replica = createAuth(config);
    const replayed = await replica.handlers.backchannelLogout(
      post({ logout_token: token })
    );
    expect(replayed.status).toBe(400);
    await expect(replayed.json()).resolves.toMatchObject({
      error_description: "logout_token was used before",
    });
  });

  it("refuses a request without a logout_token, and anything but a POST", async () => {
    const auth = createAuth(serverConfig());
    expect((await auth.handlers.backchannelLogout(post({}))).status).toBe(400);
    const get = await auth.handlers.GET(
      request("/api/auth/backchannel-logout")
    );
    expect(get.status).toBe(405);
  });

  it("is reached through the catch-all route, and the proxy leaves it alone", async () => {
    const auth = createAuth(serverConfig());
    const response = await auth.handlers.POST(
      post({ logout_token: await sign(claims()) })
    );
    expect(response.status).toBe(200);

    const proxied = await auth.proxy(
      request("/api/auth/backchannel-logout", { method: "POST" })
    );
    expect(proxied.headers.get("x-middleware-next")).toBe("1");
    expect(proxied.headers.get("location")).toBeNull();
  });

  it("answers 503 when the store cannot be reached", async () => {
    const auth = createAuth(serverConfig());
    backend.down = true;
    const response = await auth.handlers.backchannelLogout(
      post({ logout_token: await sign(claims()) })
    );
    expect(response.status).toBe(503);
  });

  it("with the session in the cookie: checks the token, then answers 501, since it cannot find a session", async () => {
    const auth = createAuth(testConfig());
    const valid = await auth.handlers.backchannelLogout(
      post({ logout_token: await sign(claims()) })
    );
    expect(valid.status).toBe(501);
    await expect(valid.json()).resolves.toMatchObject({ error: "unsupported" });

    const invalid = await auth.handlers.backchannelLogout(
      post({ logout_token: await sign(claims({ aud: "tedris-test" })) })
    );
    expect(invalid.status).toBe(400);

    // The jti is remembered in memory there.
    const token = await sign(claims());
    await auth.handlers.backchannelLogout(post({ logout_token: token }));
    expect(
      (await auth.handlers.backchannelLogout(post({ logout_token: token })))
        .status
    ).toBe(400);
  });
});
