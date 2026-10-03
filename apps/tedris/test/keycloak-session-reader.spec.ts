import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * MDRS-210, the server half: `getAccessToken()` reads the cookie without
 * NextAuth's callbacks, so it must run the same Keycloak check itself — or a
 * server component would go on calling the API as a user who has signed out
 * in another app, until that user's access token expired.
 */
const mocks = vi.hoisted(() => ({ getToken: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({}) }));
vi.mock("next-auth/jwt", () => ({ getToken: mocks.getToken }));

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const cookieToken = (overrides: Record<string, unknown> = {}) => ({
  sub: "user-a",
  accessToken: "access-a",
  accessTokenExpired: Date.now() + 5 * 60_000,
  refreshToken: "refresh-a",
  ssoCheckedAt: 0,
  ...overrides,
});

describe("getAccessToken and the Keycloak session (MDRS-210)", () => {
  it("returns no token once Keycloak says the session is gone", async () => {
    const fetchMock = vi.fn(async (_url: string) => json(401, {}));
    vi.stubGlobal("fetch", fetchMock);
    mocks.getToken.mockResolvedValue(cookieToken());
    const { getAccessToken } = await import("~/lib/auth_options");

    expect(await getAccessToken()).toBeUndefined();
    expect(String(fetchMock.mock.calls[0][0])).toMatch(
      /\/protocol\/openid-connect\/userinfo$/
    );
  });

  it("returns the token while Keycloak confirms the session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json(200, { sub: "user-a" }))
    );
    mocks.getToken.mockResolvedValue(cookieToken());
    const { getAccessToken } = await import("~/lib/auth_options");

    expect(await getAccessToken()).toBe("access-a");
  });

  it("does not ask Keycloak when the cookie was confirmed within the minute", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    mocks.getToken.mockResolvedValue(
      cookieToken({ ssoCheckedAt: Date.now() - 5_000 })
    );
    const { getAccessToken } = await import("~/lib/auth_options");

    expect(await getAccessToken()).toBe("access-a");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses an ended session without a call to Keycloak", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    mocks.getToken.mockResolvedValue(
      cookieToken({ error: "KeycloakSessionEnded" })
    );
    const { getAccessToken } = await import("~/lib/auth_options");

    expect(await getAccessToken()).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
