import {
  RETURN_TO_HEADER,
  resetRenewalCache,
  sealSessionCookies,
  sessionFromTokenResponse,
} from "@medaris/auth/testing";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import proxy, { config } from "../proxy";

/**
 * tedris's `proxy.ts` (Next 16): an address from before MDRS-248 loses its
 * language, then `@medaris/auth`'s gate and renewal. Nothing here
 * reaches Keycloak: a live session was confirmed a moment ago (no `userinfo`
 * check due) and has minutes left (no refresh due), and a session that no
 * longer opens ends without asking anyone.
 *
 * `NEXTAUTH_URL` is http://localhost:4000 in the test env, so the cookie is
 * `tedris.session`, without the `__Host-` prefix plain http cannot carry.
 */

const ORIGIN = "http://localhost:4000";

const unsignedJwt = (claims: Record<string, unknown>) =>
  `e30.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;

/** A session the app wrote a moment ago, with five minutes left on its token. */
const liveCookie = async () =>
  (
    await sealSessionCookies(
      {
        baseUrl: ORIGIN,
        secret: "test-nextauth-secret",
        cookiePrefix: "tedris",
      },
      sessionFromTokenResponse({
        access_token: unsignedJwt({ sub: "talebe-1" }),
        refresh_token: "refresh-1",
        id_token: unsignedJwt({ sub: "talebe-1", name: "Ayşe Yılmaz" }),
        expires_in: 300,
        refresh_expires_in: 1800,
      })
    )
  ).header;

/** A session cookie that no longer opens: another secret, an old format. */
const deadCookie = "tedris.session=not-a-sealed-session";

const visit = (
  path: string,
  init: { cookie?: string; action?: boolean } = {}
) =>
  proxy(
    new NextRequest(new URL(path, ORIGIN), {
      headers: {
        ...(init.cookie ? { cookie: init.cookie } : {}),
        ...(init.action ? { "next-action": "abc123" } : {}),
      },
    })
  );

const signInRedirect = (response: Response) => {
  const location = response.headers.get("location");
  if (!location) return null;
  const url = new URL(location);
  return `${url.pathname}${url.search}`;
};

/** Whether the response removes the session cookie. */
const dropsSession = (response: Response) =>
  response.headers
    .getSetCookie()
    .some(
      (cookie) => /^tedris\.session=;/.test(cookie) && /Max-Age=0/i.test(cookie)
    );

// Every live session here carries the same access token.
beforeEach(() => resetRenewalCache());

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the matcher", () => {
  // Next anchors the source and reads it with path-to-regexp; a custom
  // group like this one is a plain regular expression.
  const matches = (path: string) =>
    config.matcher.some((source) => new RegExp(`^${source}$`).test(path));

  it.each([
    "/",
    "/discover",
    "/my-courses",
    "/decks/a.b",
    "/api/auth/session",
    "/api/lessons/l1/calendar",
    "/api/decks/d1/export",
    "/apiary",
    "/_nextthing",
  ])("runs on %s", (path) => {
    expect(matches(path)).toBe(true);
  });

  it.each([
    "/_next/static/chunks/app.js",
    "/_next/image",
    "/api/auth/signin",
    "/api/auth/callback/keycloak",
    "/api/auth/signout",
    // The IdP posts it server to server, with no cookie (auth Phase 2).
    "/api/auth/backchannel-logout",
    "/calendar/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.ics",
    "/favicon.ico",
    "/icon.svg",
    "/apple-icon.png",
    "/fonts/uthman/uthman.ttf",
    "/mocks/tedrisat.json",
  ])("leaves %s alone", (path) => {
    expect(matches(path)).toBe(false);
  });
});

describe("a visitor (MDRS-122, MDRS-216)", () => {
  it.each([
    "/discover",
    "/home",
    "/kosks/k1",
    "/madrasahs/m1",
    "/courses/c1",
    "/decks/d0000000-0000-4000-8000-000000000001",
    "/decks/study/d0000000-0000-4000-8000-000000000001",
    "/auth/signin",
    "/auth/register",
    "/auth/signout",
  ])("reads the public page %s", async (path) => {
    const response = await visit(path);
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("is sent to sign in from a protected page, in its language, and back to it", async () => {
    const response = await visit("/my-courses?tab=done");
    expect(response.status).toBe(307);
    expect(signInRedirect(response)).toBe(
      `/auth/signin?callbackUrl=${encodeURIComponent("/my-courses?tab=done")}`
    );
  });

  it("keeps a lesson behind the sign-in, whatever the course page shows", async () => {
    const response = await visit("/courses/c1/lessons/l1");
    expect(signInRedirect(response)).toBe(
      `/auth/signin?callbackUrl=${encodeURIComponent("/courses/c1/lessons/l1")}`
    );
  });

  it("gates a page with a dot in its path, which the old matcher skipped (B11)", async () => {
    const response = await visit("/decks/create.v2");
    expect(response.status).toBe(307);
  });

  it("is not redirected from an API route or a Server Action: they answer for themselves", async () => {
    expect((await visit("/api/lessons/l1/calendar")).status).toBe(200);
    expect((await visit("/my-courses", { action: true })).status).toBe(200);
  });
});

describe("a session that is over (MDRS-216)", () => {
  it("reads a public page as the visitor and drops the dead cookie", async () => {
    const response = await visit("/discover", { cookie: deadCookie });
    expect(response.status).toBe(200);
    expect(dropsSession(response)).toBe(true);
  });

  it("goes to sign in from a protected page and drops the dead cookie", async () => {
    const response = await visit("/schedule", { cookie: deadCookie });
    expect(signInRedirect(response)).toBe(
      `/auth/signin?callbackUrl=${encodeURIComponent("/schedule")}`
    );
    expect(dropsSession(response)).toBe(true);
  });
});

describe("a signed-in talebe", () => {
  it("reaches a protected page, and the page learns where it is for a later sign-in", async () => {
    const response = await visit("/my-courses", {
      cookie: await liveCookie(),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(
      response.headers.get(`x-middleware-request-${RETURN_TO_HEADER}`)
    ).toBe("/my-courses");
  });

  it("is served the page as asked, with no language added to the address", async () => {
    const response = await visit("/my-courses", { cookie: await liveCookie() });
    expect(response.headers.get("location")).toBeNull();
  });
});

describe("an address from before MDRS-248", () => {
  it("moves to the same page without the language, query kept", async () => {
    for (const locale of ["tr", "en", "ar"]) {
      const response = await visit(`/${locale}/courses/c1?tab=kayitlar`);
      expect(response.status).toBe(308);
      expect(signInRedirect(response)).toBe("/courses/c1?tab=kayitlar");
    }
    expect(signInRedirect(await visit("/en"))).toBe("/");
  });

  it("leaves a page whose first segment only looks like a language", async () => {
    expect((await visit("/trivia")).status).not.toBe(308);
  });
});
