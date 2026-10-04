import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The layout without Next: as locale-direction.spec.ts stubs it, so only the
// document it draws is left.
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

const htmlTag = (markup: string) => /^<html[^>]*>/.exec(markup)?.[0] ?? "";
const headOf = (markup: string) =>
  /<head>([\s\S]*?)<\/head>/.exec(markup)?.[1] ?? "";

/**
 * The theme: light until the viewer picks dark. `data-theme="light"` on <html>
 * is what keeps the page light when the system is dark (the tokens follow the
 * system only while the attribute is absent); the head script sets "dark"
 * before first paint when it was chosen. The media query itself is not run
 * here, only the markup that keeps it from applying.
 */
const expectsLightByDefault = (markup: string) => {
  expect(htmlTag(markup)).toContain('data-theme="light"');
  const head = headOf(markup);
  expect(head).toContain("<script>");
  expect(head).toContain("medaris-theme");
  expect(head).toContain('==="dark"');
  expect(head).not.toContain("prefers-color-scheme");
};

describe("tedris's <html> (MDRS-245)", () => {
  it.each([
    "tr",
    "en",
    "ar",
  ])("is light by default on /%s, with the no-flash script", async (locale) => {
    const { default: LocaleLayout } = await import("../app/[locale]/layout");
    expectsLightByDefault(
      renderToStaticMarkup(
        await LocaleLayout({
          children: "page",
          params: Promise.resolve({ locale }),
        })
      )
    );
  });

  it("keeps the direction first on <html>, so /ar stays right to left", async () => {
    const { default: LocaleLayout } = await import("../app/[locale]/layout");
    expect(
      htmlTag(
        renderToStaticMarkup(
          await LocaleLayout({
            children: "page",
            params: Promise.resolve({ locale: "ar" }),
          })
        )
      )
    ).toMatch(/^<html lang="ar" dir="rtl" data-theme="light"/);
  });

  it("is light by default on the root not-found page", async () => {
    const { default: RootNotFound } = await import("../app/not-found");
    expectsLightByDefault(renderToStaticMarkup(RootNotFound()));
  });

  it("is light by default on global-error", async () => {
    const { default: GlobalError } = await import("../app/global-error");
    expectsLightByDefault(
      renderToStaticMarkup(GlobalError({ reset: () => undefined }))
    );
  });
});
