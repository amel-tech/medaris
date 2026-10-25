import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The [locale] layout without Next: the session, the providers and the shell
// around the page are stubbed, so only the document it draws is left.
const request = vi.hoisted(() => ({ locale: "tr" }));
vi.mock("next-intl/server", () => ({ getLocale: async () => request.locale }));
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
vi.mock("~/lib/auth", () => ({ auth: async () => null }));

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
    request.locale = locale;
    const { default: RootLayout } = await import("../app/layout");
    const markup = renderToStaticMarkup(await RootLayout({ children: "page" }));
    expect(htmlTag(markup)).toContain('data-theme="light"');
    const head = headOf(markup);
    expect(head).toContain("<script>");
    expect(head).toContain("medaris-theme");
    expect(head).toContain('==="dark"');
    expect(head).not.toContain("prefers-color-scheme");
  });
});
