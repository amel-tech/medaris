import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import authOptions from "~/lib/auth_options";
import { authPages, registerPage } from "~/lib/auth_pages";
import { isPublicPath } from "~/lib/public-paths";
import middleware from "../middleware";
import { nextAuthGet } from "./next-auth-harness";

describe("no English NextAuth page on the way in or out (MDRS-101)", () => {
  it("points every page NextAuth would render at one of ours", () => {
    expect(authOptions.pages).toEqual(authPages);
    for (const path of Object.values(authPages)) {
      expect(path.startsWith("/api/")).toBe(false);
    }
  });

  it("GET /api/auth/signin redirects to our sign-in page", async () => {
    const result = await nextAuthGet(authOptions, "signin");

    expect(result.status).toBe(302);
    expect(result.location).toMatch(/^\/auth\/signin\?callbackUrl=/);
  });

  it("GET /api/auth/signout redirects to our sign-out page", async () => {
    const result = await nextAuthGet(authOptions, "signout");

    expect(result.status).toBe(302);
    expect(result.location).toBe("/auth/signout");
  });

  it("GET /api/auth/error redirects to our error page with the code", async () => {
    const result = await nextAuthGet(authOptions, "error", {
      error: "Configuration",
    });

    expect(result.status).toBe(302);
    expect(result.location).toBe("/auth/error?error=Configuration");
  });

  it("a failed Keycloak callback ends on our sign-in page, error attached", async () => {
    // NextAuth sends callback failures to its own sign-in route first...
    const first = await nextAuthGet(authOptions, "error", {
      error: "OAuthCallback",
    });
    expect(first.location).toMatch(/\/api\/auth\/signin\?error=OAuthCallback$/);

    // ...which, with `pages.signIn` set, hands over to ours.
    const second = await nextAuthGet(authOptions, "signin", {
      error: "OAuthCallback",
    });
    expect(second.status).toBe(302);
    expect(second.location).toMatch(
      /^\/auth\/signin\?callbackUrl=.*&error=OAuthCallback$/
    );
  });

  it("control: without `pages` the same requests render NextAuth's English HTML", async () => {
    const bare = { ...authOptions, pages: {} };

    for (const action of ["signin", "signout"]) {
      const result = await nextAuthGet(bare, action);
      expect(result.status).toBe(200);
      expect(result.location).toBeUndefined();
      expect(String(result.body)).toMatch(/Sign (in|out)/);
    }
  });

  it("the middleware sends a signed-out visitor to our sign-in page", async () => {
    const response = await middleware(
      new NextRequest("http://localhost:4000/tr/learning?page=2")
    );

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location") as string);
    expect(location.pathname).toBe("/auth/signin");
    expect(location.searchParams.get("callbackUrl")).toBe(
      "/tr/learning?page=2"
    );
  });

  it("keeps the auth pages public in every locale, and nothing else new", () => {
    for (const path of [...Object.values(authPages), registerPage]) {
      expect(isPublicPath(path)).toBe(true);
      for (const locale of ["en", "tr", "ar"]) {
        expect(isPublicPath(`/${locale}${path}`)).toBe(true);
      }
    }
    for (const path of ["/", "/tr", "/tr/home"]) {
      expect(isPublicPath(path)).toBe(true);
    }
    for (const path of [
      "/tr/learning",
      "/tr/start",
      "/tr/welcome",
      "/tr/auth",
    ]) {
      expect(isPublicPath(path)).toBe(false);
    }
  });

  // MDRS-122: the köşk, medrese and course pages are open to a signed-out
  // visitor; a lesson page is not, nor the köşk list.
  it("opens the köşk, medrese and course pages, and keeps lessons behind sign-in", () => {
    const id = "6f1c2a9e-0000-4000-8000-000000000001";
    for (const path of [
      `/kosks/${id}`,
      `/madrasahs/${id}`,
      `/courses/${id}`,
      `/courses/${id}/`,
    ]) {
      expect(isPublicPath(path)).toBe(true);
      for (const locale of ["en", "tr", "ar"]) {
        expect(isPublicPath(`/${locale}${path}`)).toBe(true);
      }
    }
    for (const path of [
      `/tr/courses/${id}/lessons/${id}`,
      `/courses/${id}/lessons/${id}`,
      "/tr/kosks",
      "/tr/courses",
      `/tr/kosks/${id}/edit`,
      "/tr/learning/my-courses",
    ]) {
      expect(isPublicPath(path)).toBe(false);
    }
  });

  it("sends a signed-out visitor of a lesson page to sign in, and lets the course page through", async () => {
    const lesson = await middleware(
      new NextRequest(
        "http://localhost:4000/tr/courses/6f1c2a9e-0000-4000-8000-000000000001/lessons/6f1c2a9e-0000-4000-8000-000000000002"
      )
    );
    expect(lesson.status).toBe(307);
    expect(new URL(lesson.headers.get("location") as string).pathname).toBe(
      "/auth/signin"
    );

    const course = await middleware(
      new NextRequest(
        "http://localhost:4000/tr/courses/6f1c2a9e-0000-4000-8000-000000000001"
      )
    );
    const location = course.headers.get("location");
    expect(
      location === null || !new URL(location).pathname.includes("/auth/signin")
    ).toBe(true);
  });
});
