// @vitest-environment happy-dom
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
vi.mock("@medaris/auth/client", () => ({
  useSession: () => {
    const session = mocks.clientSession as { user: unknown } | null;
    return {
      session,
      user: session?.user ?? null,
      status: session ? "authenticated" : "unauthenticated",
    };
  },
}));
vi.mock("~/lib/auth", () => ({ auth: async () => mocks.serverSession }));
vi.mock("~/env", () => ({ env: { KEYCLOAK_ISSUER: "http://kc.test" } }));
vi.mock("~/features/keycloak/login", () => ({
  default: () => createElement("a", { "data-sign-in": "" }, "Giriş yap"),
}));
vi.mock("~/components/header/user-notification-menu", () => ({
  UserNotifications: () => null,
}));

const admin = {
  user: { sub: "admin-1", name: "E2E Sistem Admin" },
  expiresAt: Date.UTC(2099, 0, 1),
};

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

  // A session whose refresh failed is no session: `auth()` answers null for
  // it (MDRS-216), as it does for a visitor.
  it("offers a visitor, or a session that ended, the way in, not a 'Talebe' menu", async () => {
    const header = await renderHeader();
    expect(header.querySelector("[data-sign-in]")).not.toBeNull();
    expect(header.textContent).not.toContain("Talebe");
  });

  it("draws no account when the session ended under the page, instead of crashing (A23)", async () => {
    mocks.serverSession = admin;
    mocks.clientSession = null;
    const header = await renderHeader();
    expect(header.textContent).not.toContain("E2E Sistem Admin");
    expect(header.querySelector("[data-sign-in]")).toBeNull();
  });

  it("names a signed-in account without guessing its role", async () => {
    mocks.serverSession = admin;
    mocks.clientSession = admin;
    const header = await renderHeader();
    expect(header.textContent).toContain("E2E Sistem Admin");
    expect(header.textContent).not.toContain("Talebe");
  });
});
