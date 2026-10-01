import { destinationFromCallback } from "../src/callback-url";

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
