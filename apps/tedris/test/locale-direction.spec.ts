import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { htmlLangDir } from "~/lib/i18n/direction";
import { locales } from "~/lib/i18n/routing";

// The [locale] layout without Next: the font loader, the session and the
// shell around the page are stubbed, so only the document it draws is left.
vi.mock("next/font/google", () => ({ Inter: () => ({ className: "inter" }) }));
vi.mock("next-intl/server", () => ({ setRequestLocale: () => undefined }));
vi.mock("next-intl", async (orig) => ({
  ...(await orig<typeof import("next-intl")>()),
  NextIntlClientProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));
vi.mock("~/lib/auth_options", () => ({ auth: async () => null }));
vi.mock("~/components/header/header", () => ({ Header: () => null }));
vi.mock("~/components/legal-footer", () => ({ LegalFooter: () => null }));
vi.mock("~/components/tab-view", () => ({
  TabView: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("~/components/providers/client-providers", () => ({
  ClientProviders: ({ children }: { children: React.ReactNode }) => children,
}));

const renderLayout = async (locale: string) => {
  const { default: LocaleLayout } = await import("../app/[locale]/layout");
  return renderToStaticMarkup(
    await LocaleLayout({
      children: "page",
      params: Promise.resolve({ locale }),
    })
  );
};

describe("<html> carries the locale's language and direction (MDRS-217)", () => {
  it("renders Arabic right to left", () => {
    expect(htmlLangDir("ar")).toEqual({ lang: "ar", dir: "rtl" });
  });

  it.each(["tr", "en"] as const)("renders %s left to right", (languageTag) => {
    expect(htmlLangDir(languageTag)).toEqual({ lang: languageTag, dir: "ltr" });
  });

  it("has a direction for every routed locale", () => {
    for (const languageTag of locales) {
      expect(["ltr", "rtl"]).toContain(htmlLangDir(languageTag).dir);
    }
  });

  it.each([
    ["ar", "rtl"],
    ["tr", "ltr"],
    ["en", "ltr"],
  ] as const)("is what the [locale] layout draws on /%s", async (locale, dir) => {
    expect(await renderLayout(locale)).toMatch(
      new RegExp(`^<html lang="${locale}" dir="${dir}"`)
    );
  });
});

describe("the root boundaries describe the Turkish they draw (MDRS-217)", () => {
  it("not-found is tr, left to right", async () => {
    const { default: RootNotFound } = await import("../app/not-found");
    expect(renderToStaticMarkup(RootNotFound())).toMatch(
      /^<html lang="tr" dir="ltr"/
    );
  });

  it("global-error is tr, left to right", async () => {
    const { default: GlobalError } = await import("../app/global-error");
    expect(
      renderToStaticMarkup(GlobalError({ reset: () => undefined }))
    ).toMatch(/^<html lang="tr" dir="ltr"/);
  });
});
