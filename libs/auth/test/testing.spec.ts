import { resolveConfig } from "../src/server/config";
import { createAuth } from "../src/server/create-auth";
import { createSessionCookie } from "../src/server/session-cookie";
import {
  cookieHeader,
  openSessionCookies,
  RETURN_TO_HEADER,
  resetRenewalCache,
  sealSessionCookies,
  sessionCookieName,
  sessionFromTokenResponse,
} from "../src/testing";
import { clock, request, session, testConfig } from "./support/fixtures";
import * as openid from "./support/openid-client";

/**
 * `@medaris/auth/testing`: what the apps' specs and Playwright helpers seal
 * is what the package reads, and the entry never reaches `server-only` (a
 * Playwright helper or a jsdom spec could not load it otherwise). The server
 * pieces below are imported past `src/server/index.ts`, which is the only
 * file that imports `server-only`.
 */
vi.mock("server-only", () => {
  throw new Error("@medaris/auth/testing reached server-only");
});
vi.mock("openid-client", () => import("./support/openid-client"));

beforeEach(() => {
  openid.resetOpenidClient();
  resetRenewalCache();
});

const unsignedJwt = (claims: Record<string, unknown>) =>
  `e30.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;

describe("sealSessionCookies", () => {
  it("writes the cookie the app reads as its session", async () => {
    const config = testConfig();
    const sealed = await sealSessionCookies(config, session());
    expect(sealed.cookies.map(({ name }) => name)).toEqual(["nazar.session"]);
    expect(sealed.secure).toBe(false);
    // Until the refresh token's deadline, as the app sets it.
    expect(sealed.maxAge).toBe(30 * 60);
    expect(sealed.header).toBe(cookieHeader(sealed.cookies));

    const response = await createAuth(config).handlers.session(
      request("/api/auth/session", { cookie: sealed.header })
    );
    await expect(response.json()).resolves.toEqual({
      user: { sub: "user-1", name: "Ayşe Yılmaz", email: "ayse@example.org" },
      expiresAt: clock.now + 4 * 60_000,
    });
  });

  it("chunks a large session exactly where the package does", async () => {
    const config = testConfig();
    const large = session({
      accessToken: "a".repeat(3000),
      refreshToken: "r".repeat(1500),
      idToken: "i".repeat(2500),
    });
    const sealed = await sealSessionCookies(config, large);
    const written = await createSessionCookie(resolveConfig(config)).writes(
      { get: () => undefined, getAll: () => [] },
      large
    );
    expect(sealed.cookies.map(({ name }) => name)).toEqual(
      written.map(({ name }) => name)
    );
    expect(sealed.cookies.length).toBeGreaterThan(1);
    expect(sealed.cookies.map(({ value }) => value.length)).toEqual(
      written.map(({ value }) => value.length)
    );
    // Read back from a Playwright-style list, other cookies and fields included.
    await expect(
      openSessionCookies(config, [
        { name: "other", value: "1" },
        ...sealed.cookies.map((cookie) => ({ ...cookie, path: "/" })),
      ])
    ).resolves.toEqual(large);
  });

  it("names them __Host- and Secure over https", async () => {
    const config = testConfig({ baseUrl: "https://nazar.example" });
    const sealed = await sealSessionCookies(config, session());
    expect(sealed.secure).toBe(true);
    expect(sealed.cookies[0]?.name).toBe("__Host-nazar.session");
    expect(sessionCookieName(config)).toBe("__Host-nazar.session");
    expect(sessionCookieName(testConfig())).toBe("nazar.session");
  });
});

describe("openSessionCookies", () => {
  it("opens a cookie header, and nothing sealed under another secret or app", async () => {
    const sealed = await sealSessionCookies(testConfig(), session());
    await expect(
      openSessionCookies(testConfig(), `a=b; ${sealed.header}`)
    ).resolves.toEqual(session());
    await expect(
      openSessionCookies(testConfig({ secret: "another" }), sealed.header)
    ).resolves.toBeNull();
    await expect(
      openSessionCookies(testConfig({ cookiePrefix: "tedris" }), sealed.header)
    ).resolves.toBeNull();
  });
});

describe("sessionFromTokenResponse", () => {
  it("builds the session the callback would store from a direct grant's answer", () => {
    const stored = sessionFromTokenResponse(
      {
        access_token: "access-token",
        expires_in: 300,
        refresh_token: "refresh-token",
        refresh_expires_in: 1800,
        id_token: unsignedJwt({
          sub: "talebe-1",
          name: "Ayşe Yılmaz",
          email: "ayse@example.org",
          preferred_username: "ayse",
          picture: "https://example.org/a.png",
        }),
      },
      clock.now
    );
    expect(stored).toEqual({
      v: 1,
      user: {
        sub: "talebe-1",
        name: "Ayşe Yılmaz",
        email: "ayse@example.org",
        username: "ayse",
        image: "https://example.org/a.png",
      },
      accessToken: "access-token",
      accessTokenExpiresAt: clock.now + 300_000,
      refreshToken: "refresh-token",
      refreshTokenExpiresAt: clock.now + 1_800_000,
      idToken: expect.stringMatching(/^e30\./),
      checkedAt: clock.now,
    });
  });

  it("reads refresh_expires_in: 0 as no deadline, and refuses a token with no subject", () => {
    const stored = sessionFromTokenResponse(
      {
        access_token: "a",
        expires_in: 300,
        refresh_token: "r",
        refresh_expires_in: 0,
        id_token: unsignedJwt({ sub: "s" }),
      },
      clock.now
    );
    expect(stored.refreshTokenExpiresAt).toBeUndefined();
    expect(() =>
      sessionFromTokenResponse({
        access_token: "a",
        id_token: unsignedJwt({}),
      })
    ).toThrow(/no subject/);
  });
});

describe("resetRenewalCache", () => {
  it("makes the proxy ask userinfo again about a token it answered for a moment ago", async () => {
    const config = testConfig();
    const auth = createAuth(config);
    openid.fetchUserInfo.mockResolvedValue({ sub: "user-1" });
    const { header } = await sealSessionCookies(
      config,
      session({ checkedAt: clock.now - 61_000 })
    );

    await auth.proxy(request("/", { cookie: header }));
    await auth.proxy(request("/", { cookie: header }));
    // The same token within ten seconds: the verdict is reused.
    expect(openid.fetchUserInfo).toHaveBeenCalledTimes(1);

    resetRenewalCache();
    await auth.proxy(request("/", { cookie: header }));
    expect(openid.fetchUserInfo).toHaveBeenCalledTimes(2);
  });
});

describe("the names an app's specs need", () => {
  it("exports the return-path header the proxy sets", () => {
    expect(RETURN_TO_HEADER).toBe("x-medaris-auth-return-to");
  });
});
