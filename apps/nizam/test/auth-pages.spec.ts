import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import authOptions from "~/lib/auth_options";
import { authPages } from "~/lib/auth_pages";
import { isPublicPath } from "~/lib/public-paths";
import middleware from "../middleware";
import { nextAuthGet } from "./next-auth-harness";

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

  it("the middleware sends a signed-out visitor to our sign-in page", async () => {
    const response = await middleware(
      new NextRequest("http://localhost:4001/tr/kosks")
    );

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location") as string);
    expect(location.pathname).toBe("/auth/signin");
    expect(location.searchParams.get("callbackUrl")).toBe("/tr/kosks");
  });

  it("keeps the auth pages public in every locale", () => {
    for (const path of Object.values(authPages)) {
      for (const prefix of ["", "/en", "/tr", "/ar"]) {
        expect(isPublicPath(`${prefix}${path}`)).toBe(true);
      }
    }
    expect(isPublicPath("/tr/kosks")).toBe(false);
  });
});
