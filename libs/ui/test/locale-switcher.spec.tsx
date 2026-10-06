// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LOCALE_STORAGE_KEY,
  localeHref,
  readStoredLocale,
} from "../src/lib/locale-preference";
import { LocaleMenu, LocalePreference } from "../src/mds/locale-switcher";
import { cleanup, click, render, settle } from "./render";

const LOCALES = ["tr", "en", "ar"] as const;

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

describe("the stored choice", () => {
  beforeEach(() => window.localStorage.clear());

  it("reads only a locale the app has", () => {
    expect(readStoredLocale(LOCALES)).toBeNull();
    window.localStorage.setItem(LOCALE_STORAGE_KEY, "de");
    expect(readStoredLocale(LOCALES)).toBeNull();
    window.localStorage.setItem(LOCALE_STORAGE_KEY, "ar");
    expect(readStoredLocale(LOCALES)).toBe("ar");
  });
});

describe("LocaleMenu and LocalePreference", () => {
  const assign = vi.fn();
  const replace = vi.fn();
  const realLocation = window.location;

  beforeEach(() => {
    window.localStorage.clear();
    assign.mockReset();
    replace.mockReset();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        pathname: "/tr/courses/1",
        search: "?week=2",
        hash: "",
        assign,
        replace,
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
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("en");
    expect(assign).toHaveBeenCalledWith("/en/courses/1?week=2");
  });

  it("moves a later visit to the stored language, and leaves a page already in it", async () => {
    await render(<LocalePreference locale="tr" locales={LOCALES} />);
    expect(replace).not.toHaveBeenCalled();

    window.localStorage.setItem(LOCALE_STORAGE_KEY, "ar");
    await render(<LocalePreference locale="tr" locales={LOCALES} />);
    expect(replace).toHaveBeenCalledWith("/ar/courses/1?week=2");

    replace.mockReset();
    await render(<LocalePreference locale="ar" locales={LOCALES} />);
    expect(replace).not.toHaveBeenCalled();
  });
});
