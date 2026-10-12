// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { SignOutButton } from "~/features/account/components/sign-out-button";
import { AuthEntry } from "~/features/auth/auth-entry";
import { SignOutConfirm } from "~/features/auth/sign-out-confirm";
import { handleUnauthenticated } from "~/lib/unauthenticated";
import { cleanup, click, render, settle } from "./dom";

/**
 * The browser half of nazar's auth: the sign-in page's entry (B2, B3), the
 * one answer to an action whose session is over, and sign-out. The order
 * matters: `@medaris/auth/client` remembers, per page, that a round trip has
 * started, so the test that starts one by itself comes first.
 */
const withIntl = (node: ReactNode) => (
  <NextIntlClientProvider
    locale="tr"
    messages={{ common: resources.tr.common, nazar: resources.tr.nazar }}
    timeZone="Europe/Istanbul"
  >
    {node}
  </NextIntlClientProvider>
);

const assign = vi.fn();
let session: unknown = null;
const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
  const url = input instanceof Request ? input.url : String(input);
  if (url.endsWith("/api/auth/session")) {
    return new Response(JSON.stringify(session), {
      headers: { "content-type": "application/json" },
    });
  }
  throw new Error(`unexpected request to ${url}`);
});

const realLocation = window.location;
beforeEach(() => {
  session = null;
  assign.mockReset();
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      ...realLocation,
      pathname: "/medrese/m1/ayarlar",
      search: "?sekme=genel",
      hash: "#politikalar",
      assign,
    },
  });
});
afterEach(async () => {
  await cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.sessionStorage.clear();
});
afterAll(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: realLocation,
  });
});

const buttonNamed = (host: HTMLElement, name: string) =>
  [...host.querySelectorAll("button")].find(
    (button) => button.textContent?.trim() === name
  );

describe("the sign-in page's entry", () => {
  it("starts one round trip by itself, Keycloak's form in Turkish, and comes back to the page (B3)", async () => {
    await render(withIntl(<AuthEntry callbackUrl="/hesap" />));
    await settle(150);

    expect(assign).toHaveBeenCalledExactlyOnceWith(
      "/api/auth/signin?callbackUrl=%2Fhesap&locale=tr&auto=1"
    );
  });

  it("goes straight on when the session is already there (another tab, or Back after a sign-in)", async () => {
    session = { user: { sub: "user-1" }, expiresAt: Date.now() + 60_000 };
    await render(
      withIntl(<AuthEntry callbackUrl="/hesap" error="OAuthCallback" />)
    );
    await settle(50);

    expect(assign).toHaveBeenCalledExactlyOnceWith("/hesap");
  });

  it("shows a refusal at once, with no retry, and starts nothing by itself (B2)", async () => {
    const host = await render(
      withIntl(<AuthEntry callbackUrl="/hesap" error="AccessDenied" />)
    );
    await settle(50);

    expect(host.textContent).toContain("Giriş yapılamadı");
    expect(host.textContent).toContain(resources.tr.nazar.Auth.accessDenied);
    expect(buttonNamed(host, resources.tr.nazar.Auth.retry)).toBeUndefined();
    expect(assign).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("says to wait a few minutes when the sign-in budget is spent, not 'try again'", async () => {
    const host = await render(
      withIntl(<AuthEntry callbackUrl="/hesap" error="SignInLimit" />)
    );
    await settle(50);

    expect(host.textContent).toContain(resources.tr.nazar.Auth.signInLimit);
    expect(buttonNamed(host, resources.tr.nazar.Auth.retry)).toBeUndefined();
    expect(assign).not.toHaveBeenCalled();
  });

  it("does not go on with the session whose token tedrisat refused (`?reauth=1`), and a click asks for new tokens", async () => {
    session = { user: { sub: "user-1" }, expiresAt: Date.now() + 60_000 };
    const host = await render(
      withIntl(<AuthEntry callbackUrl="/hesap" reauth />)
    );
    await settle(50);
    expect(assign).not.toHaveBeenCalledWith("/hesap");

    await click(buttonNamed(host, resources.tr.nazar.Auth.continue) as Element);
    expect(assign).toHaveBeenCalledExactlyOnceWith(
      "/api/auth/signin?callbackUrl=%2Fhesap&locale=tr&reauth=1"
    );
  });
});

describe("an action whose session is over", () => {
  it("is sent to sign in and back to exactly this page, in Turkish, and the caller draws nothing", () => {
    expect(handleUnauthenticated({ kind: "unauthenticated" })).toBe(true);
    expect(assign).toHaveBeenCalledExactlyOnceWith(
      `/api/auth/signin?callbackUrl=${encodeURIComponent(
        "/medrese/m1/ayarlar?sekme=genel#politikalar"
      )}&locale=tr`
    );
  });

  it("asks for new tokens when tedrisat refused the one it had (reauth)", () => {
    expect(
      handleUnauthenticated({ kind: "unauthenticated", reauth: true })
    ).toBe(true);
    expect(assign).toHaveBeenCalledExactlyOnceWith(
      `/api/auth/signin?callbackUrl=${encodeURIComponent(
        "/medrese/m1/ayarlar?sekme=genel#politikalar"
      )}&locale=tr&reauth=1`
    );
  });

  it("leaves every other answer to the caller", () => {
    for (const answer of [
      { success: false, code: "" },
      { success: true, data: null },
      { kind: "unavailable" },
      null,
    ]) {
      expect(handleUnauthenticated(answer)).toBe(false);
    }
    expect(assign).not.toHaveBeenCalled();
  });
});

describe("sign-out", () => {
  const posted: Array<{
    action: string | null;
    method: string;
    fields: Record<string, FormDataEntryValue>;
  }> = [];
  beforeEach(() => {
    posted.length = 0;
    vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(function (
      this: HTMLFormElement
    ) {
      posted.push({
        action: this.getAttribute("action"),
        method: this.method.toLowerCase(),
        fields: Object.fromEntries(new FormData(this)),
      });
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it("the account page's button posts to /api/auth/signout, Keycloak's page in Turkish; no token passes through the page", async () => {
    const host = await render(
      withIntl(<SignOutButton label="Çıkış yap" busy="Çıkış yapılıyor" />)
    );
    await click(host.querySelector("button") as Element);

    expect(posted).toEqual([
      {
        action: "/api/auth/signout",
        method: "post",
        fields: { locale: "tr" },
      },
    ]);
  });

  it("the sign-out page asks first, then posts the same", async () => {
    const host = await render(withIntl(<SignOutConfirm />));
    expect(posted).toEqual([]);
    const confirm = [...host.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Çıkış yap"
    );
    await click(confirm as Element);

    expect(posted).toEqual([
      {
        action: "/api/auth/signout",
        method: "post",
        fields: { locale: "tr" },
      },
    ]);
  });
});
