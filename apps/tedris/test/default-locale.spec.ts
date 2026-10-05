import { NextRequest } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { describe, expect, it } from "vitest";
import { routing } from "~/lib/i18n/routing";

const intl = createIntlMiddleware(routing);

const redirectOf = (url: string, headers: Record<string, string> = {}) => {
  const response = intl(new NextRequest(url, { headers }));
  return response.headers.get("location");
};

describe("the default locale", () => {
  it("is Turkish", () => {
    expect(routing.defaultLocale).toBe("tr");
  });

  it("sends a path without a locale to Turkish, whatever the browser asks for", () => {
    const location = redirectOf("http://localhost/", {
      "accept-language": "en-US,en;q=0.9",
      cookie: "NEXT_LOCALE=en",
    });
    expect(location && new URL(location).pathname).toBe("/tr");
  });

  it("keeps an explicit locale in the path", () => {
    expect(
      redirectOf("http://localhost/en", { "accept-language": "tr" })
    ).toBeNull();
  });
});
