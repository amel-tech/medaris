// @vitest-environment happy-dom
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, click, render, settle } from "./dom";

/**
 * The sign-in page's body on `@medaris/auth` (#180, MDRS-216): one round trip
 * per browser, "already signed in → go on", one automatic retry per tab, and
 * the error box with the right way out. The page reads the session from
 * `GET /api/auth/session` and starts a round trip by navigating to
 * `GET /api/auth/signin`; both are stood in for here.
 */

const state = vi.hoisted(() => ({
  session: null as unknown,
  assign: vi.fn(),
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

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  sessionStorage.clear();
  state.session = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url === "/api/auth/session"
        ? Response.json(state.session)
        : new Response(null, { status: 404 })
    )
  );
  vi.spyOn(window, "location", "get").mockReturnValue({
    ...window.location,
    assign: state.assign,
  });
});

afterEach(async () => {
  await cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

const mount = async (error?: string, extra: { reauth?: boolean } = {}) => {
  const { AuthEntry } = await import("~/features/auth/auth-entry");
  await render(
    createElement(AuthEntry, {
      intent: "signin",
      callbackUrl: "/tr/courses/c1",
      error,
      ...extra,
    })
  );
  // `enterSignIn` reads the session, then lets the claim settle (50 ms).
  await settle(120);
  const button = (label: string) =>
    [...document.querySelectorAll("button, a")].find(
      (b) => b.textContent === label
    ) as HTMLElement | undefined;
  return { button };
};

/** The start route, as the page starts it on its own and on a click. */
const autoStart =
  "/api/auth/signin?callbackUrl=%2Ftr%2Fcourses%2Fc1&locale=tr&auto=1";
const clickStart =
  "/api/auth/signin?callbackUrl=%2Ftr%2Fcourses%2Fc1&locale=tr";

describe("the sign-in page after a failed round trip", () => {
  it("retries an OAuthCallback silently instead of showing 'Giriş tamamlanamadı'", async () => {
    await mount("OAuthCallback");
    expect(state.assign).toHaveBeenCalledWith(autoStart);
    expect(document.body.textContent).not.toContain("Giriş tamamlanamadı");
    expect(document.body.textContent).toContain(
      "Giriş sayfasına yönlendiriliyorsunuz…"
    );
  });

  it("goes straight to the page when another tab already signed in", async () => {
    state.session = { user: { sub: "u1", name: "Enes" }, expiresAt: 1 };
    await mount("OAuthCallback");
    expect(state.assign).toHaveBeenCalledTimes(1);
    expect(state.assign).toHaveBeenCalledWith("/tr/courses/c1");
  });

  it("shows the design's box once the automatic retry is spent, with the way back to sign-in (MDRS-216)", async () => {
    sessionStorage.setItem(
      "medaris.auth.auto-retry",
      JSON.stringify({ count: 1, at: Date.now() })
    );
    const { button } = await mount("OAuthCallback");
    expect(state.assign).not.toHaveBeenCalled();
    expect(document.querySelector("h1")?.textContent).toBe(
      "Giriş tamamlanamadı"
    );
    expect(document.querySelector(".mds-system-state__text")?.textContent).toBe(
      "Giriş işlemin yarıda kaldı ya da geçersiz hâle geldi. Giriş sayfasına dönüp baştan dene."
    );
    expect(document.querySelector(".mds-system-state")).not.toBeNull();
    expect(button("Tekrar dene")).toBeUndefined();

    await click(button("Giriş sayfasına dön") as HTMLElement);
    expect(state.assign).toHaveBeenCalledWith(clickStart);
  });

  it.each([
    "AccessDenied",
    "SignInLimit",
  ])("shows the box at once for %s, with the way home and no retry", async (error) => {
    const { button } = await mount(error);
    expect(state.assign).not.toHaveBeenCalled();
    expect(document.querySelector("h1")?.textContent).toBe(
      "Giriş tamamlanamadı"
    );
    expect(button("Giriş sayfasına dön")).toBeUndefined();
    expect(button("Ana sayfaya dön")?.getAttribute("href")).toBe("/tr");
  });

  it("says AccessDenied in its own words", async () => {
    await mount("AccessDenied");
    expect(document.body.textContent).toContain("Bu hesabın giriş izni yok.");
  });

  it("says SignInLimit in its own words: wait a few minutes", async () => {
    const { resources } = await import("@medaris/i18n");
    await mount("SignInLimit");
    expect(document.body.textContent).toContain(
      resources.tr.tedris.Auth.signInLimit
    );
  });

  it("shows SignInLimit when this tab's own budget is spent, though the page came without an error", async () => {
    const { resources } = await import("@medaris/i18n");
    sessionStorage.setItem(
      "medaris.auth.auto-start",
      JSON.stringify({ count: 3, at: Date.now() })
    );
    const { button } = await mount();
    expect(state.assign).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(
      resources.tr.tedris.Auth.signInLimit
    );
    expect(button("Giriş sayfasına dön")).toBeUndefined();
  });

  it("without an error, starts the round trip on its own, in the page's language", async () => {
    await mount();
    expect(state.assign).toHaveBeenCalledWith(autoStart);
    expect(document.querySelector("h1")).toBeNull();
  });

  it("with `?reauth=1`, does not go on with the session whose token tedrisat refused, and asks for new tokens", async () => {
    state.session = { user: { sub: "u1", name: "Enes" }, expiresAt: 1 };
    await mount(undefined, { reauth: true });
    expect(state.assign).toHaveBeenCalledTimes(1);
    expect(state.assign).toHaveBeenCalledWith(
      "/api/auth/signin?callbackUrl=%2Ftr%2Fcourses%2Fc1&locale=tr&reauth=1&auto=1"
    );
  });

  it("waits for another tab already in a round trip instead of starting its own (#180)", async () => {
    localStorage.setItem(
      "medaris.auth.sign-in",
      JSON.stringify({ tab: "another-tab", at: Date.now() })
    );
    await mount();
    expect(state.assign).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(
      "Giriş sayfasına yönlendiriliyorsunuz…"
    );
  });
});
