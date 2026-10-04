import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resources } from "@medaris/i18n";
import { PRIVACY_NOTICE_URL } from "@medaris/utils";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// getTranslations needs Next's request scope; resolve against the real
// catalogue instead, in the locale the test asks for.
const locale = vi.hoisted(() => ({ current: "tr" }));
// LANDING_URL is read per render (MDRS-248); unset is the production address.
const env = vi.hoisted(() => ({
  LANDING_URL: undefined as string | undefined,
}));
vi.mock("~/env", () => ({ env }));
vi.mock("next-intl/server", async () => {
  const { resources } = await import("@medaris/i18n");
  return {
    getTranslations: async (namespace: string) => (key: string) =>
      [...namespace.split("."), key].reduce<unknown>(
        (node, part) => (node as Record<string, unknown>)?.[part],
        resources[locale.current as keyof typeof resources]
      ),
  };
});

const render = async (languageTag: string) => {
  locale.current = languageTag;
  const { LegalFooter } = await import("~/components/legal-footer");
  return renderToStaticMarkup(await LegalFooter());
};

describe("the footer links to the privacy notice (MDRS-102)", () => {
  it("opens the notice on landing in a new tab", async () => {
    const html = await render("tr");
    expect(html).toContain(`href="${PRIVACY_NOTICE_URL}"`);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain(">Aydınlatma Metni</a>");
  });

  it("links to the deployment's own landing when LANDING_URL is set (MDRS-248)", async () => {
    env.LANDING_URL = "https://landing-dev.medaris.app";
    try {
      expect(await render("tr")).toContain(
        'href="https://landing-dev.medaris.app/aydinlatma-metni"'
      );
    } finally {
      env.LANDING_URL = undefined;
    }
  });

  it.each(["en", "ar"] as const)("is labelled in %s", async (languageTag) => {
    expect(await render(languageTag)).toContain(
      `>${resources[languageTag].common.legal.privacyNotice}</a>`
    );
  });

  it("is rendered by the [locale] layout, so on every page", () => {
    const layout = readFileSync(
      join(__dirname, "..", "app", "[locale]", "layout.tsx"),
      "utf8"
    );
    expect(layout).toMatch(/<LegalFooter \/>/);
  });
});
