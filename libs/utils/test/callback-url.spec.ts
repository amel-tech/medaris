import {
  authPageUnderCallbackLocale,
  destinationFromCallback,
} from "../src/callback-url";

const options = {
  baseUrl: "http://localhost:4000",
  locales: ["en", "tr", "ar"] as const,
};

describe("destinationFromCallback — sign-in destinations (MDRS-101)", () => {
  it("keeps a page the middleware stopped, with its query", () => {
    expect(destinationFromCallback("/tr/learning?page=2", options)).toBe(
      "/tr/learning?page=2"
    );
    expect(
      destinationFromCallback("http://localhost:4000/tr/decks", options)
    ).toBe("/tr/decks");
  });

  it("treats a missing callback, the origin and a locale root as none", () => {
    for (const none of [
      undefined,
      null,
      "",
      "/",
      "http://localhost:4000",
      "http://localhost:4000/",
      "/tr",
      "/en/",
      "http://localhost:4000/ar",
    ]) {
      expect(destinationFromCallback(none, options)).toBeNull();
    }
  });

  it("refuses anything off-origin, so the page is no open redirect", () => {
    for (const offOrigin of [
      "https://evil.example/tr/learning",
      "//evil.example/tr/learning",
      "http://localhost:4001/tr/learning",
      "https://localhost:4000/tr/learning",
    ]) {
      expect(destinationFromCallback(offOrigin, options)).toBeNull();
    }
  });

  it("returns null for a base it cannot parse", () => {
    expect(
      destinationFromCallback("/tr/learning", { ...options, baseUrl: "" })
    ).toBeNull();
  });
});

describe("authPageUnderCallbackLocale — the sign-in page keeps the reader's language (MDRS-274)", () => {
  const opts = {
    authPaths: ["/auth/signin", "/auth/signout", "/auth/error"],
    locales: ["tr", "en", "ar"],
  };
  const at = (pathname: string, search = "") =>
    authPageUnderCallbackLocale({ pathname, search }, opts);

  it("moves a locale-less auth page under the callback's locale, query and all", () => {
    const search = `?callbackUrl=${encodeURIComponent("https://nizam.medaris.app/en/kosks")}`;
    expect(at("/auth/signin", search)).toBe(`/en/auth/signin${search}`);
    const ar = `?callbackUrl=${encodeURIComponent("/ar/courses/1")}`;
    expect(at("/auth/signin/", ar)).toBe(`/ar/auth/signin${ar}`);
  });

  it("leaves the default to next-intl when the callback names no locale", () => {
    expect(at("/auth/signin")).toBeNull();
    expect(
      at("/auth/signin", "?callbackUrl=https%3A%2F%2Fnizam.medaris.app")
    ).toBeNull();
    expect(at("/auth/signin", "?callbackUrl=%2Fde%2Fx")).toBeNull();
  });

  it("does nothing to a page that already has a locale or is not an auth page", () => {
    const search = "?callbackUrl=%2Fen%2Fkosks";
    expect(at("/tr/auth/signin", search)).toBeNull();
    expect(at("/en/kosks", search)).toBeNull();
    expect(at("/auth/signinx", search)).toBeNull();
  });
});
