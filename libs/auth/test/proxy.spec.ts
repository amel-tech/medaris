import { NextResponse } from "next/server";
import { createAuth } from "../src/server";
import { RETURN_TO_HEADER } from "../src/server/return-to";
import {
  clock,
  ORIGIN,
  request,
  session,
  sessionCookieHeader,
  setCookie,
  storedSessionOf,
  testConfig,
  tokens,
} from "./support/fixtures";
import * as openid from "./support/openid-client";

vi.mock("openid-client", () => import("./support/openid-client"));

beforeEach(() => {
  openid.resetOpenidClient();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

/** A session whose access token is inside the refresh window. */
const expiring = () => session({ accessTokenExpiresAt: clock.now + 30_000 });

describe("proxy: refresh", () => {
  it("refreshes a token with under a minute left, onto the request and the response", async () => {
    const config = testConfig();
    const auth = createAuth(config);
    openid.refreshTokenGrant.mockResolvedValue(tokens());

    const incoming = request("/ders/42?tab=celseler", {
      cookie: `${await sessionCookieHeader(config, expiring())}; other=1`,
    });
    const response = await auth.proxy(incoming);

    expect(openid.refreshTokenGrant).toHaveBeenCalledWith(
      openid.configuration,
      "refresh-1"
    );
    // The browser keeps the new session...
    await expect(storedSessionOf(config, response)).resolves.toMatchObject({
      accessToken: "access-new",
      refreshToken: "refresh-new",
      accessTokenExpiresAt: clock.now + 300_000,
    });
    // ...and the page rendered for this request reads it already.
    const forwarded = response.headers.get("x-middleware-request-cookie");
    expect(forwarded).toContain("other=1");
    expect(forwarded).toContain(
      `nazar.session=${setCookie(response, "nazar.session")?.value}`
    );
    expect(response.headers.get("x-middleware-set-cookie")).toContain(
      "nazar.session="
    );
    expect(response.headers.get("x-middleware-override-headers")).toContain(
      "cookie"
    );
    expect(
      response.headers.get(`x-middleware-request-${RETURN_TO_HEADER}`)
    ).toBe("/ders/42?tab=celseler");
  });

  it("refreshes once for parallel requests of one session", async () => {
    const config = testConfig();
    const auth = createAuth(config);
    const answer = deferred<ReturnType<typeof tokens>>();
    openid.refreshTokenGrant.mockReturnValue(answer.promise);
    const cookie = await sessionCookieHeader(config, expiring());

    const pending = [
      auth.proxy(request("/", { cookie })),
      auth.proxy(request("/hesap", { cookie })),
      auth.proxy(request("/api/decks", { cookie })),
    ];
    answer.resolve(tokens());
    const responses = await Promise.all(pending);

    expect(openid.refreshTokenGrant).toHaveBeenCalledTimes(1);
    for (const response of responses) {
      await expect(storedSessionOf(config, response)).resolves.toMatchObject({
        accessToken: "access-new",
      });
    }

    // A request that comes in just after, still carrying the old cookie,
    // gets the same new session rather than spending the old token again.
    const late = await auth.proxy(request("/", { cookie }));
    expect(openid.refreshTokenGrant).toHaveBeenCalledTimes(1);
    await expect(storedSessionOf(config, late)).resolves.toMatchObject({
      accessToken: "access-new",
    });
  });

  it("ends the session when the IdP refuses the refresh", async () => {
    const config = testConfig();
    const auth = createAuth(config);
    openid.refreshTokenGrant.mockRejectedValue({
      error: "invalid_grant",
      status: 400,
    });

    const response = await auth.proxy(
      request("/ders/42", {
        cookie: await sessionCookieHeader(config, expiring()),
      })
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      `${ORIGIN}/auth/signin?callbackUrl=%2Fders%2F42`
    );
    expect(setCookie(response, "nazar.session")?.attributes).toContain(
      "max-age=0"
    );
  });

  it("keeps a still-usable session when the IdP could not answer, and tries again", async () => {
    const config = testConfig();
    const auth = createAuth(config);
    openid.refreshTokenGrant.mockRejectedValue(new TypeError("fetch failed"));
    const cookie = await sessionCookieHeader(config, expiring());

    const response = await auth.proxy(request("/ders/42", { cookie }));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(setCookie(response, "nazar.session")).toBeUndefined();

    await auth.proxy(request("/ders/42", { cookie }));
    expect(openid.refreshTokenGrant).toHaveBeenCalledTimes(2);
  });

  it("ends a session whose token ran out while the IdP could not answer", async () => {
    const config = testConfig();
    const auth = createAuth(config);
    openid.refreshTokenGrant.mockRejectedValue(new TypeError("fetch failed"));
    const response = await auth.proxy(
      request("/ders/42", {
        cookie: await sessionCookieHeader(
          config,
          session({ accessTokenExpiresAt: clock.now - 1_000 })
        ),
      })
    );
    expect(response.headers.get("location")).toContain("/auth/signin");
    expect(setCookie(response, "nazar.session")?.attributes).toContain(
      "max-age=0"
    );
  });

  it("does not call the IdP for a refresh token past its deadline", async () => {
    const config = testConfig();
    const auth = createAuth(config);
    const response = await auth.proxy(
      request("/", {
        cookie: await sessionCookieHeader(
          config,
          session({
            accessTokenExpiresAt: clock.now - 1_000,
            refreshTokenExpiresAt: clock.now - 500,
          })
        ),
      })
    );
    expect(openid.refreshTokenGrant).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toContain("/auth/signin");
  });

  it("refuses a refresh that names another account", async () => {
    const config = testConfig();
    const auth = createAuth(config);
    openid.refreshTokenGrant.mockResolvedValue(
      tokens({ claims: { sub: "someone-else" } })
    );
    const response = await auth.proxy(
      request("/", { cookie: await sessionCookieHeader(config, expiring()) })
    );
    expect(response.headers.get("location")).toContain("/auth/signin");
  });
});

describe("proxy: the SSO check (MDRS-210)", () => {
  it("asks userinfo once the last check is a minute old, and stamps the session", async () => {
    const config = testConfig();
    const auth = createAuth(config);
    openid.fetchUserInfo.mockResolvedValue({ sub: "user-1" });

    const response = await auth.proxy(
      request("/", {
        cookie: await sessionCookieHeader(
          config,
          session({ checkedAt: clock.now - 61_000 })
        ),
      })
    );

    expect(openid.fetchUserInfo).toHaveBeenCalledWith(
      openid.configuration,
      "access-1",
      openid.skipSubjectCheck
    );
    await expect(storedSessionOf(config, response)).resolves.toMatchObject({
      checkedAt: clock.now,
      accessToken: "access-1",
    });
  });

  it("does not ask again within the minute", async () => {
    const config = testConfig();
    const auth = createAuth(config);
    const response = await auth.proxy(
      request("/", {
        cookie: await sessionCookieHeader(
          config,
          session({ checkedAt: clock.now - 30_000 })
        ),
      })
    );
    expect(openid.fetchUserInfo).not.toHaveBeenCalled();
    expect(setCookie(response, "nazar.session")).toBeUndefined();
  });

  it("does not ask in the refresh window, where the refresh answers it", async () => {
    const config = testConfig();
    const auth = createAuth(config);
    openid.refreshTokenGrant.mockResolvedValue(tokens());
    await auth.proxy(
      request("/", {
        cookie: await sessionCookieHeader(
          config,
          session({
            accessTokenExpiresAt: clock.now + 50_000,
            checkedAt: clock.now - 120_000,
          })
        ),
      })
    );
    expect(openid.fetchUserInfo).not.toHaveBeenCalled();
    expect(openid.refreshTokenGrant).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["a 401", () => Promise.reject({ status: 401, error: "invalid_token" })],
    ["another account", () => Promise.resolve({ sub: "someone-else" })],
  ])("ends the session on %s", async (_, answer) => {
    const config = testConfig();
    const auth = createAuth(config);
    openid.fetchUserInfo.mockImplementation(answer);
    const response = await auth.proxy(
      request("/hesap", {
        cookie: await sessionCookieHeader(
          config,
          session({ checkedAt: clock.now - 61_000 })
        ),
      })
    );
    expect(response.headers.get("location")).toBe(
      `${ORIGIN}/auth/signin?callbackUrl=%2Fhesap`
    );
    expect(setCookie(response, "nazar.session")?.attributes).toContain(
      "max-age=0"
    );
  });

  it("keeps the session when the IdP cannot be asked, stamped so it is not asked on every request", async () => {
    const config = testConfig();
    const auth = createAuth(config);
    openid.fetchUserInfo.mockRejectedValue({ status: 503 });
    const response = await auth.proxy(
      request("/", {
        cookie: await sessionCookieHeader(
          config,
          session({ checkedAt: clock.now - 61_000 })
        ),
      })
    );
    expect(response.headers.get("x-middleware-next")).toBe("1");
    await expect(storedSessionOf(config, response)).resolves.toMatchObject({
      checkedAt: clock.now,
    });
  });
});

describe("proxy: the gate", () => {
  it("sends a visitor on a protected page to sign-in, keeping the page", async () => {
    const auth = createAuth(testConfig());
    const response = await auth.proxy(request("/medrese/7/dersler?sayfa=2"));
    expect(response.headers.get("location")).toBe(
      `${ORIGIN}/auth/signin?callbackUrl=%2Fmedrese%2F7%2Fdersler%3Fsayfa%3D2`
    );
  });

  it("lets a visitor read a public page (MDRS-216)", async () => {
    const auth = createAuth(testConfig());
    const next = vi.fn(() => NextResponse.next());
    const response = await auth.proxy(request("/tr/discover"), {
      isPublicPath: (pathname) => pathname.endsWith("/discover"),
      next,
    });
    expect(next).toHaveBeenCalledTimes(1);
    expect(response.headers.get("location")).toBeNull();
  });

  it("never sends the sign-in page to itself", async () => {
    const auth = createAuth(testConfig());
    const response = await auth.proxy(request("/auth/signin?callbackUrl=%2F"));
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("does not redirect API routes or Server Actions; they answer for themselves", async () => {
    const auth = createAuth(testConfig());
    const next = vi.fn(() => NextResponse.next());
    const api = await auth.proxy(request("/api/decks/1"), { next });
    expect(api.headers.get("location")).toBeNull();
    expect(next).not.toHaveBeenCalled();

    const action = await auth.proxy(
      request("/ders/42", { method: "POST", headers: { "next-action": "abc" } })
    );
    expect(action.headers.get("location")).toBeNull();
  });

  it("leaves the sign-in, callback and sign-out routes alone, but renews for the session route", async () => {
    const config = testConfig();
    const auth = createAuth(config);
    openid.refreshTokenGrant.mockResolvedValue(tokens());
    const cookie = await sessionCookieHeader(config, expiring());

    for (const path of [
      "/api/auth/signin",
      "/api/auth/callback/keycloak?code=a&state=b",
      "/api/auth/signout",
    ]) {
      const response = await auth.proxy(request(path, { cookie }));
      expect(setCookie(response, "nazar.session")).toBeUndefined();
    }
    expect(openid.refreshTokenGrant).not.toHaveBeenCalled();

    const session = await auth.proxy(request("/api/auth/session", { cookie }));
    expect(openid.refreshTokenGrant).toHaveBeenCalledTimes(1);
    expect(setCookie(session, "nazar.session")).toBeDefined();
  });

  it("runs the app's own middleware for pages and keeps what it forwards", async () => {
    const config = testConfig();
    const auth = createAuth(config);
    openid.refreshTokenGrant.mockResolvedValue(tokens());
    // next-intl's shape: it copies the request's headers and adds its own.
    const next = vi.fn((incoming: Parameters<typeof auth.proxy>[0]) => {
      const headers = new Headers(incoming.headers);
      headers.set("x-next-intl-locale", "en");
      return NextResponse.rewrite(new URL("/en/home", ORIGIN), {
        request: { headers },
      });
    });

    const response = await auth.proxy(
      request("/home", {
        cookie: await sessionCookieHeader(config, expiring()),
      }),
      { next }
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(
      response.headers.get("x-middleware-request-x-next-intl-locale")
    ).toBe("en");
    expect(response.headers.get("x-middleware-request-cookie")).toContain(
      `nazar.session=${setCookie(response, "nazar.session")?.value}`
    );
    expect(
      response.headers.get("x-middleware-override-headers")?.split(",")
    ).toEqual(
      expect.arrayContaining(["cookie", "x-next-intl-locale", RETURN_TO_HEADER])
    );
  });

  it("removes a session cookie that does not open", async () => {
    const auth = createAuth(testConfig());
    const response = await auth.proxy(
      request("/auth/signin", { cookie: "nazar.session=garbage" })
    );
    expect(setCookie(response, "nazar.session")?.attributes).toContain(
      "max-age=0"
    );
  });
});
