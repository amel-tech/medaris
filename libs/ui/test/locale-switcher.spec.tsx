// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LOCALE_COOKIE,
  localeCookieDomain,
  readLocaleCookie,
  storeLocale,
  withoutLocaleSegment,
} from "../src/lib/locale-preference";
import { LocaleMenu } from "../src/mds/locale-switcher";
import { cleanup, click, render, settle } from "./render";

const LOCALES = ["tr", "en", "ar"] as const;

const cookieLocale = () =>
  document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${LOCALE_COOKIE}=`))
    ?.slice(LOCALE_COOKIE.length + 1) || undefined;

const clearCookie = () => {
  // biome-ignore lint/suspicious/noDocumentCookie: clearing the test's cookie
  document.cookie = `${LOCALE_COOKIE}=; Path=/; Max-Age=0`;
};

describe("withoutLocaleSegment — an address from before MDRS-248", () => {
  const at = (pathname: string, search = "") => ({ pathname, search });

  it("drops the language and keeps the page and its query", () => {
    expect(withoutLocaleSegment(at("/en/courses/1", "?week=2"), LOCALES)).toBe(
      "/courses/1?week=2"
    );
    expect(withoutLocaleSegment(at("/tr"), LOCALES)).toBe("/");
    expect(withoutLocaleSegment(at("/ar/"), LOCALES)).toBe("/");
  });

  it("leaves an address with no language in it", () => {
    expect(withoutLocaleSegment(at("/courses/1"), LOCALES)).toBeNull();
    expect(withoutLocaleSegment(at("/"), LOCALES)).toBeNull();
    expect(withoutLocaleSegment(at("/trivia"), LOCALES)).toBeNull();
    expect(withoutLocaleSegment(at("/de/kosks"), LOCALES)).toBeNull();
  });
});

describe("readLocaleCookie", () => {
  it("reads one of the locales from a cookie header", () => {
    expect(readLocaleCookie("a=1; medaris-locale=ar; b=2", LOCALES)).toBe("ar");
    expect(readLocaleCookie("medaris-locale=de", LOCALES)).toBeUndefined();
    expect(readLocaleCookie("", LOCALES)).toBeUndefined();
  });
});

describe("localeCookieDomain — one choice for every app (MDRS-248)", () => {
  it("shares the cookie on the parent of an app's host", () => {
    expect(localeCookieDomain("nizam-dev.medaris.app")).toBe("medaris.app");
    expect(localeCookieDomain("tedris.medaris.app")).toBe("medaris.app");
  });

  it("keeps it host-only where there is no parent to share", () => {
    expect(localeCookieDomain("localhost")).toBeUndefined();
    expect(localeCookieDomain("127.0.0.1")).toBeUndefined();
    expect(localeCookieDomain("::1")).toBeUndefined();
    expect(localeCookieDomain("medaris.app")).toBeUndefined();
  });
});

describe("the stored choice", () => {
  beforeEach(() => {
    window.localStorage.clear();
    clearCookie();
  });

  it("is kept in the cookie, and not in local storage", () => {
    expect(cookieLocale()).toBeUndefined();
    storeLocale("en");
    expect(cookieLocale()).toBe("en");
    expect(window.localStorage.length).toBe(0);
  });
});

describe("LocaleMenu", () => {
  const assign = vi.fn();
  const reload = vi.fn();
  const realLocation = window.location;

  beforeEach(() => {
    clearCookie();
    assign.mockReset();
    reload.mockReset();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        protocol: "http:",
        hostname: "localhost",
        pathname: "/courses/1",
        search: "?week=2",
        hash: "",
        assign,
        reload,
      },
    });
  });
  afterEach(async () => {
    await cleanup();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: realLocation,
    });
  });

  it("names the current language on the trigger and lists each in its own name", async () => {
    const host = await render(
      <LocaleMenu locale="tr" locales={LOCALES} label="Dil" />
    );
    const trigger = host.querySelector("button") as HTMLButtonElement;
    expect(trigger.getAttribute("aria-label")).toBe("Dil: Türkçe");
    await click(trigger);
    await settle();
    const rows = Array.from(document.querySelectorAll(".mds-option"));
    expect(rows.map((r) => r.textContent)).toEqual([
      "Türkçe",
      "English",
      "العربية",
    ]);
  });

  it("choosing a language stores it and reloads the same address (MDRS-248)", async () => {
    const host = await render(
      <LocaleMenu locale="tr" locales={LOCALES} label="Dil" />
    );
    await click(host.querySelector("button") as HTMLButtonElement);
    await settle();
    const english = Array.from(document.querySelectorAll(".mds-option")).find(
      (r) => r.textContent === "English"
    ) as HTMLElement;
    await click(english);
    expect(cookieLocale()).toBe("en");
    expect(reload).toHaveBeenCalledOnce();
    expect(assign).not.toHaveBeenCalled();
  });
});
