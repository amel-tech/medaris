import { createAuth } from "../src/server";
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

/** Starts a round trip and returns the cookie and state the callback needs. */
async function startRoundTrip(
  auth: ReturnType<typeof createAuth>,
  query = "?callbackUrl=%2Fders%2F42"
) {
  const response = await auth.handlers.signIn(
    request(`/api/auth/signin${query}`)
  );
  const line = response.headers
    .getSetCookie()
    .find((entry) => entry.startsWith("nazar.auth-flow.")) as string;
  const cookie = line.split(";")[0] as string;
  const state = new URL(
    response.headers.get("location") as string
  ).searchParams.get("state") as string;
  return { cookie, state, name: cookie.slice(0, cookie.indexOf("=")) };
}

describe("GET /api/auth/callback/keycloak", () => {
  it("checks state, nonce and PKCE, stores the session and goes back", async () => {
    const config = testConfig();
    const auth = createAuth(config);
    const flow = await startRoundTrip(auth);
    openid.authorizationCodeGrant.mockResolvedValue(tokens());

    const response = await auth.handlers.callback(
      request(
        `/api/auth/callback/keycloak?code=abc&state=${flow.state}&iss=x`,
        {
          cookie: flow.cookie,
        }
      )
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/ders/42`);
    const [, currentUrl, checks] =
      openid.authorizationCodeGrant.mock.calls[0] ?? [];
    // The registered redirect URI, whatever host the request came in on.
    expect(`${(currentUrl as URL).origin}${(currentUrl as URL).pathname}`).toBe(
      `${ORIGIN}/api/auth/callback/keycloak`
    );
    expect((currentUrl as URL).searchParams.get("code")).toBe("abc");
    expect(checks).toEqual({
      expectedState: flow.state,
      expectedNonce: "nonce-value",
      pkceCodeVerifier: "verifier-value",
      idTokenExpected: true,
    });

    await expect(storedSessionOf(config, response)).resolves.toMatchObject({
      user: { sub: "user-1", name: "Ayşe Yılmaz" },
      accessToken: "access-new",
      refreshToken: "refresh-new",
      idToken: "id-token-new",
      checkedAt: clock.now,
    });
    const session = setCookie(response, "nazar.session");
    expect(session?.attributes).toEqual(
      expect.arrayContaining(["path=/", "httponly", "samesite=lax"])
    );
    // The round trip's cookie is spent.
    expect(setCookie(response, flow.name)?.attributes).toContain("max-age=0");
  });

  it("after an account action, holds the new tokens and goes back to the page that asked", async () => {
    const config = testConfig();
    const auth = createAuth(config);
    const flow = await startRoundTrip(
      auth,
      "?action=UPDATE_PROFILE&callbackUrl=%2Ftr%2Faccount%2Fpublic-profile"
    );
    // The tokens Keycloak issues once the profile form is saved: what the
    // person changed (since #317, the gender claim) is in them.
    openid.authorizationCodeGrant.mockResolvedValue(
      tokens({ access_token: "access-after-update-profile" })
    );

    const response = await auth.handlers.callback(
      request(
        `/api/auth/callback/keycloak?code=abc&state=${flow.state}&kc_action=UPDATE_PROFILE&kc_action_status=success`,
        {
          cookie: `${flow.cookie}; ${await sessionCookieHeader(config, session())}`,
        }
      )
    );

    expect(response.headers.get("location")).toBe(
      `${ORIGIN}/tr/account/public-profile`
    );
    await expect(storedSessionOf(config, response)).resolves.toMatchObject({
      accessToken: "access-after-update-profile",
      refreshToken: "refresh-new",
    });
  });

  it("does not let two tabs' round trips meet", async () => {
    const auth = createAuth(testConfig());
    const first = await startRoundTrip(auth, "?callbackUrl=%2Fbir");
    const second = await startRoundTrip(auth, "?callbackUrl=%2Fiki");
    openid.authorizationCodeGrant.mockResolvedValue(tokens());

    const response = await auth.handlers.callback(
      request(`/api/auth/callback/keycloak?code=abc&state=${first.state}`, {
        cookie: `${first.cookie}; ${second.cookie}`,
      })
    );
    expect(response.headers.get("location")).toBe(`${ORIGIN}/bir`);
  });

  it("answers an unknown state with OAuthCallback", async () => {
    const auth = createAuth(testConfig());
    const response = await auth.handlers.callback(
      request(
        "/api/auth/callback/keycloak?code=abc&state=stateUnknown0123456789"
      )
    );
    expect(response.headers.get("location")).toBe(
      `${ORIGIN}/auth/signin?error=OAuthCallback`
    );
    expect(openid.authorizationCodeGrant).not.toHaveBeenCalled();
  });

  it("lets a replayed callback of a signed-in browser go on quietly (MDRS-249 B)", async () => {
    const config = testConfig({
      pages: { signIn: "/auth/signin", afterSignIn: "/home" },
    });
    const auth = createAuth(config);
    const response = await auth.handlers.callback(
      request(
        "/api/auth/callback/keycloak?code=used&state=stateSpent0123456789",
        {
          cookie: await sessionCookieHeader(config, session()),
        }
      )
    );
    expect(response.headers.get("location")).toBe(`${ORIGIN}/home`);
  });

  it.each([
    [{ error: "access_denied" }, "AccessDenied"],
    [{ error: "invalid_client", status: 401 }, "Configuration"],
    [{ error: "invalid_grant", status: 400 }, "OAuthCallback"],
    [new TypeError("fetch failed"), "OAuthCallback"],
  ])("reports %o as %s on the sign-in page", async (failure, code) => {
    const auth = createAuth(testConfig());
    const flow = await startRoundTrip(auth);
    openid.authorizationCodeGrant.mockRejectedValue(failure);
    const response = await auth.handlers.callback(
      request(`/api/auth/callback/keycloak?code=abc&state=${flow.state}`, {
        cookie: flow.cookie,
      })
    );
    expect(response.headers.get("location")).toBe(
      `${ORIGIN}/auth/signin?error=${code}&callbackUrl=%2Fders%2F42`
    );
    expect(setCookie(response, "nazar.session")).toBeUndefined();
    expect(setCookie(response, flow.name)?.attributes).toContain("max-age=0");
  });

  it("splits a large session over several cookies", async () => {
    const config = testConfig();
    const auth = createAuth(config);
    const flow = await startRoundTrip(auth);
    openid.authorizationCodeGrant.mockResolvedValue(
      tokens({
        access_token: "a".repeat(2500),
        refresh_token: "r".repeat(1200),
        id_token: "i".repeat(2000),
      })
    );
    const response = await auth.handlers.callback(
      request(`/api/auth/callback/keycloak?code=abc&state=${flow.state}`, {
        cookie: flow.cookie,
      })
    );
    expect(setCookie(response, "nazar.session.0")).toBeDefined();
    expect(setCookie(response, "nazar.session.1")).toBeDefined();
    await expect(storedSessionOf(config, response)).resolves.toMatchObject({
      accessToken: "a".repeat(2500),
    });
  });
});
