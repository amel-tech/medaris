import { DEFAULT_TIME_ZONE } from "@medaris/utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import requestConfig from "~/lib/i18n/request";

// Resolves to the react-client build of next-intl/server, whose
// `getRequestConfig` throws; the real one is the identity function anyway.
vi.mock("next-intl/server", () => ({
  getRequestConfig: (config: unknown) => config,
}));

const jar = vi.hoisted(() => ({ locale: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "medaris-locale" && jar.locale !== undefined
        ? { name, value: jar.locale }
        : undefined,
  }),
}));

const resolve = async () =>
  (
    requestConfig as unknown as () => Promise<{
      locale: string;
      messages: Record<string, Record<string, unknown>>;
      timeZone?: string;
    }>
  )();

describe("the next-intl request config", () => {
  beforeEach(() => {
    jar.locale = undefined;
  });

  it("is Turkish without a choice, or with one Nazar does not have", async () => {
    expect((await resolve()).locale).toBe("tr");
    jar.locale = "de";
    expect((await resolve()).locale).toBe("tr");
  });

  it("follows the language chosen in Tedris or Nizam (MDRS-248)", async () => {
    for (const locale of ["tr", "en", "ar"]) {
      jar.locale = locale;
      expect((await resolve()).locale).toBe(locale);
    }
  });

  it("loads only the common and nazar namespaces, in that language", async () => {
    jar.locale = "en";
    const { messages } = await resolve();
    expect(Object.keys(messages).sort()).toEqual(["common", "nazar"]);
    expect((messages.nazar.Account as Record<string, string>).language).toBe(
      "Language"
    );
  });

  it("names the default zone", async () => {
    expect((await resolve()).timeZone).toBe(DEFAULT_TIME_ZONE);
  });
});
