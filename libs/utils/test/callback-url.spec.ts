import { destinationFromCallback } from "../src/callback-url";

const options = { baseUrl: "http://localhost:4000" };

describe("destinationFromCallback — sign-in destinations (MDRS-101)", () => {
  it("keeps a page the middleware stopped, with its query", () => {
    expect(destinationFromCallback("/learning?page=2", options)).toBe(
      "/learning?page=2"
    );
    expect(
      destinationFromCallback("http://localhost:4000/decks", options)
    ).toBe("/decks");
  });

  it("treats a missing callback, the origin and the root as none", () => {
    for (const none of [
      undefined,
      null,
      "",
      "/",
      "http://localhost:4000",
      "http://localhost:4000/",
    ]) {
      expect(destinationFromCallback(none, options)).toBeNull();
    }
  });

  it("refuses anything off-origin, so the page is no open redirect", () => {
    for (const offOrigin of [
      "https://evil.example/learning",
      "//evil.example/learning",
      "http://localhost:4001/learning",
      "https://localhost:4000/learning",
    ]) {
      expect(destinationFromCallback(offOrigin, options)).toBeNull();
    }
  });

  it("returns null for a base it cannot parse", () => {
    expect(
      destinationFromCallback("/learning", { ...options, baseUrl: "" })
    ).toBeNull();
  });
});
