// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, click, render, settle } from "./dom";

/**
 * The browser half of nizam's move to `@medaris/auth`: the sign-in page's
 * entry (B2, B3), the sign-out confirmation, and an action's
 * "unauthenticated" answer. The package's own decisions (the tab claim, the
 * retry and loop budgets) are its specs'; these pin what nizam hands it.
 */

const auth = vi.hoisted(() => ({
  enterSignIn: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  handleUnauthenticated: vi.fn(),
}));
vi.mock("@medaris/auth/client", async (original) => ({
  ...(await original<object>()),
  enterSignIn: auth.enterSignIn,
  signIn: auth.signIn,
  signOut: auth.signOut,
  handleUnauthenticated: auth.handleUnauthenticated,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}));

const { AuthEntry } = await import("~/features/auth/auth-entry");
const { SignOutConfirm } = await import("~/features/auth/sign-out-confirm");
const { redirectIfUnauthenticated } = await import("~/lib/unauthenticated");

const inLocale = (locale: "tr" | "en" | "ar", element: ReactElement) => (
  <NextIntlClientProvider
    locale={locale}
    messages={resources[locale]}
    timeZone="Europe/Istanbul"
  >
    {element}
  </NextIntlClientProvider>
);

const button = (host: HTMLElement, name: string) =>
  [...host.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === name
  ) as HTMLButtonElement;

beforeEach(() => {
  for (const spy of Object.values(auth)) spy.mockReset();
});

afterEach(cleanup);

describe("AuthEntry (the sign-in page)", () => {
  it("enters through enterSignIn with the page's locale and destination, not straight to Keycloak (B3)", async () => {
    auth.enterSignIn.mockResolvedValue({ kind: "signing-in" });
    const host = await render(
      inLocale("en", <AuthEntry callbackUrl="/en/kosks" error={null} />)
    );
    await settle();
    expect(auth.enterSignIn).toHaveBeenCalledTimes(1);
    expect(auth.enterSignIn).toHaveBeenCalledWith(
      { intent: "signin", callbackUrl: "/en/kosks", locale: "en" },
      null,
      expect.objectContaining({ navigate: expect.any(Function) })
    );
    expect(auth.signIn).not.toHaveBeenCalled();
    expect(host.textContent).toContain(
      resources.en.nizam.Auth.redirectingSignIn
    );
  });

  it("shows the error box when enterSignIn says so, and retries only on a click", async () => {
    auth.enterSignIn.mockResolvedValue({
      kind: "show-error",
      error: "OAuthCallback",
    });
    const host = await render(
      inLocale(
        "tr",
        <AuthEntry callbackUrl="/tr/kosks" error="OAuthCallback" />
      )
    );
    await settle();
    expect(host.textContent).toContain(resources.tr.nizam.Auth.errorTitle);
    expect(auth.signIn).not.toHaveBeenCalled();

    await click(button(host, resources.tr.nizam.Auth.retry));
    expect(auth.signIn).toHaveBeenCalledWith({
      intent: "signin",
      callbackUrl: "/tr/kosks",
      locale: "tr",
    });
  });

  it("shows a final error at once, worded for it, with no retry", async () => {
    auth.enterSignIn.mockResolvedValue({
      kind: "show-error",
      error: "AccessDenied",
    });
    const host = await render(
      inLocale("ar", <AuthEntry callbackUrl="/ar" error="AccessDenied" />)
    );
    expect(host.textContent).toContain(resources.ar.nizam.Auth.accessDenied);
    expect(button(host, resources.ar.nizam.Auth.retry)).toBeUndefined();
  });

  it("words the box from enterSignIn's error: a spent budget says to wait, not 'try again'", async () => {
    // The page had no `?error=`; this tab's own budget ran out.
    auth.enterSignIn.mockResolvedValue({
      kind: "show-error",
      error: "SignInLimit",
    });
    const host = await render(
      inLocale("en", <AuthEntry callbackUrl="/en/kosks" error={null} />)
    );
    await settle();
    expect(host.textContent).toContain(resources.en.nizam.Auth.signInLimit);
    expect(button(host, resources.en.nizam.Auth.retry)).toBeUndefined();
  });

  it("passes `?reauth=1` on to enterSignIn and to a click, so a refused token is replaced, not reused", async () => {
    auth.enterSignIn.mockResolvedValue({ kind: "signing-in" });
    const host = await render(
      inLocale("tr", <AuthEntry callbackUrl="/tr/kosks" error={null} reauth />)
    );
    await settle();
    const request = {
      intent: "signin",
      callbackUrl: "/tr/kosks",
      locale: "tr",
      reauth: true,
    };
    expect(auth.enterSignIn).toHaveBeenCalledWith(
      request,
      null,
      expect.any(Object)
    );
    await click(button(host, resources.tr.nizam.Auth.continue));
    expect(auth.signIn).toHaveBeenCalledWith(request);
  });
});

describe("SignOutConfirm (the sign-out page)", () => {
  it("posts the sign-out through @medaris/auth in the page's locale; no ID token passes through the browser (B7)", async () => {
    const host = await render(inLocale("ar", <SignOutConfirm />));
    expect(auth.signOut).not.toHaveBeenCalled();
    await click(button(host, resources.ar.nizam.SignOutPage.confirm));
    expect(auth.signOut).toHaveBeenCalledWith({ locale: "ar" });
  });
});

describe("redirectIfUnauthenticated (an action's answer on the client)", () => {
  it("hands an unauthenticated answer, reauth and all, to handleUnauthenticated with the page's locale (MDRS-274)", () => {
    auth.handleUnauthenticated.mockReturnValue(true);
    window.history.replaceState(null, "", "/ar/kosks/k1?sekme=x");
    const answer = { kind: "unauthenticated", reauth: true } as const;
    expect(redirectIfUnauthenticated(answer)).toBe(true);
    expect(auth.handleUnauthenticated).toHaveBeenCalledWith(answer, {
      locale: "ar",
    });
  });

  it("leaves every other answer to the caller", () => {
    expect(redirectIfUnauthenticated({ success: false, error: "x" })).toBe(
      false
    );
    expect(redirectIfUnauthenticated({ success: true, data: 1 })).toBe(false);
    expect(auth.handleUnauthenticated).not.toHaveBeenCalled();
  });
});
