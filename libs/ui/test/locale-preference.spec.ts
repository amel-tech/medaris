import { describe, expect, it } from "vitest";
import {
  readLocaleCookie,
  withoutLocaleSegment,
} from "../src/lib/locale-preference";

const LOCALES = ["tr", "en", "ar"] as const;

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

  it("finds no language a Turkish-only app has dropped", () => {
    expect(readLocaleCookie("medaris-locale=en", ["tr"])).toBeUndefined();
  });
});
