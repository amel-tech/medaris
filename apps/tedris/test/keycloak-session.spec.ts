import {
  checkKeycloakSession,
  KEYCLOAK_SESSION_CHECK_INTERVAL_MS,
  KEYCLOAK_SESSION_ENDED_ERROR,
  type KeycloakSessionJwt,
  REFRESH_ACCESS_TOKEN_ERROR,
  refreshFailureError,
} from "@medaris/services/auth";
import type { AuthOptions, Session } from "next-auth";
import NextAuth from "next-auth";
import { decode, encode, type JWT } from "next-auth/jwt";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authCookies } from "~/lib/auth_cookies";
import authOptions from "~/lib/auth_options";

/**
 * MDRS-210: signing out of one Medaris app — or signing in as someone else
 * through Keycloak — must end this app's session too. Keycloak's
 * configuration is off limits, so the app asks Keycloak itself: `userinfo`
 * while the access token is fresh (at most once a minute), the refresh once
 * it has expired. Nothing here reaches a real Keycloak: `fetch` is stubbed.
 */

const ISSUER = "http://127.0.0.1:1/realms/test";
const USERINFO = `${ISSUER}/protocol/openid-connect/userinfo`;
const TOKEN = `${ISSUER}/protocol/openid-connect/token`;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

let fetchMock: ReturnType<typeof vi.fn>;
const stubFetch = (respond: (url: string) => Response | Promise<Response>) => {
  fetchMock = vi.fn(async (input: string | URL | Request) =>
    respond(String(input instanceof Request ? input.url : input))
  );
  vi.stubGlobal("fetch", fetchMock);
};
const calls = (url: string) =>
  fetchMock.mock.calls.filter(([input]) => String(input) === url).length;

