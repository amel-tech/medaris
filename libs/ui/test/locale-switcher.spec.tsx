// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LOCALE_COOKIE,
  localeHref,
  pathInPreferredLocale,
  storeLocale,
} from "../src/lib/locale-preference";
import { LocaleMenu } from "../src/mds/locale-switcher";
import { cleanup, click, render, settle } from "./render";

const LOCALES = ["tr", "en", "ar"] as const;

const cookieLocale = () =>
  document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${LOCALE_COOKIE}=`))
    ?.slice(LOCALE_COOKIE.length + 1);

const clearCookie = () => {
  // biome-ignore lint/suspicious/noDocumentCookie: clearing the test's cookie
  document.cookie = `${LOCALE_COOKIE}=; Path=/; Max-Age=0`;
};

describe("localeHref (MDRS-275)", () => {
  const at = (pathname: string, search = "", hash = "") => ({
    pathname,
    search,
    hash,
  });

  it("swaps the locale segment and keeps the rest of the address", () => {
    expect(localeHref("en", LOCALES, at("/tr/kosks/1", "?tab=a", "#x"))).toBe(
      "/en/kosks/1?tab=a#x"
    );
    expect(localeHref("ar", LOCALES, at("/en"))).toBe("/ar");
    expect(localeHref("tr", LOCALES, at("/en/"))).toBe("/tr");
  });

  it("puts the locale in front of an address that has none", () => {
    expect(localeHref("en", LOCALES, at("/discover"))).toBe("/en/discover");
    expect(localeHref("en", LOCALES, at("/"))).toBe("/en");
  });
});

describe("pathInPreferredLocale — the proxy's move", () => {
  const page = (pathname: string, more: Partial<{ method: string }> = {}) => ({
    method: "GET",
    pathname,
    search: "?week=2",
    isServerAction: false,
    ...more,
  });

  it("moves a page in another language to the stored one, query kept", () => {
    expect(pathInPreferredLocale(page("/tr/courses/1"), "en", LOCALES)).toBe(
      "/en/courses/1?week=2"
    );
    expect(pathInPreferredLocale(page("/"), "ar", LOCALES)).toBe("/ar?week=2");
  });

  it("leaves a page already in it, and an unknown or missing choice", () => {
    expect(pathInPreferredLocale(page("/en/kosks"), "en", LOCALES)).toBeNull();
    expect(pathInPreferredLocale(page("/tr"), "de", LOCALES)).toBeNull();
    expect(pathInPreferredLocale(page("/tr"), undefined, LOCALES)).toBeNull();
  });

  it("leaves what is not a page load", () => {
    expect(pathInPreferredLocale(page("/api/me"), "en", LOCALES)).toBeNull();
    expect(
      pathInPreferredLocale(page("/tr", { method: "POST" }), "en", LOCALES)
    ).toBeNull();
    expect(
      pathInPreferredLocale(
        { ...page("/tr/kosks"), isServerAction: true },
        "en",
        LOCALES
      )
    ).toBeNull();
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
  const realLocation = window.location;

  beforeEach(() => {
    clearCookie();
    assign.mockReset();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        pathname: "/tr/courses/1",
        search: "?week=2",
        hash: "",
        assign,
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

  it("choosing a language stores it and loads the same page in it", async () => {
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
    expect(assign).toHaveBeenCalledWith("/en/courses/1?week=2");
  });
});
