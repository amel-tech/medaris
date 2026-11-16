import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { htmlLangDir } from "~/lib/i18n/direction";
import { locales } from "~/lib/i18n/routing";

// The [locale] layout without Next: the session, the providers and the shell
// around the page are stubbed, so only the document it draws is left.
const request = vi.hoisted(() => ({ locale: "tr" }));
vi.mock("next-intl/server", () => ({ getLocale: async () => request.locale }));
vi.mock("next-intl", async (orig) => ({
  ...(await orig<typeof import("next-intl")>()),
  NextIntlClientProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));
vi.mock("@medaris/ui/mds/app-providers", () => ({
  AppProviders: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("~/components/providers/client-providers", () => ({
  ClientProviders: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("~/components/shell/nizam-shell", () => ({
  NizamShell: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("~/components/legal-footer", () => ({ LegalFooter: () => null }));
vi.mock("~/lib/auth", () => ({ auth: async () => null }));

const renderLayout = async (locale: string) => {
  request.locale = locale;
  const { default: RootLayout } = await import("../app/layout");
  return renderToStaticMarkup(await RootLayout({ children: "page" }));
};

describe("htmlLangDir (MDRS-230)", () => {
  it("writes Turkish left to right", () => {
    expect(htmlLangDir("tr")).toEqual({ lang: "tr", dir: "ltr" });
  });

  it("has a direction for every routed locale", () => {
    for (const locale of locales) {
      expect(["ltr", "rtl"]).toContain(htmlLangDir(locale).dir);
    }
  });
});

describe("the layout's <html> (MDRS-230, MDRS-248)", () => {
  it.each([
    "tr",
    "en",
    "ar",
    "de",
  ])("draws Turkish for a request in %s", async (locale) => {
    expect(await renderLayout(locale)).toMatch(/^<html lang="tr" dir="ltr"/);
  });
});
