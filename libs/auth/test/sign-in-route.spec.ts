import { createAuth } from "../src/server";
import { resolveConfig } from "../src/server/config";
import { acceptedLocale, safeReturnTo } from "../src/server/return-to";
import { MAX_STARTS_PER_WINDOW } from "../src/server/routes";
import { deriveKey, unseal } from "../src/server/seal";
import {
  clock,
  ORIGIN,
  request,
  session,
  sessionCookieHeader,
  setCookie,
  testConfig,
} from "./support/fixtures";
import * as openid from "./support/openid-client";

vi.mock("openid-client", () => import("./support/openid-client"));

beforeEach(() => openid.resetOpenidClient());
afterEach(() => vi.restoreAllMocks());

const authorizeParams = () => {
  const [, parameters] = openid.buildAuthorizationUrl.mock.calls.at(-1) ?? [];
  return parameters as Record<string, string>;
};

const flowCookieOf = (response: Response) => {
  const line = response.headers
    .getSetCookie()
    .find((entry) => entry.startsWith("nazar.auth-flow."));
  if (!line) return undefined;
  const pair = line.split(";")[0] as string;
  return {
    name: pair.slice(0, pair.indexOf("=")),
    value: pair.slice(pair.indexOf("=") + 1),
    line: line.toLowerCase(),
  };
};

