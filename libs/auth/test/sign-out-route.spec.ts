import { createAuth } from "../src/server";
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

beforeEach(() => {
  openid.resetOpenidClient();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

const form = (fields: Record<string, string>) => {
  const body = new URLSearchParams(fields);
  return {
    method: "POST",
    body,
    headers: { "content-type": "application/x-www-form-urlencoded" },
  };
};

describe("POST /api/auth/signout", () => {
  it("clears the session and ends the IdP's with the ID token as the hint", async () => {
    const config = testConfig({ baseUrl: "http://localhost:4002" });
    const auth = createAuth(config);
    const cookie = await sessionCookieHeader(config, session());

    const response = await auth.handlers.signOut(
      request("/api/auth/signout", {
        ...form({ locale: "en" }),
        cookie,
        headers: {
          origin: ORIGIN,
          "content-type": "application/x-www-form-urlencoded",
        },
      })
    );

    expect(response.status).toBe(303);
    const target = new URL(response.headers.get("location") as string);
    expect(`${target.origin}${target.pathname}`).toBe(
      `${openid.IDP}/end-session`
    );
    expect(Object.fromEntries(target.searchParams)).toEqual({
      id_token_hint: "id-token-1",
      // What the Keycloak client has registered today: NEXTAUTH_URL, as given.
      post_logout_redirect_uri: "http://localhost:4002",
      ui_locales: "en",
    });
    expect(setCookie(response, "nazar.session")?.attributes).toContain(
      "max-age=0"
    );
  });

  it("signs out locally, never with an empty hint, when there is no ID token", async () => {
    const config = testConfig({
      pages: { signIn: "/auth/signin", afterSignOut: "/cikis" },
    });
    const auth = createAuth(config);
    const response = await auth.handlers.signOut(
      request("/api/auth/signout", {
        ...form({}),
        cookie: await sessionCookieHeader(
          config,
          session({ idToken: undefined })
        ),
      })
    );
    expect(response.headers.get("location")).toBe(`${ORIGIN}/cikis`);
    expect(openid.buildEndSessionUrl).not.toHaveBeenCalled();
    expect(setCookie(response, "nazar.session")?.attributes).toContain(
      "max-age=0"
    );
  });

  it("signs out locally when the IdP has no end-session endpoint", async () => {
    openid.configuration.serverMetadata.mockReturnValue({
      issuer: openid.IDP,
    } as ReturnType<typeof openid.configuration.serverMetadata>);
    const config = testConfig();
    const auth = createAuth(config);
    const response = await auth.handlers.signOut(
      request("/api/auth/signout", {
        ...form({}),
        cookie: await sessionCookieHeader(config, session()),
      })
    );
    expect(response.headers.get("location")).toBe(`${ORIGIN}/`);
  });

  it("refuses another site's form and a plain GET", async () => {
    const auth = createAuth(testConfig());
    const crossSite = await auth.handlers.signOut(
      request("/api/auth/signout", {
        ...form({}),
        headers: {
          origin: "https://evil.example",
          "content-type": "application/x-www-form-urlencoded",
        },
      })
    );
    expect(crossSite.status).toBe(403);
    const get = await auth.handlers.GET(request("/api/auth/signout"));
    expect(get.status).toBe(405);
  });
});

describe("GET /api/auth/session", () => {
  it("serves who is signed in, and no token", async () => {
    const config = testConfig();
    const auth = createAuth(config);
    const response = await auth.handlers.session(
      request("/api/auth/session", {
        cookie: await sessionCookieHeader(config, session()),
      })
    );
    expect(response.headers.get("cache-control")).toContain("no-store");
    const body = await response.json();
    expect(body).toEqual({
      user: { sub: "user-1", name: "Ayşe Yılmaz", email: "ayse@example.org" },
      expiresAt: clock.now + 4 * 60_000,
    });
    expect(JSON.stringify(body)).not.toMatch(/access-1|refresh-1|id-token-1/);
  });

  it("serves null for a visitor and for a session whose token has run out", async () => {
    const config = testConfig();
    const auth = createAuth(config);
    const visitor = await auth.handlers.GET(request("/api/auth/session"));
    await expect(visitor.json()).resolves.toBeNull();

    const expired = await auth.handlers.session(
      request("/api/auth/session", {
        cookie: await sessionCookieHeader(
          config,
          session({ accessTokenExpiresAt: clock.now - 1 })
        ),
      })
    );
    await expect(expired.json()).resolves.toBeNull();
  });
});
