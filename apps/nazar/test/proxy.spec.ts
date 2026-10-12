import { createRequire } from "node:module";
import { RETURN_TO_HEADER, resetRenewalCache } from "@medaris/auth/testing";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import proxy, { config } from "../proxy";
import { json, requested, stubIdp } from "./idp";
import {
  cookieHeader,
  type StoredSession,
  sessionCookies,
  storedSession,
} from "./sealed-session";

/**
 * nazar's `proxy.ts`: the matcher Next compiles, and what the real
 * `@medaris/auth` proxy does with nazar's config behind it. The session is a
 * real sealed cookie; Keycloak is a stubbed `fetch` (`./idp`).
 */

// The engine Next compiles the matcher with. Untyped on purpose: it ships no
// declarations, and a hand-written regex would test our own guess.
const { pathToRegexp } = createRequire(import.meta.url)(
  "next/dist/compiled/path-to-regexp"
) as { pathToRegexp: (source: string) => RegExp };

const matches = (pathname: string) =>
  config.matcher.some((source) => pathToRegexp(source).test(pathname));

const ORIGIN = "http://localhost:4002";

const request = async (
  path: string,
  {
    session,
    headers = {},
    method = "GET",
  }: {
    session?: Partial<StoredSession>;
    headers?: Record<string, string>;
    method?: string;
  } = {}
) => {
  const cookie = session
    ? cookieHeader(await sessionCookies(storedSession(session)))
    : undefined;
  return new NextRequest(`${ORIGIN}${path}`, {
    method,
    headers: { ...headers, ...(cookie ? { cookie } : {}) },
  });
};

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  resetRenewalCache();
  fetchMock = stubIdp();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const signInTarget = (response: Response) => {
  const location = new URL(response.headers.get("location") as string);
  return {
    pathname: location.pathname,
    callbackUrl: location.searchParams.get("callbackUrl"),
  };
};

describe("the matcher", () => {
  it("keeps the sign-in and sign-out pages out, so they open without a session", () => {
    for (const path of ["/auth/signin", "/auth/signout", "/auth/yok"]) {
      expect(matches(path)).toBe(false);
    }
  });

  it("keeps out the auth routes that manage the cookie themselves, the build output and files", () => {
    for (const path of [
      "/api/auth/signin",
      "/api/auth/signout",
      "/api/auth/callback/keycloak",
      "/_next/static/chunks/main.js",
      "/favicon.ico",
      "/icon.svg",
      "/apple-icon.png",
      "/uthman/uthman.ttf",
    ]) {
      expect(matches(path)).toBe(false);
    }
  });

  it("keeps /api/auth/session in: a tab shown again reads it, and that is where a sign-out elsewhere is noticed", () => {
    expect(matches("/api/auth/session")).toBe(true);
  });

  it("puts every other page behind the session, each exclusion ending at a slash (B11)", () => {
    for (const path of [
      "/",
      "/erisim-yok",
      "/hesap",
      "/bildirimler",
      "/medrese/m1",
      "/medrese/m1/dersler",
      "/ders/c1/celseler",
      // Only the `auth` and `_next` segments are left out, not a page that starts with them.
      "/authors",
      "/_nextish",
      // A page whose address holds a dot is a page, not a file.
      "/ders/v1.2",
    ]) {
      expect(matches(path)).toBe(true);
    }
  });
});

describe("the session gate", () => {
  it("sends a signed-out visitor to our sign-in page, keeping the page and its query", async () => {
    const response = await proxy(
      await request("/medrese/m1/dersler?sekme=bekleyen")
    );

    expect(response.status).toBe(307);
    expect(signInTarget(response)).toEqual({
      pathname: "/auth/signin",
      callbackUrl: "/medrese/m1/dersler?sekme=bekleyen",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lets a signed-in request through as it is, with the page it serves for `requireSession`, and asks Keycloak nothing within the minute", async () => {
    const response = await proxy(await request("/hesap", { session: {} }));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(
      response.headers.get(`x-middleware-request-${RETURN_TO_HEADER}`)
    ).toBe("/hesap");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never redirects a Server Action or /api/auth/session: they answer for themselves", async () => {
    const action = await proxy(
      await request("/medrese/m1/ayarlar", {
        method: "POST",
        headers: { "next-action": "abc123" },
      })
    );
    expect(action.headers.get("x-middleware-next")).toBe("1");
    expect(action.headers.get("location")).toBeNull();

    const session = await proxy(await request("/api/auth/session"));
    expect(session.headers.get("x-middleware-next")).toBe("1");
    expect(session.headers.get("location")).toBeNull();
  });

  it("removes a session cookie that does not open, and sends the visitor to sign in", async () => {
    const response = await proxy(
      new NextRequest(`${ORIGIN}/hesap`, {
        headers: { cookie: "nazar.session=not-a-sealed-session" },
      })
    );

    expect(response.status).toBe(307);
    expect(signInTarget(response).pathname).toBe("/auth/signin");
    expect(response.headers.get("set-cookie")).toMatch(
      /^nazar\.session=;.*Max-Age=0/
    );
  });
});

describe("a sign-out in another Medaris app (MDRS-210)", () => {
  const checkedLongAgo = { checkedAt: Date.now() - 2 * 60_000 };

  it("ends nazar's session too once Keycloak's userinfo says 401", async () => {
    fetchMock = stubIdp({ userinfo: () => json(401, {}) });
    const response = await proxy(
      await request("/ders/c1/celseler", { session: checkedLongAgo })
    );

    expect(requested(fetchMock)).toContain(
      "http://127.0.0.1:1/realms/test/protocol/openid-connect/userinfo"
    );
    expect(response.status).toBe(307);
    expect(signInTarget(response)).toEqual({
      pathname: "/auth/signin",
      callbackUrl: "/ders/c1/celseler",
    });
    expect(response.headers.get("set-cookie")).toMatch(
      /^nazar\.session=;.*Max-Age=0/
    );
  });

  it("keeps the session, stamped, when Keycloak confirms it", async () => {
    fetchMock = stubIdp({ userinfo: () => json(200, { sub: "user-1" }) });
    // Another token: a verdict is shared for a few seconds per token.
    const response = await proxy(
      await request("/ders/c1/celseler", {
        session: { ...checkedLongAgo, accessToken: "access-2" },
      })
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
    // The stamp is written for the browser and for this request's render.
    expect(response.headers.get("set-cookie")).toMatch(/^nazar\.session=ey/);
    expect(response.headers.get("x-middleware-request-cookie")).toMatch(
      /nazar\.session=ey/
    );
  });
});
