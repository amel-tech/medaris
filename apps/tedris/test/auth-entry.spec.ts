// @vitest-environment happy-dom
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, click, render, settle } from "./dom";

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(async () => undefined),
  getSession: vi.fn(async (): Promise<unknown> => null),
}));
vi.mock("next-intl", async () => {
  const { resources } = await import("@medaris/i18n");
  return {
    useLocale: () => "tr",
    useTranslations: (namespace: string) => (name: string) =>
      [...namespace.split("."), ...name.split(".")].reduce<unknown>(
        (node, part) => (node as Record<string, unknown>)?.[part],
        resources.tr
      ),
  };
});
vi.mock("next-auth/react", () => ({
  signIn: mocks.signIn,
  getSession: mocks.getSession,
}));

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  sessionStorage.clear();
  mocks.getSession.mockResolvedValue(null);
});

afterEach(async () => {
  await cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

const mount = async (error?: string) => {
  const { AuthEntry } = await import("~/features/auth/auth-entry");
  await render(
    createElement(AuthEntry, {
      intent: "signin",
      callbackUrl: "/tr/courses/c1",
      error,
    })
  );
  // `enterKeycloak` reads the session, then lets the claim settle (50 ms).
  await settle(120);
  const button = (label: string) =>
    [...document.querySelectorAll("button, a")].find(
      (b) => b.textContent === label
    ) as HTMLElement | undefined;
  return { button };
};

const keycloak = [
  "keycloak",
  { callbackUrl: "/tr/courses/c1" },
  { ui_locales: "tr" },
];

describe("the sign-in page after a failed round trip", () => {
  it("retries an OAuthCallback silently instead of showing 'Giriş tamamlanamadı'", async () => {
    await mount("OAuthCallback");
    expect(mocks.signIn).toHaveBeenCalledWith(...keycloak);
    expect(document.body.textContent).not.toContain("Giriş tamamlanamadı");
    expect(document.body.textContent).toContain(
      "Giriş sayfasına yönlendiriliyorsunuz…"
    );
  });

  it("goes straight to the page when another tab already signed in", async () => {
    mocks.getSession.mockResolvedValue({ user: { name: "Enes" } });
    const assign = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({
      ...window.location,
      assign,
    });
    await mount("OAuthCallback");
    expect(assign).toHaveBeenCalledWith("/tr/courses/c1");
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it("shows the design's box once the automatic retry is spent, with the way back to sign-in (MDRS-216)", async () => {
    sessionStorage.setItem(
      "medaris.auth.auto-retry",
      JSON.stringify({ count: 1, at: Date.now() })
    );
    const { button } = await mount("OAuthCallback");
    expect(mocks.signIn).not.toHaveBeenCalled();
    expect(document.querySelector("h1")?.textContent).toBe(
      "Giriş tamamlanamadı"
    );
    expect(document.querySelector(".mds-system-state__text")?.textContent).toBe(
      "Giriş işlemin yarıda kaldı ya da geçersiz hâle geldi. Giriş sayfasına dönüp baştan dene."
    );
    expect(document.querySelector(".mds-system-state")).not.toBeNull();
    expect(button("Tekrar dene")).toBeUndefined();

    await click(button("Giriş sayfasına dön") as HTMLElement);
    expect(mocks.signIn).toHaveBeenCalledWith(...keycloak);
  });

  it("shows the box at once for AccessDenied, with the way home and no retry", async () => {
    const { button } = await mount("AccessDenied");
    expect(mocks.signIn).not.toHaveBeenCalled();
    expect(document.querySelector("h1")?.textContent).toBe(
      "Giriş tamamlanamadı"
    );
    expect(document.body.textContent).toContain("Bu hesabın giriş izni yok.");
    expect(button("Giriş sayfasına dön")).toBeUndefined();
    expect(button("Ana sayfaya dön")?.getAttribute("href")).toBe("/tr");
  });

  it("without an error, starts the round trip on its own", async () => {
    await mount();
    expect(mocks.signIn).toHaveBeenCalledWith(...keycloak);
    expect(document.querySelector("h1")).toBeNull();
  });
});
