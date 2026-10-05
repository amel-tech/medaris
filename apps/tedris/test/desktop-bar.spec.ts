// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * The top bar at 768 and up. The way to Hesap is the person's initials in the
 * bell's ghost icon button; `.mds-nav-user` is the sidebar's footer row and
 * drew a bordered, bar-tall block behind the avatar on hover.
 */

const text = (key: string) =>
  key
    .split(".")
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown>)?.[part],
      resources.tr.tedris
    ) as string;
vi.mock("next-intl", () => ({
  useLocale: () => "tr",
  useTranslations: (namespace?: string) => (key: string) =>
    text(namespace ? `${namespace.replace(/^tedris\./, "")}.${key}` : key),
}));
vi.mock("~/lib/i18n/navigation", () => ({
  usePathname: () => "/home",
  useRouter: () => ({ push: vi.fn() }),
}));

const { DesktopBar } = await import("~/components/phone-menu/desktop-bar");

const accountLink = (html: string) => {
  const host = document.createElement("div");
  host.innerHTML = html;
  return host.querySelector<HTMLAnchorElement>('a[href="/tr/account"]');
};

describe("DesktopBar", () => {
  it("draws the way to Hesap as a ghost icon button, like the bell", () => {
    const html = renderToStaticMarkup(
      createElement(DesktopBar, { signedIn: true, name: "E2E Nâzım" })
    );
    const link = accountLink(html);
    expect(link).not.toBeNull();
    expect(link?.className).toContain("mds-icon-btn");
    expect(link?.className).toContain("mds-btn--ghost");
    expect(link?.className).not.toContain("mds-nav-user");
    expect(link?.textContent).toContain(text("PhoneMenu.account"));
  });

  it("draws Ana sayfa for a signed-in person and not for a visitor, whose wordmark opens Keşfet (MDRS-256)", () => {
    const member = renderToStaticMarkup(
      createElement(DesktopBar, { signedIn: true, name: "E2E Nâzım" })
    );
    expect(member).toContain('href="/tr/home"');
    const visitor = renderToStaticMarkup(
      createElement(DesktopBar, { signedIn: false })
    );
    expect(visitor).not.toContain("/tr/home");
    expect(visitor).not.toContain(`>${text("PhoneMenu.home")}<`);
    expect(visitor).toContain('href="/tr/discover"');
  });

  it("offers a visitor Giriş yap and Kayıt ol instead", () => {
    const html = renderToStaticMarkup(
      createElement(DesktopBar, { signedIn: false })
    );
    expect(accountLink(html)).toBeNull();
    expect(html).toContain(text("PhoneMenu.signIn"));
    expect(html).toContain(text("PhoneMenu.register"));
  });
});
