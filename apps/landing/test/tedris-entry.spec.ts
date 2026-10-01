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
    expect(registerHref).toBe("/api/tedris/register?locale=tr");
    expect(signInHref).toBe("/api/tedris/signin?locale=tr");
  });

  it("one click: the CTA's link redirects to tedris's registration page", async () => {
    const href = landingEntryHref("register", "tr");
    expect(href).toBe("/api/tedris/register?locale=tr");

    const response = await get(href, "register");
    expect(response.status).toBe(307);
    // That page opens Keycloak's form with prompt=create — covered by
    // apps/tedris/test/registration.spec.ts.
    expect(response.headers.get("location")).toBe(
      "http://localhost:4000/tr/auth/register"
    );
  });

  it("sign-in goes to tedris's sign-in page", async () => {
    const response = await get(signInHref, "signin");
    expect(response.headers.get("location")).toBe(
      "http://localhost:4000/tr/auth/signin"
    );
  });

  it("falls back to the default locale rather than forwarding an unknown one", async () => {
    const response = await get("/api/tedris/register?locale=xx", "register");
    expect(response.headers.get("location")).toBe(
      "http://localhost:4000/tr/auth/register"
    );
  });

  it("answers 404 for any other intent", async () => {
    expect((await get("/api/tedris/admin?locale=tr", "admin")).status).toBe(
      404
    );
  });

  it("keeps a path prefix on the configured tedris URL", () => {
    expect(tedrisEntryUrl("https://example.org/tedris/", "signin", "tr")).toBe(
      "https://example.org/tedris/tr/auth/signin"
    );
  });

  it("answers 503, not a broken link, while TEDRIS_APP_URL is unset", async () => {
    vi.resetModules();
    vi.doMock("~/env", () => ({ env: {} }));
    const route = await import("../app/api/tedris/[intent]/route");
    const response = await route.GET(
      new Request("http://localhost:4003/api/tedris/register?locale=tr"),
      { params: Promise.resolve({ intent: "register" }) }
    );
    expect(response.status).toBe(503);
    vi.doUnmock("~/env");
  });
});
