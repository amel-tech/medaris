import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "~/app/api/auth/[...auth]/route";
import { endpoints, stubIdp } from "./idp";
import {
  cookieHeader,
  type StoredSession,
  sessionCookies,
  storedSession,
} from "./sealed-session";

/**
 * `app/api/auth/[...auth]/route.ts`: the four auth routes with nazar's own
 * values behind them (the Keycloak client's redirect URI and post-logout
 * address, the sign-in page, Turkish for Keycloak's pages). The session is a
 * real sealed cookie; Keycloak is a stubbed `fetch` (`./idp`).
 */
const ORIGIN = "http://localhost:4002";

const request = async (
  path: string,
  {
    session,
    method = "GET",
    body,
  }: { session?: Partial<StoredSession>; method?: string; body?: string } = {}
) => {
  const headers: Record<string, string> = { origin: ORIGIN };
  if (session) {
    headers.cookie = cookieHeader(
      await sessionCookies(storedSession(session), {
        secret: process.env.NEXTAUTH_SECRET as string,
      })
    );
  }
  if (body !== undefined) {
    headers["content-type"] = "application/x-www-form-urlencoded";
  }
  return new NextRequest(`${ORIGIN}${path}`, { method, headers, body });
};

const location = (response: Response) =>
  new URL(response.headers.get("location") as string);

const setCookies = (response: Response) =>
  response.headers.getSetCookie().map((cookie) => cookie.split(";")[0]);

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = stubIdp();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GET /api/auth/session", () => {
  it("is null for a visitor, and never cached", async () => {
    const response = await GET(await request("/api/auth/session"));
    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("is who is signed in, with no token in it (MDRS-28)", async () => {
    const response = await GET(
      await request("/api/auth/session", { session: {} })
    );
    const body = await response.json();
    expect(body).toMatchObject({
      user: {
        sub: "user-1",
        name: "Mehmet Emin Işıkoğlu",
        email: "mehmet@example.com",
      },
    });
    expect(JSON.stringify(body)).not.toMatch(/access-1|refresh-1|id-token-1/);
  });
});

describe("GET /api/auth/signin", () => {
  it("starts a round trip at the client's registered redirect URI, PKCE and all, with Keycloak's form in Turkish", async () => {
    const response = await GET(
      await request("/api/auth/signin?callbackUrl=%2Fhesap&locale=tr&auto=1")
    );

    expect(response.status).toBe(303);
    const target = location(response);
    expect(`${target.origin}${target.pathname}`).toBe(endpoints.authorization);
    expect(Object.fromEntries(target.searchParams)).toMatchObject({
      client_id: "nazar-test",
      response_type: "code",
      redirect_uri: "http://localhost:4002/api/auth/callback/keycloak",
      scope: "openid profile email",
      code_challenge_method: "S256",
      ui_locales: "tr",
      kc_locale: "tr",
    });
    expect(target.searchParams.get("state")).toBeTruthy();
    expect(target.searchParams.get("nonce")).toBeTruthy();
    const names = setCookies(response).map((cookie) => cookie.split("=")[0]);
    expect(names).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^nazar\.auth-flow\./),
        "nazar.auth-starts",
      ])
    );
  });

  it("passes on no locale nazar does not have", async () => {
    const response = await GET(
      await request("/api/auth/signin?callbackUrl=%2Fhesap&locale=en")
    );
    expect(location(response).searchParams.has("ui_locales")).toBe(false);
    expect(location(response).searchParams.has("kc_locale")).toBe(false);
  });

  it("goes straight on to the page when the browser is signed in already (another tab finished first)", async () => {
    const response = await GET(
      await request("/api/auth/signin?callbackUrl=%2Fhesap", { session: {} })
    );
    expect(response.status).toBe(303);
    expect(location(response).href).toBe(`${ORIGIN}/hesap`);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/auth/callback/keycloak", () => {
  it("sends a callback this browser did not start back to our sign-in page with the error", async () => {
    const response = await GET(
      await request(
        "/api/auth/callback/keycloak?code=x&state=AAAAAAAAAAAAAAAAAAAAAAAA"
      )
    );
    expect(response.status).toBe(303);
    const target = location(response);
    expect(target.pathname).toBe("/auth/signin");
    expect(target.searchParams.get("error")).toBe("OAuthCallback");
  });
});

describe("POST /api/auth/signout", () => {
  it("ends the session and goes to Keycloak's end-session with the ID token and the post-logout address the client has", async () => {
    const response = await POST(
      await request("/api/auth/signout", {
        method: "POST",
        session: {},
        body: "locale=tr",
      })
    );

    expect(response.status).toBe(303);
    const target = location(response);
    expect(`${target.origin}${target.pathname}`).toBe(endpoints.endSession);
    expect(Object.fromEntries(target.searchParams)).toMatchObject({
      id_token_hint: "id-token-1",
      post_logout_redirect_uri: "http://localhost:4002",
      ui_locales: "tr",
    });
    expect(setCookies(response)).toContain("nazar.session=");
  });

  it("signs out here only, back to `/`, when there is no session to name", async () => {
    const response = await POST(
      await request("/api/auth/signout", { method: "POST", body: "" })
    );
    expect(response.status).toBe(303);
    expect(location(response).href).toBe(`${ORIGIN}/`);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is not reachable with a GET", async () => {
    const response = await GET(await request("/api/auth/signout"));
    expect(response.status).toBe(405);
  });
});

it("answers 404 for anything else under /api/auth", async () => {
  expect((await GET(await request("/api/auth/providers"))).status).toBe(404);
  expect(
    (await POST(await request("/api/auth/session", { method: "POST" }))).status
  ).toBe(404);
});
