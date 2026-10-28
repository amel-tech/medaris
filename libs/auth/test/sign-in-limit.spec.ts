import {
  DEFAULT_SIGN_IN_LIMIT,
  parseSignInLimit,
} from "../src/shared/sign-in-limit";

describe("parseSignInLimit (AUTH_SIGN_IN_LIMIT)", () => {
  it("reads <count>/<seconds>", () => {
    expect(parseSignInLimit("30/60")).toEqual({ max: 30, windowMs: 60_000 });
    expect(parseSignInLimit(" 5/300 ")).toEqual(DEFAULT_SIGN_IN_LIMIT);
  });

  it("means the defaults when unset or empty", () => {
    expect(parseSignInLimit(undefined)).toBeUndefined();
    expect(parseSignInLimit("")).toBeUndefined();
    expect(parseSignInLimit("  ")).toBeUndefined();
  });

  it.each([
    "30",
    "30/",
    "/60",
    "0/60",
    "30/0",
    "-1/60",
    "30/60s",
    "30 / 60",
    "abc",
  ])("refuses %j instead of keeping the default silently", (value) => {
    expect(() => parseSignInLimit(value)).toThrow(/AUTH_SIGN_IN_LIMIT/);
  });
});
