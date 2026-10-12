import { createHash } from "node:crypto";
import { UnsecuredJWT } from "jose";
import { NextResponse } from "next/server";
import {
  createAuth,
  isUnauthenticated,
  SessionStoreUnavailableError,
} from "../src/server";
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
  sessionCookieHeader,
  setCookie,
  testConfig,
  tokens,
} from "./support/fixtures";
import { MemoryBackend } from "./support/memory-store";
import * as openid from "./support/openid-client";

/**
 * auth Phase 2: the session in Valkey, through the in-memory stand-in with
 * Redis's semantics (`support/memory-store.ts`). Two `createAuth` instances
 * sharing one stand-in are two replicas sharing one Valkey.
 */

vi.mock("openid-client", () => import("./support/openid-client"));

const rsc = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => {
  const jar = () =>
    rsc.cookie
      .split("; ")
      .filter(Boolean)
      .map((pair) => {
        const at = pair.indexOf("=");
        return { name: pair.slice(0, at), value: pair.slice(at + 1) };
      });
  return {
    cookies: async () => ({
      get: (name: string) => jar().find((cookie) => cookie.name === name),
      getAll: () => jar(),
    }),
    headers: async () => new Headers(),
  };
});
class Redirect extends Error {
  constructor(readonly url: string) {
    super(`redirect ${url}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Redirect(url);
  },
}));

const PREFIX = "test:auth:nazar:";
const noCookies = { get: () => undefined, getAll: () => [] };

let backend: MemoryBackend;
beforeEach(() => {
  openid.resetOpenidClient();
  backend = new MemoryBackend(() => clock.now);
  rsc.cookie = "";
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

const serverConfig = (overrides: Partial<AuthConfig> = {}) =>
  testConfig({ sessionStore: { backend, keyPrefix: "test" }, ...overrides });

/** An ID token as Keycloak shapes it: `sub` and the SSO session's `sid`. */
const idToken = (claims: Record<string, unknown>) =>
  new UnsecuredJWT(claims).encode();

const storedSession = (overrides: Partial<StoredSession> = {}) =>
  session({ idToken: idToken({ sub: "user-1", sid: "sso-1" }), ...overrides });

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

/** Stores `stored` as a sign-in would, and gives the browser's cookie header. */
async function signedIn(config: AuthConfig, stored = storedSession()) {
  const resolved = resolveConfig(config);
  const { writes } = await createSessionStore(
    resolved,
    createSessionCookie(resolved)
  ).create(noCookies, stored);
  return cookieHeader(writes);
}

/** The session the store holds for a cookie header, read as the app reads it. */
async function storedFor(config: AuthConfig, cookie: string) {
  const resolved = resolveConfig(config);
  const jar = new Map(
    cookie.split("; ").map((pair) => {
      const at = pair.indexOf("=");
      return [pair.slice(0, at), pair.slice(at + 1)] as const;
    })
  );
  const loaded = await createSessionStore(
    resolved,
    createSessionCookie(resolved)
  ).load({
    get: (name) => {
      const value = jar.get(name);
      return value === undefined ? undefined : { value };
    },
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
  });
  return loaded?.session ?? null;
}

const idOf = (cookie: string) => cookie.slice(cookie.indexOf("=") + 1);

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

/** A session whose access token is inside the refresh window. */
const expiring = (overrides: Partial<StoredSession> = {}) =>
  storedSession({ accessTokenExpiresAt: clock.now + 30_000, ...overrides });

describe("the session in Valkey", () => {
  it("signs in under a random id: the cookie holds only the id, the store the sealed session under its SHA-256", async () => {
    const config = serverConfig();
    const auth = createAuth(config);
    const started = await auth.handlers.signIn(
      request("/api/auth/signin?callbackUrl=%2Fders%2F42")
    );
    const flowCookie = started.headers
      .getSetCookie()
      .find((line) => line.startsWith("nazar.auth-flow."))
      ?.split(";")[0] as string;
    const state = new URL(
      started.headers.get("location") as string
    ).searchParams.get("state");
    openid.authorizationCodeGrant.mockResolvedValue(
      tokens({ id_token: idToken({ sub: "user-1", sid: "sso-1" }) })
    );

    const response = await auth.handlers.callback(
      request(`/api/auth/callback/keycloak?code=abc&state=${state}`, {
        cookie: flowCookie,
      })
    );

    expect(response.headers.get("location")).toBe(`${ORIGIN}/ders/42`);
    const cookie = setCookie(response, "nazar.session");
    expect(cookie?.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(cookie?.attributes).toEqual(
      expect.arrayContaining([
        "path=/",
        "httponly",
        "samesite=lax",
        "max-age=1800",
      ])
    );
    expect(setCookie(response, "nazar.session.0")).toBeUndefined();

    const id = cookie?.value as string;
    const hash = sha256(id);
    expect(backend.keys()).toEqual([
      `${PREFIX}s:${hash}`,
      `${PREFIX}sid:sso-1`,
      `${PREFIX}sub:user-1`,
    ]);
    // No key and no value names the id itself, and the tokens are sealed.
    const sealed = backend.raw(`${PREFIX}s:${hash}`) as string;
    expect(sealed.split(".")).toHaveLength(5);
    expect(JSON.stringify(backend.keys())).not.toContain(id);
    expect(sealed).not.toContain("access-new");
    expect(backend.raw(`${PREFIX}sid:sso-1`)).toEqual([hash]);
    expect(backend.raw(`${PREFIX}sub:user-1`)).toEqual([hash]);
    // The refresh token's life, on the entry and both indexes.
    for (const key of backend.keys()) {
      expect(backend.ttl(key)).toBe(1_800_000);
    }

    await expect(
      storedFor(config, `nazar.session=${id}`)
    ).resolves.toMatchObject({
      accessToken: "access-new",
      user: { sub: "user-1" },
    });
  });

  it("reads the session through the id, in the proxy and the session route, without writing the cookie again", async () => {
    const config = serverConfig();
    const auth = createAuth(config);
    const cookie = await signedIn(config);

    const page = await auth.proxy(request("/ders/42", { cookie }));
    expect(page.headers.get("x-middleware-next")).toBe("1");
    expect(setCookie(page, "nazar.session")).toBeUndefined();

    const read = await auth.handlers.session(
      request("/api/auth/session", { cookie })
    );
    await expect(read.json()).resolves.toMatchObject({
      user: { sub: "user-1" },
    });
  });

  it("ends a session the store no longer has, and removes its cookie", async () => {
    const auth = createAuth(serverConfig());
    const response = await auth.proxy(
      request("/ders/42", { cookie: `nazar.session=${"A".repeat(43)}` })
    );
    expect(response.headers.get("location")).toBe(
      `${ORIGIN}/auth/signin?callbackUrl=%2Fders%2F42`
    );
    expect(setCookie(response, "nazar.session")?.attributes).toContain(
      "max-age=0"
    );
  });

  it("refuses a store without a key prefix, and a URL that is not redis://, without repeating the password", () => {
    expect(() =>
      createAuth(
        testConfig({ sessionStore: { url: "redis://u:s3cret@valkey:6379/0" } })
      )
    ).toThrow(/WEB__AUTH_STORE_KEY_PREFIX/);
    expect(() =>
      createAuth(
        testConfig({
          sessionStore: { url: "http://u:s3cret@valkey", keyPrefix: "prod" },
        })
      )
    ).toThrow(/redis:\/\//);
    try {
      createAuth(
        testConfig({ sessionStore: { url: "redis://u:s3cret@valkey:6379/0" } })
      );
    } catch (error) {
      expect(String(error)).not.toContain("s3cret");
    }
    // An empty URL is no store: the cookie, as in Phase 1.
    expect(() =>
      createAuth(testConfig({ sessionStore: { url: "", keyPrefix: "" } }))
    ).not.toThrow();
  });

  it("warns once in production when there is no store, and carries on with the cookie", async () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      const config = testConfig({ sessionStore: { url: "" } });
      const auth = createAuth(config);
      const cookie = await sessionCookieHeader(config, session());
      for (const path of ["/ders/42", "/hesap"]) {
        const response = await auth.proxy(request(path, { cookie }));
        expect(response.headers.get("location")).toBeNull();
      }
      expect(console.warn).toHaveBeenCalledTimes(1);
      expect(vi.mocked(console.warn).mock.calls[0]?.[0]).toMatch(
        /back-channel logout is off/
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("the refresh, with Valkey", () => {
  it("stores the refreshed session under the same id and renews its TTL", async () => {
    const config = serverConfig();
    const auth = createAuth(config);
    const cookie = await signedIn(
      config,
      expiring({ refreshTokenExpiresAt: clock.now + 10 * 60_000 })
    );
    const hash = sha256(idOf(cookie));
    expect(backend.ttl(`${PREFIX}s:${hash}`)).toBe(600_000);
    openid.refreshTokenGrant.mockResolvedValue(tokens());

    const response = await auth.proxy(request("/ders/42", { cookie }));

    expect(openid.refreshTokenGrant).toHaveBeenCalledTimes(1);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    // The id stays; the cookie only gets the new lifetime.
    const renewed = setCookie(response, "nazar.session");
    expect(renewed?.value).toBe(idOf(cookie));
    expect(renewed?.attributes).toContain("max-age=1800");
    expect(backend.ttl(`${PREFIX}s:${hash}`)).toBe(1_800_000);
    // The refreshed ID token here names no `sid`; the session keeps the one
    // it had, so a back-channel logout still finds it.
    expect(backend.ttl(`${PREFIX}sid:sso-1`)).toBe(1_800_000);
    expect(backend.ttl(`${PREFIX}sub:user-1`)).toBe(1_800_000);
    await expect(storedFor(config, cookie)).resolves.toMatchObject({
      accessToken: "access-new",
      refreshToken: "refresh-new",
    });
  });

  it("refreshes once across two replicas: the lock's winner calls the IdP, the other reads what it stored", async () => {
    const config = serverConfig();
    const first = createAuth(config);
    const second = createAuth(config);
    const cookie = await signedIn(config, expiring());
    const answer = deferred<ReturnType<typeof tokens>>();
    openid.refreshTokenGrant.mockReturnValue(answer.promise);

    const winner = first.proxy(request("/ders/42", { cookie }));
    await vi.waitFor(() =>
      expect(openid.refreshTokenGrant).toHaveBeenCalledTimes(1)
    );
    expect(backend.keys()).toContain(`${PREFIX}lock:${sha256(idOf(cookie))}`);
    const loser = second.proxy(request("/hesap", { cookie }));
    await new Promise((resolve) => setTimeout(resolve, 30));
    answer.resolve(tokens());
    const [won, waited] = await Promise.all([winner, loser]);

    expect(openid.refreshTokenGrant).toHaveBeenCalledTimes(1);
    for (const response of [won, waited]) {
      expect(response.headers.get("location")).toBeNull();
      // Both renew the cookie under the same id: the loser saw the new session.
      expect(setCookie(response, "nazar.session")?.value).toBe(idOf(cookie));
    }
    await expect(storedFor(config, cookie)).resolves.toMatchObject({
      accessToken: "access-new",
    });
    // The lock is released.
    expect(backend.keys()).not.toContain(
      `${PREFIX}lock:${sha256(idOf(cookie))}`
    );
  });

  it("deletes the session and its index entries when the IdP refuses the refresh", async () => {
    const config = serverConfig();
    const auth = createAuth(config);
    const cookie = await signedIn(config, expiring());
    openid.refreshTokenGrant.mockRejectedValue({
      error: "invalid_grant",
      status: 400,
    });

    const response = await auth.proxy(request("/ders/42", { cookie }));

    expect(response.headers.get("location")).toContain("/auth/signin");
    expect(setCookie(response, "nazar.session")?.attributes).toContain(
      "max-age=0"
    );
    expect(backend.keys()).toEqual([]);
  });

  it("keeps a session another replica renewed while this one could not reach the IdP", async () => {
    const config = serverConfig();
    const auth = createAuth(config);
    // The access token has run out, so a refresh that cannot reach the IdP
    // would end the session.
    const cookie = await signedIn(
      config,
      storedSession({ accessTokenExpiresAt: clock.now - 1_000 })
    );
    const key = `${PREFIX}s:${sha256(idOf(cookie))}`;
    const renewedElsewhere = await signedIn(
      config,
      storedSession({ accessToken: "access-elsewhere" })
    );
    openid.refreshTokenGrant.mockImplementation(async () => {
      // Meanwhile another replica stores a newer session under this id.
      await backend.set(
        key,
        backend.raw(`${PREFIX}s:${sha256(idOf(renewedElsewhere))}`) as string,
        1_800_000
      );
      throw new TypeError("fetch failed");
    });

    const response = await auth.proxy(request("/ders/42", { cookie }));

    expect(response.headers.get("location")).toBeNull();
    expect(setCookie(response, "nazar.session")?.value).toBe(idOf(cookie));
    await expect(storedFor(config, cookie)).resolves.toMatchObject({
      accessToken: "access-elsewhere",
    });
  });

  it("does not ask userinfo once a minute with Valkey (back-channel logout does that job), and still does with the cookie", async () => {
    openid.fetchUserInfo.mockResolvedValue({ sub: "user-1" });
    const stale = { checkedAt: clock.now - 61_000 };

    const server = serverConfig();
    await createAuth(server).proxy(
      request("/ders/42", {
        cookie: await signedIn(server, storedSession(stale)),
      })
    );
    expect(openid.fetchUserInfo).not.toHaveBeenCalled();

    const cookieMode = testConfig();
    await createAuth(cookieMode).proxy(
      request("/ders/42", {
        cookie: await sessionCookieHeader(cookieMode, session(stale)),
      })
    );
    expect(openid.fetchUserInfo).toHaveBeenCalledTimes(1);
  });
});

describe("a Phase 1 cookie after the deploy", () => {
  it("is moved into the store on its first request: new id, chunks removed, still signed in", async () => {
    // Phase 1 sealed this session into two chunks, under the same secret and prefix.
    const phase1 = await sessionCookieHeader(
      testConfig(),
      session({ idToken: "i".repeat(5000) })
    );
    expect(phase1).toContain("nazar.session.0=");
    expect(phase1).toContain("nazar.session.1=");
    const config = serverConfig();
    const auth = createAuth(config);

    const response = await auth.proxy(request("/ders/42", { cookie: phase1 }));

    expect(response.headers.get("location")).toBeNull();
    const moved = setCookie(response, "nazar.session");
    expect(moved?.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(setCookie(response, "nazar.session.0")?.attributes).toContain(
      "max-age=0"
    );
    expect(setCookie(response, "nazar.session.1")?.attributes).toContain(
      "max-age=0"
    );
    // The page rendered for this request already reads the new cookie.
    const forwarded = response.headers.get("x-middleware-request-cookie");
    expect(forwarded).toContain(`nazar.session=${moved?.value}`);
    expect(forwarded).not.toContain("nazar.session.0=");
    await expect(
      storedFor(config, `nazar.session=${moved?.value}`)
    ).resolves.toMatchObject({
      accessToken: "access-1",
      user: { sub: "user-1" },
    });

    // A request the browser sent before it stored the new cookie gets the same id.
    const late = await auth.proxy(request("/hesap", { cookie: phase1 }));
    expect(setCookie(late, "nazar.session")?.value).toBe(moved?.value);
    expect(
      backend.keys().filter((key) => key.startsWith(`${PREFIX}s:`))
    ).toHaveLength(1);
  });
});

describe("a store that cannot be reached", () => {
  it("does not send a member of a protected page through the IdP, and keeps the cookie", async () => {
    const config = serverConfig();
    const auth = createAuth(config);
    const cookie = await signedIn(config);
    backend.down = true;

    const page = await auth.proxy(request("/ders/42", { cookie }));
    expect(page.headers.get("location")).toBeNull();
    expect(page.headers.get("x-middleware-next")).toBe("1");
    expect(setCookie(page, "nazar.session")).toBeUndefined();

    // The page's own read fails closed: the app's error page, not sign-in.
    rsc.cookie = cookie;
    await expect(auth.requireSession()).rejects.toBeInstanceOf(
      SessionStoreUnavailableError
    );
    await expect(auth.requireAccessToken()).rejects.toBeInstanceOf(
      SessionStoreUnavailableError
    );
    await expect(auth.withAccessToken(async () => "x")).rejects.toBeInstanceOf(
      SessionStoreUnavailableError
    );

    // The focus read says "could not ask" (503), not "signed out" (null).
    const read = await auth.handlers.session(
      request("/api/auth/session", { cookie })
    );
    expect(read.status).toBe(503);

    // "Giriş yap" does not start a round trip that could not be stored.
    const start = await auth.handlers.signIn(
      request("/api/auth/signin?callbackUrl=%2Fders%2F42", { cookie })
    );
    expect(start.headers.get("location")).toBe(
      `${ORIGIN}/auth/signin?error=OAuthSignin&callbackUrl=%2Fders%2F42`
    );
    expect(openid.buildAuthorizationUrl).not.toHaveBeenCalled();
  });

  it("renders a public page for a visitor", async () => {
    const config = serverConfig();
    const auth = createAuth(config);
    const cookie = await signedIn(config);
    backend.down = true;
    const next = vi.fn(() => NextResponse.next());

    const page = await auth.proxy(request("/tr/discover", { cookie }), {
      isPublicPath: (pathname) => pathname.endsWith("/discover"),
      next,
    });
    expect(next).toHaveBeenCalledTimes(1);
    expect(page.headers.get("location")).toBeNull();

    rsc.cookie = cookie;
    await expect(auth.auth()).resolves.toBeNull();
    await expect(auth.getAccessToken()).resolves.toBeUndefined();
  });

  it("still sends a visitor to sign in when the store answers", async () => {
    const auth = createAuth(serverConfig());
    const result = await auth.withAccessToken(async () => "x");
    expect(isUnauthenticated(result)).toBe(true);
    await expect(auth.requireSession()).rejects.toBeInstanceOf(Redirect);
  });
});

describe("sign-out, with Valkey", () => {
  it("deletes the store entry and its index entries, then ends the IdP session with the hint", async () => {
    const config = serverConfig();
    const auth = createAuth(config);
    const cookie = await signedIn(config);
    expect(backend.keys()).toHaveLength(3);

    const response = await auth.handlers.signOut(
      request("/api/auth/signout", {
        method: "POST",
        cookie,
        headers: { origin: ORIGIN },
      })
    );

    expect(backend.keys()).toEqual([]);
    expect(setCookie(response, "nazar.session")?.attributes).toContain(
      "max-age=0"
    );
    const target = new URL(response.headers.get("location") as string);
    expect(target.pathname).toBe("/realms/medaris/end-session");
    expect(target.searchParams.get("id_token_hint")).toBe(
      storedSession().idToken
    );
  });

  it("without the store, still removes the cookie and asks the IdP to end its session, with no hint", async () => {
    const config = serverConfig();
    const auth = createAuth(config);
    const cookie = await signedIn(config);
    backend.down = true;

    const response = await auth.handlers.signOut(
      request("/api/auth/signout", {
        method: "POST",
        cookie,
        headers: { origin: ORIGIN },
      })
    );

    expect(setCookie(response, "nazar.session")?.attributes).toContain(
      "max-age=0"
    );
    const target = new URL(response.headers.get("location") as string);
    expect(target.pathname).toBe("/realms/medaris/end-session");
    expect(target.searchParams.has("id_token_hint")).toBe(false);
  });
});
