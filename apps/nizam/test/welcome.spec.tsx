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

const renderWelcome = async () => {
  const { default: Page } = await import("../app/(home)/page");
  return renderToStaticMarkup(await Page());
};

describe("the signed-out welcome page", () => {
  it("has no language menu: the app is Turkish only", async () => {
    const html = await renderWelcome();
    expect(html).not.toContain("languageMenu");
    expect(html).toContain('href="/auth/signin"');
  });

  it("writes the app's Latin name under the wordmark, not مدارس", async () => {
    const html = await renderWelcome();
    expect(html).toContain(
      '<span class="mds-logo__subtitle" lang="tr" dir="ltr">Nizam</span>'
    );
    expect(html).not.toContain("mds-logo__arabic");
  });
});
