import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { htmlLangDir } from "~/lib/i18n/direction";
import { locales } from "~/lib/i18n/routing";

// The [locale] layout without Next: the providers and the shell around the
// page are stubbed, so only the document it draws is left.
vi.mock("next-intl/server", () => ({ setRequestLocale: () => undefined }));
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

const renderLayout = async (locale: string) => {
  const { default: LocaleLayout } = await import("../app/[locale]/layout");
  return renderToStaticMarkup(
    await LocaleLayout({
      children: "page",
      params: Promise.resolve({ locale }),
    })
  );
};

describe("htmlLangDir (MDRS-230)", () => {
  it("writes Arabic right to left", () => {
    expect(htmlLangDir("ar")).toEqual({ lang: "ar", dir: "rtl" });
  });

  it.each(["tr", "en"] as const)("writes %s left to right", (locale) => {
    expect(htmlLangDir(locale)).toEqual({ lang: locale, dir: "ltr" });
  });

  it("has a direction for every routed locale", () => {
    for (const locale of locales) {
      expect(["ltr", "rtl"]).toContain(htmlLangDir(locale).dir);
    }
  });
});

describe("the [locale] layout's <html> follows the route (MDRS-230)", () => {
  it.each([
    ["ar", "rtl"],
    ["tr", "ltr"],
    ["en", "ltr"],
  ] as const)("on /%s draws dir=%s", async (locale, dir) => {
    expect(await renderLayout(locale)).toMatch(
      new RegExp(`^<html lang="${locale}" dir="${dir}"`)
    );
  });

  it("still refuses a locale it does not route", async () => {
    await expect(renderLayout("de")).rejects.toThrow();
  });
});
