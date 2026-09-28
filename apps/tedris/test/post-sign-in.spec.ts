import { describe, expect, it } from "vitest";
import { locales } from "~/lib/i18n/routing";
import {
  hasWelcomed,
  resolvePostSignInPath,
  signInCallbackUrl,
  WELCOMED_COOKIE_MAX_USERS,
  withWelcomed,
} from "~/lib/post-sign-in";

describe("after sign-in: B1 once, /learning afterwards (MDRS-101)", () => {
  it("sends a brand-new user to the first-login screen", () => {
    expect(
      resolvePostSignInPath({
        locale: "tr",
        welcomed: false,
        enrolledCourses: 0,
      })
    ).toBe("/tr/welcome");
  });

  it("sends a user who has left B1 to /learning", () => {
    expect(
      resolvePostSignInPath({
        locale: "tr",
        welcomed: true,
        enrolledCourses: 0,
      })
    ).toBe("/tr/learning");
  });

  it("sends an enrolled user on a new device to /learning", () => {
    expect(
      resolvePostSignInPath({
        locale: "ar",
        welcomed: false,
        enrolledCourses: 2,
      })
    ).toBe("/ar/learning");
  });
});

describe("the sign-in page's callbackUrl (MDRS-101)", () => {
  const options = { baseUrl: "http://localhost:4000", locales, locale: "tr" };

  it("routes a sign-in that names no page through /start", () => {
    // What NextAuth sends when nothing was asked for: the app's origin.
    expect(signInCallbackUrl("http://localhost:4000", options)).toBe(
      "/tr/start"
    );
    expect(signInCallbackUrl(undefined, options)).toBe("/tr/start");
    expect(signInCallbackUrl("/tr", options)).toBe("/tr/start");
  });

  it("returns a visitor to the page the middleware stopped", () => {
    expect(signInCallbackUrl("/tr/kosks/42", options)).toBe("/tr/kosks/42");
  });

  it("never follows a callback off this origin", () => {
    expect(signInCallbackUrl("https://evil.example/tr", options)).toBe(
      "/tr/start"
    );
  });
});

describe("the welcomed cookie is per user, not per browser (MDRS-101)", () => {
  it("remembers each user who left B1", () => {
    const value = withWelcomed(withWelcomed(undefined, "a"), "b");
    expect(hasWelcomed(value, "a")).toBe(true);
    expect(hasWelcomed(value, "b")).toBe(true);
    expect(hasWelcomed(value, "c")).toBe(false);
  });

  it("never matches without a subject", () => {
    expect(hasWelcomed(withWelcomed(undefined, "a"), undefined)).toBe(false);
    expect(hasWelcomed("", "")).toBe(false);
  });

  it("keeps the most recent users and no duplicates", () => {
    let value: string | undefined;
    for (let i = 0; i <= WELCOMED_COOKIE_MAX_USERS; i++) {
      value = withWelcomed(value, `u${i}`);
    }
    value = withWelcomed(value, `u${WELCOMED_COOKIE_MAX_USERS}`);
    expect(hasWelcomed(value, "u0")).toBe(false);
    expect(value?.split(".")).toHaveLength(WELCOMED_COOKIE_MAX_USERS);
  });
});
