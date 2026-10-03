// @vitest-environment happy-dom
import { REFRESH_ACCESS_TOKEN_ERROR } from "@medaris/services/auth";
import { act, createElement, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, settle } from "./dom";

/**
 * MDRS-216: a tedris session whose refresh has failed (an expired cookie, a
 * Keycloak that could not be reached) must not drag a visitor off a public
 * page. `/tr/discover` and `/tr/home` render the visitor's view; only a
 * protected page goes back to Keycloak, as before — also when the visitor
 * reaches it by a client-side navigation. The server half is
 * `expired-session-server.spec.ts`.
 */

const mocks = vi.hoisted(() => ({
  session: null as unknown,
  pathname: "/",
  signIn: vi.fn(async () => undefined),
}));

vi.mock("next-auth/react", () => ({
  SessionProvider: ({ children }: { children: unknown }) => children,
  useSession: () => ({
    data: mocks.session,
    status: mocks.session ? "authenticated" : "unauthenticated",
  }),
  signIn: mocks.signIn,
  // The session the coordination re-reads before starting a round trip.
  getSession: async () => mocks.session,
}));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("next-intl", () => ({ useLocale: () => "tr" }));
vi.mock("~/lib/viewer-time-zone", () => ({
  syncViewerTimeZone: async () => undefined,
}));
vi.mock("@medaris/ui/components/sonner", () => ({ Toaster: () => null }));

const refreshFailed = {
  user: { name: "E2E Sistem Admin" },
  expires: "2099-01-01",
  error: REFRESH_ACCESS_TOKEN_ERROR,
};

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  sessionStorage.clear();
  mocks.session = null;
});

afterEach(async () => {
  await cleanup();
  vi.clearAllMocks();
});

/** Moves the address the way the App Router does: no remount of the providers. */
let navigate: (pathname: string) => Promise<void>;

const openWith = async (pathname: string, session: unknown) => {
  window.history.replaceState(null, "", pathname);
  mocks.pathname = pathname;
  mocks.session = session;
  const { ClientProviders } = await import(
    "~/components/providers/client-providers"
  );
  function Harness() {
    const [, rerender] = useState(0);
    navigate = async (next) => {
      await act(async () => {
        window.history.pushState(null, "", next);
        mocks.pathname = next;
        rerender((n) => n + 1);
      });
      await settle(120);
    };
    return createElement(ClientProviders, null, "page");
  }
  await render(createElement(Harness));
  // `enterKeycloak` reads the session, then lets the claim settle (50 ms).
  await settle(120);
};

const keycloak = (pathname: string) => [
  "keycloak",
  { callbackUrl: `http://localhost:3000${pathname}` },
  { ui_locales: "tr" },
];

describe("a failed refresh on the client (RefreshErrorRedirect)", () => {
  it.each([
    "/tr/discover",
    "/tr/home",
    "/tr",
    "/tr/kosks/k1",
  ])("leaves the public page %s to the visitor's view, without Keycloak", async (pathname) => {
    await openWith(pathname, refreshFailed);
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it("still sends a protected page back to Keycloak", async () => {
    await openWith("/tr/my-courses", refreshFailed);
    expect(mocks.signIn).toHaveBeenCalledWith(...keycloak("/tr/my-courses"));
  });

  it("sends the visitor to Keycloak once a client-side navigation leaves the public page", async () => {
    await openWith("/tr/discover", refreshFailed);
    expect(mocks.signIn).not.toHaveBeenCalled();

    await navigate("/tr/my-courses");
    expect(mocks.signIn).toHaveBeenCalledWith(...keycloak("/tr/my-courses"));
  });

  it("control: a healthy session goes nowhere on either", async () => {
    await openWith("/tr/my-courses", { ...refreshFailed, error: undefined });
    await openWith("/tr/discover", { ...refreshFailed, error: undefined });
    await navigate("/tr/my-courses");
    expect(mocks.signIn).not.toHaveBeenCalled();
  });
});