beforeEach(() => {
  stubFetch(() => {
    throw new Error("unexpected fetch");
  });
  // The refresh logs its failures; the specs below provoke them on purpose.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const NOW = 1_800_000_000_000;

/** A signed-in session cookie's token: fresh access token, last check `ago` ms before NOW. */
const fresh = (ago: number, overrides: Partial<JWT> = {}): JWT =>
  ({
    name: "E2E Müderris",
    email: "muderris@example.test",
    sub: "user-a",
    accessToken: "access-a",
    accessTokenExpired: Date.now() + 5 * 60_000,
    refreshToken: "refresh-a",
    idToken: "id-a",
    user: { sub: "user-a" },
    ssoCheckedAt: Date.now() - ago,
    ...overrides,
  }) as JWT;

const expired = (overrides: Partial<JWT> = {}): JWT =>
  fresh(5 * 60_000, { accessTokenExpired: Date.now() - 1000, ...overrides });

const jwt = (token: JWT) =>
  authOptions.callbacks?.jwt?.({ token } as never) as Promise<JWT>;

const session = (token: JWT) =>
  authOptions.callbacks?.session?.({
    session: { user: { name: token.name }, expires: "2099-01-01" },
    token,
  } as never) as Promise<Session>;

describe("checkKeycloakSession", () => {
  const options = { issuer: ISSUER, now: NOW };
  const token = (checkedAt?: number): KeycloakSessionJwt => ({
    sub: "user-a",
    accessToken: "access-a",
    ssoCheckedAt: checkedAt,
  });

  it("does not ask Keycloak again within the interval", async () => {
    const recent = token(NOW - KEYCLOAK_SESSION_CHECK_INTERVAL_MS + 1);
    expect(await checkKeycloakSession(recent, options)).toBe(recent);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks Keycloak once the last confirmation is a minute old, and stamps a live session", async () => {
    stubFetch(() => json(200, { sub: "user-a" }));
    const stale = token(NOW - KEYCLOAK_SESSION_CHECK_INTERVAL_MS);

    const checked = await checkKeycloakSession(stale, options);

    expect(checked).toEqual({ ...stale, ssoCheckedAt: NOW });
    expect(checked.error).toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(USERINFO);
    expect(init.headers).toEqual({ Authorization: "Bearer access-a" });
  });

  it("checks a token that has never been checked (issued before MDRS-210)", async () => {
    stubFetch(() => json(200, { sub: "user-a" }));
    const checked = await checkKeycloakSession(token(undefined), options);
    expect(checked.ssoCheckedAt).toBe(NOW);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("marks the session ended when Keycloak answers 401 (signed out elsewhere)", async () => {
    stubFetch(() => json(401, { error: "invalid_token" }));
    const checked = await checkKeycloakSession(token(0), options);
    expect(checked.error).toBe(KEYCLOAK_SESSION_ENDED_ERROR);
  });

  it("marks the session ended when the token now belongs to someone else (switch user)", async () => {
    stubFetch(() => json(200, { sub: "user-b" }));
    const checked = await checkKeycloakSession(token(0), options);
    expect(checked.error).toBe(KEYCLOAK_SESSION_ENDED_ERROR);
  });

  it("keeps the session when Keycloak cannot be asked, and waits a full interval before asking again", async () => {
    for (const failure of [
      () => json(503, {}),
      () => json(403, { error: "insufficient_scope" }),
      () => {
        throw new TypeError("fetch failed");
      },
    ]) {
      stubFetch(failure);
      const checked = await checkKeycloakSession(token(0), options);
      expect(checked.error).toBeUndefined();
      expect(checked.ssoCheckedAt).toBe(NOW);
    }
  });

  it("leaves a token with a recorded failure, or without an access token, to the refresh", async () => {
    const failed = { ...token(0), error: REFRESH_ACCESS_TOKEN_ERROR };
    expect(await checkKeycloakSession(failed, options)).toBe(failed);
    const bare = { sub: "user-a" };
    expect(await checkKeycloakSession(bare, options)).toBe(bare);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("refreshFailureError", () => {
  it("reads Keycloak's invalid_grant as an ended session, everything else as a refresh failure", () => {
    expect(
      refreshFailureError({
        error: "invalid_grant",
        error_description: "Session not active",
      })
    ).toBe(KEYCLOAK_SESSION_ENDED_ERROR);
    expect(refreshFailureError({ error: "unauthorized_client" })).toBe(
      REFRESH_ACCESS_TOKEN_ERROR
    );
    expect(refreshFailureError(new Error("refresh token expired"))).toBe(
      REFRESH_ACCESS_TOKEN_ERROR
    );
    expect(refreshFailureError(undefined)).toBe(REFRESH_ACCESS_TOKEN_ERROR);
  });
});

describe("tedris's jwt and session callbacks", () => {
  it("valid: a recent check is trusted as it is, with no call to Keycloak", async () => {
    const token = fresh(10_000);
    expect(await jwt(token)).toBe(token);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("valid: a stale check that Keycloak confirms keeps the session", async () => {
    stubFetch(() => json(200, { sub: "user-a" }));
    const next = await jwt(fresh(KEYCLOAK_SESSION_CHECK_INTERVAL_MS + 1));
    expect(next.error).toBeUndefined();
    expect(Date.now() - next.ssoCheckedAt).toBeLessThan(1000);
    expect((await session(next)).user).toEqual({ name: "E2E Müderris" });
  });

  it("signed out elsewhere: the session callback hands out no session", async () => {
    stubFetch(() => json(401, { error: "invalid_token" }));
    const next = await jwt(fresh(KEYCLOAK_SESSION_CHECK_INTERVAL_MS + 1));
    expect(next.error).toBe(KEYCLOAK_SESSION_ENDED_ERROR);
    expect(await session(next)).toEqual({});
  });

  it("expired access token: a refresh Keycloak refuses with invalid_grant ends the session", async () => {
    stubFetch(() =>
      json(400, {
        error: "invalid_grant",
        error_description: "Session not active",
      })
    );
    const next = await jwt(expired());
    expect(calls(TOKEN)).toBe(1);
    expect(next.error).toBe(KEYCLOAK_SESSION_ENDED_ERROR);
    expect(await session(next)).toEqual({});
  });

  it("expired access token: any other refresh failure keeps the existing RefreshAccessTokenError", async () => {
    stubFetch(() => json(500, { error: "unknown_error" }));
    const next = await jwt(expired());
    expect(next.error).toBe(REFRESH_ACCESS_TOKEN_ERROR);
    // Still a session: RefreshErrorRedirect sends it back to Keycloak.
    expect((await session(next)).error).toBe(REFRESH_ACCESS_TOKEN_ERROR);
  });

  it("a failed refresh logs a summary at error level, never a token or the client secret (MDRS-231)", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    stubFetch(() =>
      json(400, {
        error: "invalid_grant",
        error_description: "Session not active",
      })
    );
    await jwt(expired());

    expect(log).not.toHaveBeenCalled();
    expect(vi.mocked(console.error).mock.calls).toEqual([
      [
        "Keycloak token refresh failed:",
        {
          status: 400,
          error: "invalid_grant",
          error_description: "Session not active",
        },
      ],
    ]);
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).not.toContain("refresh-a");
    expect(logged).not.toContain("test-secret");
  });

  it("a successful refresh confirms the session and takes the new id_token", async () => {
    stubFetch(() =>
      json(200, {
        access_token: "access-a2",
        expires_in: 300,
        refresh_token: "refresh-a2",
        refresh_expires_in: 1800,
        id_token: "id-a2",
      })
    );
    const next = await jwt(expired({ ssoCheckedAt: 0 }));
    expect(next.error).toBeUndefined();
    expect(next.accessToken).toBe("access-a2");
    expect(next.idToken).toBe("id-a2");
    expect(Date.now() - next.ssoCheckedAt).toBeLessThan(1000);
  });

  it("an ended session stays ended without asking Keycloak again, fresh or expired", async () => {
    for (const token of [
      fresh(KEYCLOAK_SESSION_CHECK_INTERVAL_MS * 10, {
        error: KEYCLOAK_SESSION_ENDED_ERROR,
      }),
      expired({ error: KEYCLOAK_SESSION_ENDED_ERROR }),
    ]) {
      const next = await jwt(token);
      expect(next.error).toBe(KEYCLOAK_SESSION_ENDED_ERROR);
      expect(await session(next)).toEqual({});
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a new sign-in starts a confirmed session of its own", async () => {
    const next = await authOptions.callbacks?.jwt?.({
      token: { name: "E2E Başmüderris", sub: "user-b" },
      user: { id: "user-b", sub: "user-b" },
      account: {
        access_token: "access-b",
        expires_at: Math.floor(Date.now() / 1000) + 300,
        refresh_token: "refresh-b",
        refresh_expires_in: 1800,
        id_token: "id-b",
      },
    } as never);
    expect(next.error).toBeUndefined();
    expect(next.sub).toBe("user-b");
    expect(Date.now() - (next.ssoCheckedAt as number)).toBeLessThan(1000);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/**
 * The whole path a browser takes, through NextAuth's own handler: the session
 * cookie of a user who signed out in another app goes in, an empty session and
 * a cookie the middleware refuses come out.
 */
describe("GET /api/auth/session after a sign-out elsewhere", () => {
  const SECRET = "test-nextauth-secret";
  const cookieName = authCookies?.sessionToken?.name as string;

  const getSession = async (token: JWT) => {
    const cookie = await encode({ token, secret: SECRET });
    const headers: Record<string, unknown> = {};
    let body: unknown;
    const res = {
      status: () => res,
      setHeader(key: string, value: unknown) {
        headers[key.toLowerCase()] = value;
        return res;
      },
      getHeader: (key: string) => headers[key.toLowerCase()],
      end() {},
      send(value: unknown) {
        body = value;
      },
      json(value: unknown) {
        body = value;
      },
    };
    const handler = NextAuth({
      ...(authOptions as AuthOptions),
    }) as unknown as (req: unknown, res: unknown) => Promise<void>;
    await handler(
      {
        method: "GET",
        query: { nextauth: ["session"] },
        headers: { host: "localhost" },
        cookies: { [cookieName]: cookie },
      },
      res
    );
    const setCookie = ([] as string[])
      .concat((headers["set-cookie"] as string[]) ?? [])
      .find((c) => c.startsWith(`${cookieName}=`));
    const written = setCookie?.split(";")[0].slice(cookieName.length + 1);
    return {
      body,
      written: written
        ? await decode({ token: written, secret: SECRET })
        : null,
    };
  };

  it("answers {} — what the client reads as signed out — and keeps the ended mark in the cookie", async () => {
    stubFetch(() => json(401, { error: "invalid_token" }));

    const { body, written } = await getSession(
      fresh(KEYCLOAK_SESSION_CHECK_INTERVAL_MS + 1)
    );

    expect(body).toEqual({});
    expect(written?.error).toBe(KEYCLOAK_SESSION_ENDED_ERROR);
    expect(calls(USERINFO)).toBe(1);
  });

  it("control: a session Keycloak confirms is served as before", async () => {
    stubFetch(() => json(200, { sub: "user-a" }));

    const { body, written } = await getSession(
      fresh(KEYCLOAK_SESSION_CHECK_INTERVAL_MS + 1)
    );

    expect((body as Session).user).toBeDefined();
    expect((body as Session).idToken).toBe("id-a");
    expect(written?.error).toBeUndefined();
  });
});
