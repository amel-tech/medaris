import { beforeEach, describe, expect, it, vi } from "vitest";
import requestConfig from "~/lib/i18n/request";
import { routing } from "~/lib/i18n/routing";

// Resolves to the react-client build of next-intl/server, whose
// `getRequestConfig` throws; the real one is the identity function anyway.
vi.mock("next-intl/server", () => ({
  getRequestConfig: (config: unknown) => config,
}));

const jar = vi.hoisted(() => ({ cookies: {} as Record<string, string> }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name in jar.cookies ? { name, value: jar.cookies[name] } : undefined,
  }),
}));

const localeOfRequest = async () =>
  (await (requestConfig as unknown as () => Promise<{ locale: string }>)())
    .locale;

/**
 * The language is the viewer's choice, never the address (MDRS-248): the
 * `medaris-locale` cookie, Turkish without one. The browser's own language
 * and next-intl's `NEXT_LOCALE` do not pick it.
 */
describe("the request's language", () => {
  beforeEach(() => {
    jar.cookies = {};
  });

  it("is Turkish by default", async () => {
    expect(routing.defaultLocale).toBe("tr");
    expect(await localeOfRequest()).toBe("tr");
  });

  it("is the cookie's when it names one of the languages", async () => {
    for (const locale of ["tr", "en", "ar"]) {
      jar.cookies = { "medaris-locale": locale };
      expect(await localeOfRequest()).toBe(locale);
    }
  });

  it("ignores an unknown choice and next-intl's own cookie", async () => {
    jar.cookies = { "medaris-locale": "de", NEXT_LOCALE: "en" };
    expect(await localeOfRequest()).toBe("tr");
  });

  it("never routes by a locale prefix", () => {
    expect(routing.localePrefix).toBe("never");
  });
});
