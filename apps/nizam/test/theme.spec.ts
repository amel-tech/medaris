import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The [locale] layout without Next: the providers and the shell around the
// page are stubbed, so only the document it draws is left.
vi.mock("next-intl/server", () => ({ setRequestLocale: () => undefined }));
vi.mock("next-intl", async (orig) => ({
  ...(await orig<typeof import("next-intl")>()),
  NextIntlClientProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));
vi.mock("~/components/providers/client-providers", () => ({
  ClientProviders: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("~/components/shell/nizam-shell", () => ({
  NizamShell: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("~/components/legal-footer", () => ({ LegalFooter: () => null }));

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
describe("nizam's <html> (MDRS-245)", () => {
  it.each([
    "tr",
    "en",
    "ar",
  ])("is light by default on /%s, with the no-flash script", async (locale) => {
    const { default: LocaleLayout } = await import("../app/[locale]/layout");
    const markup = renderToStaticMarkup(
      await LocaleLayout({
        children: "page",
        params: Promise.resolve({ locale }),
      })
    );
    expect(htmlTag(markup)).toContain('data-theme="light"');
    const head = headOf(markup);
    expect(head).toContain("<script>");
    expect(head).toContain("medaris-theme");
    expect(head).toContain('==="dark"');
    expect(head).not.toContain("prefers-color-scheme");
  });
});
