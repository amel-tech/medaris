import { describe, expect, it } from "vitest";
import { locales } from "~/lib/i18n/routing";
import { signInCallbackUrl } from "~/lib/post-sign-in";

/**
 * Where a sign-in lands (MDRS-101): the page it named, or Ana sayfa
 * (`/<locale>`) when it named none. There is no first-login step (the
 * welcome screen, B1) in between any more.
 */
describe("the sign-in page's callbackUrl (MDRS-101)", () => {
  const options = { baseUrl: "http://localhost:4000", locales, locale: "tr" };

  it("lands a sign-in that names no page on Ana sayfa, not on a welcome step", () => {
    // What an old link may still carry: the app's origin.
    expect(signInCallbackUrl("http://localhost:4000", options)).toBe("/tr");
    expect(signInCallbackUrl(undefined, options)).toBe("/tr");
    expect(signInCallbackUrl("/tr", options)).toBe("/tr");
    expect(signInCallbackUrl(undefined, { ...options, locale: "ar" })).toBe(
      "/ar"
    );
  });

  it("returns a visitor to the page the proxy stopped", () => {
    expect(signInCallbackUrl("/tr/kosks/42", options)).toBe("/tr/kosks/42");
  });

  it("never follows a callback off this origin", () => {
    expect(signInCallbackUrl("https://evil.example/tr", options)).toBe("/tr");
  });
});
