import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl/server", () => ({ setRequestLocale: () => undefined }));

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

describe("the landing pages' <html> (MDRS-245)", () => {
  it("is light by default on the [locale] pages, with the no-flash script", async () => {
    const { default: LocaleLayout } = await import("../app/[locale]/layout");
    const markup = renderToStaticMarkup(
      await LocaleLayout({
        children: "page",
        params: Promise.resolve({ locale: "tr" }),
      })
    );
    expectsLightByDefault(markup);
  });

  it("is light by default on the privacy notice's own shell", async () => {
    const { default: PrivacyNoticeLayout } = await import(
      "../app/aydinlatma-metni/layout"
    );
    const markup = renderToStaticMarkup(
      createElement(PrivacyNoticeLayout, { children: "page" })
    );
    expectsLightByDefault(markup);
  });

  it("puts the toggle in the header, one per bar", async () => {
    const { SiteHeader } = await import("../components/site-header");
    const markup = renderToStaticMarkup(
      createElement(SiteHeader, { title: "Medaris" })
    );
    expect(markup.match(/aria-label="Koyu temaya geç"/g)).toHaveLength(2);
    // the phone bar and the desktop bar: the CSS draws one of them at a time
    expect(markup.match(/<header/g)).toHaveLength(2);
  });
});
