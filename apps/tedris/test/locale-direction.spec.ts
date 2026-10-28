import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { htmlLangDir } from "~/lib/i18n/direction";
import { locales } from "~/lib/i18n/routing";

// The root layout without Next: the font loader, the session and the shell
// around the page are stubbed, so only the document it draws is left. The
// language is the request's (the cookie's, MDRS-248).
const request = vi.hoisted(() => ({ locale: "tr" }));
vi.mock("next/font/google", () => ({ Inter: () => ({ className: "inter" }) }));
vi.mock("next-intl/server", () => ({ getLocale: async () => request.locale }));
vi.mock("next-intl", async (orig) => ({
  ...(await orig<typeof import("next-intl")>()),
  NextIntlClientProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));
vi.mock("~/lib/auth", () => ({ auth: async () => null }));
vi.mock("~/components/header/header", () => ({ Header: () => null }));
vi.mock("~/components/legal-footer", () => ({ LegalFooter: () => null }));
vi.mock("~/components/tab-view", () => ({
  TabView: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("~/components/providers/client-providers", () => ({
  ClientProviders: ({ children }: { children: React.ReactNode }) => children,
}));

const renderLayout = async (locale: string) => {
  request.locale = locale;
  const { default: RootLayout } = await import("../app/layout");
  return renderToStaticMarkup(await RootLayout({ children: "page" }));
};

describe("<html> carries the locale's language and direction (MDRS-217)", () => {
  it("renders Turkish left to right", () => {
    expect(htmlLangDir("tr")).toEqual({ lang: "tr", dir: "ltr" });
  });

  it("has a direction for every routed locale", () => {
    for (const languageTag of locales) {
      expect(["ltr", "rtl"]).toContain(htmlLangDir(languageTag).dir);
    }
  });

  it.each([
    "tr",
    "en",
    "ar",
  ])("is Turkish in the layout for a request in %s", async (locale) => {
    expect(await renderLayout(locale)).toMatch(/^<html lang="tr" dir="ltr"/);
  });
});

describe("the root boundary describes the Turkish it draws (MDRS-217)", () => {
  it("global-error is tr, left to right", async () => {
    const { default: GlobalError } = await import("../app/global-error");
    expect(
      renderToStaticMarkup(GlobalError({ retry: () => undefined }))
    ).toMatch(/^<html lang="tr" dir="ltr"/);
  });
});