describe("GET /api/auth/signin", () => {
  it("starts a PKCE (S256) round trip with its own state and nonce", async () => {
    const { handlers } = createAuth(testConfig());
    const response = await handlers.signIn(
      request("/api/auth/signin?callbackUrl=%2Fders%2F42%3Ftab%3Dcelseler")
    );

    expect(response.status).toBe(303);
    const location = new URL(response.headers.get("location") as string);
    expect(location.origin).toBe("https://idp.example");
    expect(authorizeParams()).toEqual({
      redirect_uri: `${ORIGIN}/api/auth/callback/keycloak`,
      scope: "openid profile email",
      code_challenge: "S256(verifier-value)",
      code_challenge_method: "S256",
      state: "state0001abcdefghijklmnopqrstuvwxyz",
      nonce: "nonce-value",
    });

    // The verifier, state and nonce travel only in this round trip's own
    // sealed cookie, never in the URL.
    const flow = flowCookieOf(response);
    expect(flow?.name).toBe("nazar.auth-flow.state0001abcdefg");
    expect(flow?.line).toContain("httponly");
    expect(flow?.line).toContain("samesite=lax");
    expect(flow?.line).toContain("max-age=600");
    const key = await deriveKey("test-nextauth-secret", "nazar", "flow");
    await expect(
      unseal(flow?.value as string, key, clock.now)
    ).resolves.toMatchObject({
      state: "state0001abcdefghijklmnopqrstuvwxyz",
      nonce: "nonce-value",
      verifier: "verifier-value",
      returnTo: "/ders/42?tab=celseler",
    });
  });

  it("passes the UI locale as ui_locales, and as kc_locale behind the option", async () => {
    const plain = createAuth(testConfig());
    await plain.handlers.signIn(request("/api/auth/signin?locale=en"));
    expect(authorizeParams()).toMatchObject({ ui_locales: "en" });
    expect(authorizeParams()).not.toHaveProperty("kc_locale");

    const keycloak = createAuth(
      testConfig({ kcLocale: true, locales: ["tr", "en", "ar"] })
    );
    await keycloak.handlers.signIn(request("/api/auth/signin?locale=ar"));
    expect(authorizeParams()).toMatchObject({
      ui_locales: "ar",
      kc_locale: "ar",
    });

    await keycloak.handlers.signIn(request("/api/auth/signin?locale=de"));
    expect(authorizeParams()).not.toHaveProperty("ui_locales");
    expect(authorizeParams()).not.toHaveProperty("kc_locale");
  });

  it("asks for the registration form with prompt=create", async () => {
    const { handlers } = createAuth(testConfig());
    await handlers.signIn(request("/api/auth/signin?intent=register"));
    expect(authorizeParams()).toMatchObject({ prompt: "create" });
  });

  it.each([
    ["another origin", "https://evil.example/steal"],
    ["a protocol-relative URL", "//evil.example/steal"],
    ["a backslash path", "/\\evil.example/steal"],
    ["a script URL", "javascript:alert(1)"],
    ["the auth routes themselves", "/api/auth/signout"],
  ])("never sends the browser to %s after signing in", async (_, callbackUrl) => {
    const { handlers } = createAuth(
      testConfig({ pages: { signIn: "/auth/signin", afterSignIn: "/home" } })
    );
    const response = await handlers.signIn(
      request(`/api/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`)
    );
    const flow = flowCookieOf(response);
    const key = await deriveKey("test-nextauth-secret", "nazar", "flow");
    await expect(
      unseal(flow?.value as string, key, clock.now)
    ).resolves.toMatchObject({ returnTo: "/home" });
  });

  it("goes straight on when the browser is already signed in", async () => {
    const config = testConfig();
    const { handlers } = createAuth(config);
    const response = await handlers.signIn(
      request("/api/auth/signin?callbackUrl=%2Fbildirimler", {
        cookie: await sessionCookieHeader(config, session()),
      })
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/bildirimler`);
    expect(openid.buildAuthorizationUrl).not.toHaveBeenCalled();
    // Counted like a start: going on is not free.
    expect(setCookie(response, "nazar.auth-starts")?.value).toBe(
      `1.${clock.now}`
    );
  });

  it("stops going straight on at the cap, so a page that keeps sending a signed-in browser here cannot loop", async () => {
    const config = testConfig();
    const { handlers } = createAuth(config);
    const response = await handlers.signIn(
      request("/api/auth/signin?callbackUrl=%2Fbildirimler", {
        cookie: `${await sessionCookieHeader(config, session())}; nazar.auth-starts=${MAX_STARTS_PER_WINDOW}.${clock.now - 60_000}`,
      })
    );
    expect(response.headers.get("location")).toBe(
      `${ORIGIN}/auth/signin?error=SignInLimit&callbackUrl=%2Fbildirimler`
    );
    expect(openid.buildAuthorizationUrl).not.toHaveBeenCalled();
  });

  it("goes through the IdP for new tokens with reauth=1, though signed in, and counts it", async () => {
    const config = testConfig();
    const { handlers } = createAuth(config);
    const response = await handlers.signIn(
      request("/api/auth/signin?callbackUrl=%2Fbildirimler&reauth=1", {
        cookie: `${await sessionCookieHeader(config, session())}; nazar.auth-starts=2.${clock.now - 60_000}`,
      })
    );
    expect(new URL(response.headers.get("location") as string).origin).toBe(
      "https://idp.example"
    );
    expect(openid.buildAuthorizationUrl).toHaveBeenCalledTimes(1);
    // No prompt=login: a live SSO session answers silently with new tokens.
    expect(authorizeParams()).not.toHaveProperty("prompt");
    expect(setCookie(response, "nazar.auth-starts")?.value).toBe(
      `3.${clock.now - 60_000}`
    );
    const flow = flowCookieOf(response);
    const key = await deriveKey("test-nextauth-secret", "nazar", "flow");
    await expect(
      unseal(flow?.value as string, key, clock.now)
    ).resolves.toMatchObject({ returnTo: "/bildirimler" });
  });

  it("refuses reauth=1 at the cap like any start", async () => {
    const config = testConfig();
    const { handlers } = createAuth(config);
    const response = await handlers.signIn(
      request("/api/auth/signin?callbackUrl=%2Fbildirimler&reauth=1", {
        cookie: `${await sessionCookieHeader(config, session())}; nazar.auth-starts=${MAX_STARTS_PER_WINDOW}.${clock.now - 60_000}`,
      })
    );
    expect(response.headers.get("location")).toBe(
      `${ORIGIN}/auth/signin?error=SignInLimit&callbackUrl=%2Fbildirimler`
    );
    expect(openid.buildAuthorizationUrl).not.toHaveBeenCalled();
  });

  it("still goes to the registration form when signed in", async () => {
    const config = testConfig();
    const { handlers } = createAuth(config);
    await handlers.signIn(
      request("/api/auth/signin?intent=register", {
        cookie: await sessionCookieHeader(config, session()),
      })
    );
    expect(openid.buildAuthorizationUrl).toHaveBeenCalledTimes(1);
  });

  it("sends an IdP it cannot reach to the sign-in page as OAuthSignin", async () => {
    openid.discovery.mockRejectedValue(new TypeError("fetch failed"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { handlers } = createAuth(
      testConfig({
        pages: {
          signIn: (returnTo) => `/${returnTo?.split("/")[1]}/auth/signin`,
        },
      })
    );
    const response = await handlers.signIn(
      request("/api/auth/signin?callbackUrl=%2Fen%2Fcourses%2F7")
    );
    expect(response.headers.get("location")).toBe(
      `${ORIGIN}/en/auth/signin?error=OAuthSignin&callbackUrl=%2Fen%2Fcourses%2F7`
    );
  });

  it("counts the round trips a browser starts, and stops at the cap", async () => {
    const config = testConfig();
    const { handlers } = createAuth(config);
    const first = await handlers.signIn(request("/api/auth/signin"));
    expect(setCookie(first, "nazar.auth-starts")?.value).toBe(`1.${clock.now}`);

    const capped = await handlers.signIn(
      request("/api/auth/signin?callbackUrl=%2Fhesap", {
        cookie: `nazar.auth-starts=${MAX_STARTS_PER_WINDOW}.${clock.now - 60_000}`,
      })
    );
    expect(capped.headers.get("location")).toBe(
      `${ORIGIN}/auth/signin?error=SignInLimit&callbackUrl=%2Fhesap`
    );
    expect(openid.buildAuthorizationUrl).toHaveBeenCalledTimes(1);

    // The window passes: the count starts again.
    const later = await handlers.signIn(
      request("/api/auth/signin", {
        cookie: `nazar.auth-starts=${MAX_STARTS_PER_WINDOW}.${clock.now - 6 * 60_000}`,
      })
    );
    expect(later.headers.get("location")).toContain("https://idp.example");
  });

  it("keeps only the newest round trips open", async () => {
    const config = testConfig();
    const { handlers } = createAuth(config);
    const starts: string[] = [];
    for (let index = 0; index < 4; index++) {
      const response = await handlers.signIn(request("/api/auth/signin"));
      const flow = flowCookieOf(response);
      starts.push(`${flow?.name}=${flow?.value}`);
      clock.now += 1_000;
    }
    const response = await handlers.signIn(
      request("/api/auth/signin", { cookie: starts.join("; ") })
    );
    const removed = response.headers
      .getSetCookie()
      .filter(
        (line) => line.startsWith("nazar.auth-flow.") && /max-age=0/i.test(line)
      )
      .map((line) => line.slice(0, line.indexOf("=")));
    expect(removed).toEqual([
      "nazar.auth-flow.state0002abcdefg",
      "nazar.auth-flow.state0001abcdefg",
    ]);
  });

  it("names its cookies __Host- and Secure over https", async () => {
    const { handlers } = createAuth(
      testConfig({ baseUrl: "https://nazar.example" })
    );
    const response = await handlers.signIn(request("/api/auth/signin"));
    const flow = response.headers
      .getSetCookie()
      .find((line) => line.startsWith("__Host-nazar.auth-flow."));
    expect(flow?.toLowerCase()).toContain("secure");
    expect(flow?.toLowerCase()).toContain("path=/");
    expect(authorizeParams()).toMatchObject({
      redirect_uri: "https://nazar.example/api/auth/callback/keycloak",
    });
  });
});

describe("safeReturnTo", () => {
  it("keeps a same-origin path with its query and fragment", () => {
    expect(safeReturnTo("/ders/1?a=b#c", ORIGIN)).toBe("/ders/1?a=b#c");
    expect(safeReturnTo(`${ORIGIN}/hesap`, ORIGIN)).toBe("/hesap");
  });

  it("refuses everything else", () => {
    for (const value of [
      null,
      "",
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "javascript:alert(1)",
      "/api/auth/signin",
      "/ders\n/1",
      `/${"a".repeat(3000)}`,
    ]) {
      expect(safeReturnTo(value, ORIGIN)).toBeNull();
    }
  });
});

describe("acceptedLocale", () => {
  it("takes a listed locale or, without a list, a language tag", () => {
    expect(acceptedLocale("en", ["tr", "en"])).toBe("en");
    expect(acceptedLocale("de", ["tr", "en"])).toBeNull();
    expect(acceptedLocale("pt-BR", undefined)).toBe("pt-BR");
    expect(acceptedLocale("en&prompt=none", undefined)).toBeNull();
    expect(acceptedLocale(undefined, undefined)).toBeNull();
  });
});

describe("resolveConfig", () => {
  it("refuses a base URL with a path, which would change the redirect URI", () => {
    expect(() =>
      resolveConfig(testConfig({ baseUrl: "https://nazar.example/app" }))
    ).toThrow(/origin/);
  });
});
