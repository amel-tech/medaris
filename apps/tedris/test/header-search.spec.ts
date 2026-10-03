import { resources } from "@medaris/i18n";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { locales } from "~/lib/i18n/routing";

// The header is a server component: resolve its translator against the real
// catalogue in the locale the test asks for, and keep it signed out.
const locale = vi.hoisted(() => ({ current: "tr" }));
vi.mock("next-intl/server", async () => {
  const { resources } = await import("@medaris/i18n");
  return {
    getTranslations: async (namespace: string) => (key: string) =>
      [...namespace.split("."), ...key.split(".")].reduce<unknown>(
        (node, part) => (node as Record<string, unknown>)?.[part],
        resources[locale.current as keyof typeof resources]
      ),
  };
});
vi.mock("~/lib/auth_options", () => ({ auth: async () => null }));
vi.mock("~/features/keycloak/login", () => ({ default: () => null }));
vi.mock("~/components/i18n/locale-switcher", () => ({ default: () => null }));

const renderHeader = async (languageTag: string) => {
  locale.current = languageTag;
  const { Header } = await import("~/components/header/header");
  return renderToStaticMarkup(await Header());
};

describe("the header's search box speaks the page's language (MDRS-217)", () => {
  it.each(locales)("is labelled in %s", async (languageTag) => {
    const placeholder = resources[languageTag].tedris.Header.searchPlaceholder;
    const html = await renderHeader(languageTag);
    expect(html).toContain(`placeholder="${placeholder}"`);
    expect(html).toContain(`aria-label="${placeholder}"`);
    expect(html).not.toContain('placeholder="Search..."');
  });

  it("spaces its controls with gap, not space-x, so it mirrors in Arabic", async () => {
    const html = await renderHeader("ar");
    expect(html).not.toMatch(/\bspace-x-\d/);
  });
});
