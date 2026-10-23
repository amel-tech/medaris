import { describe, expect, it, vi } from "vitest";
import { registerHref, signInHref } from "~/lib/tedris";
import { landingEntryHref, tedrisEntryUrl } from "~/lib/tedris-entry";
import { GET } from "../app/api/tedris/[intent]/route";

const get = (path: string, intent: string) =>
  GET(new Request(`http://localhost:4003${path}`), {
    params: Promise.resolve({ intent }),
  });

describe("landing's calls to action lead into tedris (MDRS-101)", () => {
  it('the page\'s "Kayıt ol" opens registration, "Giriş yap" sign-in', () => {
    expect(registerHref).toBe("/api/tedris/register");
    expect(signInHref).toBe("/api/tedris/signin");
  });

  it("one click: the CTA's link redirects to tedris's registration page, with no language in it (MDRS-248)", async () => {
    const href = landingEntryHref("register");
    expect(href).toBe("/api/tedris/register");

    const response = await get(href, "register");
    expect(response.status).toBe(307);
    // That page opens Keycloak's form with prompt=create — covered by
    // apps/tedris/test/registration.spec.ts.
    expect(response.headers.get("location")).toBe(
      "http://localhost:4000/auth/register"
    );
  });

  it("sign-in goes to tedris's sign-in page", async () => {
    const response = await get(signInHref, "signin");
    expect(response.headers.get("location")).toBe(
      "http://localhost:4000/auth/signin"
    );
  });

  it("answers 404 for any other intent", async () => {
    expect((await get("/api/tedris/admin", "admin")).status).toBe(404);
  });

  it("keeps a path prefix on the configured tedris URL", () => {
    expect(tedrisEntryUrl("https://example.org/tedris/", "signin")).toBe(
      "https://example.org/tedris/auth/signin"
    );
  });

  it("answers 503, not a broken link, while TEDRIS_APP_URL is unset", async () => {
    vi.resetModules();
    vi.doMock("~/env", () => ({ env: {} }));
    const route = await import("../app/api/tedris/[intent]/route");
    const response = await route.GET(
      new Request("http://localhost:4003/api/tedris/register"),
      { params: Promise.resolve({ intent: "register" }) }
    );
    expect(response.status).toBe(503);
    vi.doUnmock("~/env");
  });
});
