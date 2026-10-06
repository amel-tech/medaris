// @vitest-environment happy-dom
import { REFRESH_ACCESS_TOKEN_ERROR } from "@medaris/services/auth";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MDRS-216: the app's old header still draws on the pages not yet on the
 * system's chrome (and under it, wherever the chrome's style does not apply).
 * It carried the pre-Medaris brand, and it labelled whoever it found — a
 * sistem admin, or a session whose refresh had failed — "Talebe".
 */

const mocks = vi.hoisted(() => ({
  serverSession: null as unknown,
  clientSession: null as unknown,
}));

vi.mock("next-intl", async (orig) =>
  (await import("./intl-mock")).intlMock(await orig())
);
// The header reads its search placeholder on the server (MDRS-217).
vi.mock("next-intl/server", async () => {
  const { resources } = await import("@medaris/i18n");
  return {
    getTranslations: async (namespace: string) => (key: string) =>
      [...namespace.split("."), ...key.split(".")].reduce<unknown>(
        (node, part) => (node as Record<string, unknown>)?.[part],
        resources.tr
      ),
  };
});
vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: mocks.clientSession,
    status: mocks.clientSession ? "authenticated" : "unauthenticated",
  }),
}));
vi.mock("next-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next-auth")>()),
  getServerSession: async () => mocks.serverSession,
}));
vi.mock("~/env", () => ({ env: { KEYCLOAK_ISSUER: "http://kc.test" } }));
vi.mock("~/features/keycloak/login", () => ({
  default: () => createElement("a", { "data-sign-in": "" }, "Giriş yap"),
}));
vi.mock("~/components/header/user-notification-menu", () => ({
  UserNotifications: () => null,
}));

const admin = { user: { name: "E2E Sistem Admin" }, expires: "2099-01-01" };

const renderHeader = async () => {
  const { Header } = await import("~/components/header/header");
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(await Header());
  return host;
};

beforeEach(() => {
  mocks.serverSession = null;
  mocks.clientSession = null;
});

describe("the legacy header", () => {
  it("carries the Medaris brand, not 'Online Madrasah'", async () => {
    const header = await renderHeader();
    expect(header.textContent).toContain("Medaris");
    expect(header.textContent).not.toContain("Online Madrasah");
  });

  it("offers a session whose refresh failed the way in, not a 'Talebe' menu", async () => {
    const failed = { ...admin, error: REFRESH_ACCESS_TOKEN_ERROR };
    mocks.serverSession = failed;
    mocks.clientSession = failed;
    const header = await renderHeader();
    expect(header.querySelector("[data-sign-in]")).not.toBeNull();
    expect(header.textContent).not.toContain("Talebe");
  });

  it("names a signed-in account without guessing its role", async () => {
    mocks.serverSession = admin;
    mocks.clientSession = admin;
    const header = await renderHeader();
    expect(header.textContent).toContain("E2E Sistem Admin");
    expect(header.textContent).not.toContain("Talebe");
  });
});
