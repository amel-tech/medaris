import { signInHref } from "@medaris/auth/client";
import { describe, expect, it, vi } from "vitest";

// `setRequestLocale` needs Next's server-component runtime; the page's
// output, not the locale plumbing, is what is under test here.
vi.mock("next-intl/server", () => ({
  setRequestLocale: () => {},
  getTranslations: async () => (key: string) => key,
}));

describe("Kayıt ol opens Keycloak's registration form (MDRS-101)", () => {
  // The start route turns `intent=register` into `prompt=create`, and the
  // locale into `ui_locales` and `kc_locale` (MDRS-274): libs/auth's
  // sign-in-route spec.
  it("asks the start route for registration, in the page's language", () => {
    expect(
      signInHref({ intent: "register", callbackUrl: "/tr", locale: "tr" })
    ).toBe("/api/auth/signin?callbackUrl=%2Ftr&locale=tr&intent=register");
  });

  it("leaves a plain sign-in on the login form", () => {
    expect(
      signInHref({ intent: "signin", callbackUrl: "/en", locale: "en" })
    ).toBe("/api/auth/signin?callbackUrl=%2Fen&locale=en");
  });

  it("the register page starts that flow and ends on Ana sayfa, with no welcome step", async () => {
    const { default: RegisterPage } = await import(
      "../app/[locale]/auth/register/page"
    );
    const element = await RegisterPage({
      params: Promise.resolve({ locale: "tr" }),
    });

    // The page is the system's chrome, then the entry.
    const entry = element.props.children[1];
    expect(entry.props).toEqual({
      intent: "register",
      callbackUrl: "/tr",
    });
  });
});
