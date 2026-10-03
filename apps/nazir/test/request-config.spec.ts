import { DEFAULT_TIME_ZONE } from "@medaris/utils";
import { describe, expect, it, vi } from "vitest";
import requestConfig from "~/lib/i18n/request";

// Resolves to the react-client build of next-intl/server, whose
// `getRequestConfig` throws; the real one is the identity function anyway.
vi.mock("next-intl/server", () => ({
  getRequestConfig: (config: unknown) => config,
}));

const resolve = async (requested: string | undefined) =>
  (
    requestConfig as unknown as (params: {
      requestLocale: Promise<string | undefined>;
    }) => Promise<{
      locale: string;
      messages: Record<string, unknown>;
      timeZone?: string;
    }>
  )({ requestLocale: Promise.resolve(requested) });

describe("the next-intl request config", () => {
  it("is Turkish whatever locale is asked for", async () => {
    for (const requested of [undefined, "tr", "en", "ar"]) {
      expect((await resolve(requested)).locale).toBe("tr");
    }
  });

  it("loads only the common and nazir namespaces", async () => {
    const { messages } = await resolve(undefined);
    expect(Object.keys(messages).sort()).toEqual(["common", "nazir"]);
  });

  it("names a zone without reading a cookie", async () => {
    expect((await resolve(undefined)).timeZone).toBe(DEFAULT_TIME_ZONE);
  });
});
