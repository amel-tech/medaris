import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The root layout without Next: the providers and the session read are
// stubbed, so only the document it draws is left.
vi.mock("next-intl", async (orig) => ({
  ...(await orig<typeof import("next-intl")>()),
  NextIntlClientProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));
vi.mock("~/components/providers/client-providers", () => ({
  ClientProviders: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("~/lib/auth", () => ({ auth: async () => null }));
const intl = vi.hoisted(() => ({ locale: "tr" }));
vi.mock("next-intl/server", () => ({ getLocale: async () => intl.locale }));

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
describe("nazar's <html> (MDRS-245)", () => {
  it("is light by default, with the no-flash script", async () => {
    const { default: RootLayout } = await import("../app/layout");
    // An async server component: called, then rendered.
    const markup = renderToStaticMarkup(await RootLayout({ children: "page" }));
    expect(htmlTag(markup)).toContain('data-theme="light"');
    const head = headOf(markup);
    expect(head).toContain("<script>");
    expect(head).toContain("medaris-theme");
    expect(head).toContain('==="dark"');
    expect(head).not.toContain("prefers-color-scheme");
  });

  it("is Turkish, left to right, whatever the old cookie named (MDRS-248)", async () => {
    const { default: RootLayout } = await import("../app/layout");
    intl.locale = "tr";
    let markup = renderToStaticMarkup(await RootLayout({ children: "page" }));
    expect(htmlTag(markup)).toContain('lang="tr"');
    expect(htmlTag(markup)).toContain('dir="ltr"');
    intl.locale = "ar";
    markup = renderToStaticMarkup(await RootLayout({ children: "page" }));
    expect(htmlTag(markup)).toContain('lang="tr"');
    expect(htmlTag(markup)).toContain('dir="ltr"');
    intl.locale = "tr";
  });
});
