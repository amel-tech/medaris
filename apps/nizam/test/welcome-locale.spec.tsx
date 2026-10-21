import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The signed-out `/`: no session, so the page draws the welcome state and
// nothing it reads for a signed-in caller is reached.
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
}));
vi.mock("~/lib/auth", () => ({ auth: async () => null }));
vi.mock("~/features/assignments/reads", () => ({ getMyAssignments: vi.fn() }));
vi.mock("~/features/dashboard/reads", () => ({
  getMyGrants: vi.fn(),
  getNizamDashboard: vi.fn(),
}));
vi.mock("~/features/dashboard/components/medaris-home", () => ({
  MedarisHome: () => null,
}));

const renderWelcome = async (locale: string) => {
  const { default: Page } = await import("../app/[locale]/(home)/page");
  return renderToStaticMarkup(
    await Page({ params: Promise.resolve({ locale }) })
  );
};

describe("the signed-out welcome page (MDRS-248)", () => {
  it("offers the language menu before the sign-in button", async () => {
    const html = await renderWelcome("tr");
    expect(html).toContain("nizam.Shell.languageMenu");
    expect(html.indexOf("nizam.Shell.languageMenu")).toBeLessThan(
      html.indexOf("nizam.Auth.signIn")
    );
  });

  it("keeps the sign-in button under the page's locale", async () => {
    const html = await renderWelcome("en");
    expect(html).toContain('href="/en/auth/signin"');
  });
});
