import { createRequire } from "node:module";
import { NextRequest } from "next/server";
import type { NextRequestWithAuth } from "next-auth/middleware";
import { describe, expect, it } from "vitest";
import authOptions from "~/lib/auth_options";
import { authPages } from "~/lib/auth_pages";
import middleware, { config } from "../middleware";
import { nextAuthGet } from "./next-auth-harness";

// The engine Next compiles the middleware matcher with. Untyped on purpose:
// it ships no declarations, and a hand-written regex would test our own guess.
const { pathToRegexp } = createRequire(import.meta.url)(
  "next/dist/compiled/path-to-regexp"
) as { pathToRegexp: (source: string) => RegExp };

const matches = (pathname: string) =>
  config.matcher.some((source) => pathToRegexp(source).test(pathname));

describe("no English NextAuth page on the way in or out (MDRS-101)", () => {
  it("points every page NextAuth would render at one of ours", () => {
    expect(authOptions.pages).toEqual(authPages);
  });

  it("GET /api/auth/signin, /signout and /error redirect to our pages", async () => {
    const signin = await nextAuthGet(authOptions, "signin");
    expect(signin.status).toBe(302);
    expect(signin.location).toMatch(/^\/auth\/signin\?callbackUrl=/);

    const signout = await nextAuthGet(authOptions, "signout");
    expect(signout.location).toBe("/auth/signout");

    const error = await nextAuthGet(authOptions, "error", {
      error: "AccessDenied",
    });
    expect(error.location).toBe("/auth/error?error=AccessDenied");
  });

  it("a failed Keycloak callback ends on our sign-in page, error attached", async () => {
    const result = await nextAuthGet(authOptions, "signin", {
      error: "OAuthCallback",
    });
    expect(result.location).toMatch(
      /^\/auth\/signin\?callbackUrl=.*&error=OAuthCallback$/
    );
  });

  it("control: without `pages` NextAuth renders its English HTML", async () => {
    const result = await nextAuthGet({ ...authOptions, pages: {} }, "signin");
    expect(result.status).toBe(200);
    expect(String(result.body)).toMatch(/Sign in/);
  });
});

describe("the session gate", () => {
  it("sends a signed-out visitor to our sign-in page, keeping where they were going", async () => {
    const response = await middleware(
      new NextRequest(
        "http://localhost:4002/medrese/m1/dersler"
      ) as NextRequestWithAuth,
      {} as never
    );

    expect(response?.status).toBe(307);
    const location = new URL(response?.headers.get("location") as string);
    expect(location.pathname).toBe("/auth/signin");
    expect(location.searchParams.get("callbackUrl")).toBe(
      "/medrese/m1/dersler"
    );
  });

  it("keeps the auth pages out of the matcher, so they stay public", () => {
    for (const path of Object.values(authPages)) {
      expect(matches(path)).toBe(false);
    }
  });

  it("keeps NextAuth's own handler, build output and files out of the matcher", () => {
    for (const path of [
      "/api/auth/session",
      "/api/auth/callback/keycloak",
      "/_next/static/chunks/main.js",
      "/favicon.ico",
      "/uthman/uthman.ttf",
    ]) {
      expect(matches(path)).toBe(false);
    }
  });

  it("puts every other page behind the session", () => {
    for (const path of [
      "/",
      "/erisim-yok",
      "/hesap",
      "/bildirimler",
      "/medrese/m1",
      "/medrese/m1/dersler",
      "/ders/c1/celseler",
      // Only the `auth` segment is public, not a page that starts with it.
      "/authors",
    ]) {
      expect(matches(path)).toBe(true);
    }
  });
});
