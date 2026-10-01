import { keycloakSignInArgs } from "@medaris/services/auth-client";
import { describe, expect, it, vi } from "vitest";

// `setRequestLocale` needs Next's server-component runtime; the page's
// output, not the locale plumbing, is what is under test here.
vi.mock("next-intl/server", () => ({ setRequestLocale: () => {} }));

describe("Kayıt ol opens Keycloak's registration form (MDRS-101)", () => {
  it("asks Keycloak for registration with prompt=create", () => {
    expect(
      keycloakSignInArgs({
        intent: "register",
        callbackUrl: "/tr/start",
        locale: "tr",
      })
    ).toEqual([
      "keycloak",
      { callbackUrl: "/tr/start" },
      { ui_locales: "tr", prompt: "create" },
    ]);
  });

  it("leaves a plain sign-in on the login form", () => {
    const [, , params] = keycloakSignInArgs({
      intent: "signin",
      callbackUrl: "/tr/start",
      locale: "tr",
    });
    expect(params).toEqual({ ui_locales: "tr" });
  });

  it("the register page starts that flow and ends on /start", async () => {
    const { default: RegisterPage } = await import(
      "../app/[locale]/auth/register/page"
    );
    const element = await RegisterPage({
      params: Promise.resolve({ locale: "tr" }),
    });

    expect(element.props).toEqual({
      intent: "register",
      callbackUrl: "/tr/start",
    });
  });
});
