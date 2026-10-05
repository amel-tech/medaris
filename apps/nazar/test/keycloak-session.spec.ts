import {
  KEYCLOAK_SESSION_CHECK_INTERVAL_MS,
  KEYCLOAK_SESSION_ENDED_ERROR,
  REFRESH_ACCESS_TOKEN_ERROR,
} from "@medaris/services/auth";
import type { AuthOptions, Session } from "next-auth";
import NextAuth from "next-auth";
import { decode, encode, type JWT } from "next-auth/jwt";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authCookies } from "~/lib/auth_cookies";
import authOptions, { getAccessToken } from "~/lib/auth_options";

/**
 * MDRS-210: a sign-out (or a switch of account) in another Medaris app must
 * end nazir's session too. The check itself is shared and specified in
 * tedris-web's `keycloak-session.spec.ts`; this file holds nazir's wiring to
 * it — the `jwt` and `session` callbacks, NextAuth's session endpoint and
 * `getAccessToken`. `fetch` is stubbed: nothing reaches a real Keycloak.
 */

const SECRET = "test-nextauth-secret";
const cookieName = authCookies?.sessionToken?.name as string;
const cookieJar = vi.hoisted(() => ({ name: "", value: "" }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () =>
      cookieJar.value ? [{ name: cookieJar.name, value: cookieJar.value }] : [],
  }),
}));

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

let fetchMock: ReturnType<typeof vi.fn>;
const stubFetch = (respond: () => Response) => {
  fetchMock = vi.fn(async () => respond());
  vi.stubGlobal("fetch", fetchMock);
};
const urls = () => fetchMock.mock.calls.map(([input]) => String(input));

beforeEach(() => {
  stubFetch(() => {
    throw new Error("unexpected fetch");
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  cookieJar.value = "";
  cookieJar.name = cookieName;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const token = (checkedAgo: number, overrides: Partial<JWT> = {}): JWT =>
  ({
    name: "E2E Müderris",
    sub: "user-a",
    accessToken: "access-a",
    accessTokenExpired: Date.now() + 5 * 60_000,
    refreshToken: "refresh-a",
    idToken: "id-a",
    user: { sub: "user-a" },
    ssoCheckedAt: Date.now() - checkedAgo,
    ...overrides,
  }) as JWT;
const stale = () => token(KEYCLOAK_SESSION_CHECK_INTERVAL_MS + 1);
const expired = () => token(0, { accessTokenExpired: Date.now() - 1000 });

const jwt = (t: JWT) =>
  authOptions.callbacks?.jwt?.({ token: t } as never) as Promise<JWT>;
const session = (t: JWT) =>
  authOptions.callbacks?.session?.({
    session: { user: { name: t.name }, expires: "2099-01-01" },
    token: t,
  } as never) as Promise<Session>;

describe("nazir's callbacks and the Keycloak session (MDRS-210)", () => {
  it("valid: a check within the minute is trusted with no call to Keycloak", async () => {
    const t = token(10_000);
    expect(await jwt(t)).toBe(t);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("valid: a stale check Keycloak confirms keeps the session", async () => {
    stubFetch(() => json(200, { sub: "user-a" }));
    const next = await jwt(stale());
    expect(next.error).toBeUndefined();
    expect((await session(next)).user).toBeDefined();
    expect(urls()).toEqual([
      "http://127.0.0.1:1/realms/test/protocol/openid-connect/userinfo",
    ]);
  });

  it("signed out elsewhere: userinfo 401 leaves no session", async () => {
    stubFetch(() => json(401, {}));
    const next = await jwt(stale());
    expect(next.error).toBe(KEYCLOAK_SESSION_ENDED_ERROR);
    expect(await session(next)).toEqual({});
  });

  it("switch user: a token that now answers for someone else leaves no session", async () => {
    stubFetch(() => json(200, { sub: "user-b" }));
    expect(await session(await jwt(stale()))).toEqual({});
  });

  it("expired: invalid_grant on refresh ends the session; other failures keep RefreshAccessTokenError", async () => {
    stubFetch(() => json(400, { error: "invalid_grant" }));
    expect((await jwt(expired())).error).toBe(KEYCLOAK_SESSION_ENDED_ERROR);

    stubFetch(() => json(502, {}));
    expect((await jwt(expired())).error).toBe(REFRESH_ACCESS_TOKEN_ERROR);
  });

  it("a failed refresh logs a summary at error level, never a token or the client secret (MDRS-231)", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    stubFetch(() => json(400, { error: "invalid_grant" }));
    await jwt(expired());

    expect(log).not.toHaveBeenCalled();
    expect(vi.mocked(console.error).mock.calls).toEqual([
      [
        "Keycloak token refresh failed:",
        { status: 400, error: "invalid_grant" },
      ],
    ]);
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).not.toContain("refresh-a");
    expect(logged).not.toContain("test-secret");
  });

  it("an ended session never calls Keycloak again", async () => {
    const next = await jwt(
      token(KEYCLOAK_SESSION_CHECK_INTERVAL_MS * 10, {
        error: KEYCLOAK_SESSION_ENDED_ERROR,
      })
    );
    expect(await session(next)).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("nazir's endpoints after a sign-out elsewhere (MDRS-210)", () => {
  it("GET /api/auth/session answers {} and writes the ended mark into the cookie", async () => {
    stubFetch(() => json(401, {}));
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
        cookies: {
          [cookieName]: await encode({ token: stale(), secret: SECRET }),
        },
      },
      res
    );

    expect(body).toEqual({});
    const written = ([] as string[])
      .concat(headers["set-cookie"] as string[])
      .find((c) => c.startsWith(`${cookieName}=`))
      ?.split(";")[0]
      ?.slice(cookieName.length + 1);
    expect(
      (await decode({ token: written as string, secret: SECRET }))?.error
    ).toBe(KEYCLOAK_SESSION_ENDED_ERROR);
  });

  it("getAccessToken() hands server code no token once the session has ended", async () => {
    stubFetch(() => json(401, {}));
    cookieJar.value = await encode({ token: stale(), secret: SECRET });
    expect(await getAccessToken()).toBeUndefined();

    stubFetch(() => json(200, { sub: "user-a" }));
    expect(await getAccessToken()).toBe("access-a");
  });
});
