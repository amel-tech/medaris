import { resolveTrustProxyHops } from "@medaris/common";

/**
 * MDRS-31 follow-up. `libs/common` has no `test` target — see
 * `libs/common/project.json` — so this lives here, the same precedent
 * `cors.config.spec.ts` set for the package's other config resolvers.
 *
 * Every case passes an explicit env object rather than mutating
 * `process.env`, so a case cannot leak into the next one.
 */
describe("resolveTrustProxyHops", () => {
  it("defaults to 0 — trust nothing — when unset", () => {
    expect(resolveTrustProxyHops({} as NodeJS.ProcessEnv)).toBe(0);
  });

  it("treats an empty string as unset", () => {
    expect(
      resolveTrustProxyHops({ TRUST_PROXY_HOPS: "" } as NodeJS.ProcessEnv)
    ).toBe(0);
  });

  it("reads a configured hop count", () => {
    expect(
      resolveTrustProxyHops({ TRUST_PROXY_HOPS: "1" } as NodeJS.ProcessEnv)
    ).toBe(1);
  });

  it("accepts 0 explicitly — unlike the throttle limits, zero is a real value here", () => {
    expect(
      resolveTrustProxyHops({ TRUST_PROXY_HOPS: "0" } as NodeJS.ProcessEnv)
    ).toBe(0);
  });

  it("rejects a non-numeric value rather than silently trusting everything", () => {
    expect(() =>
      resolveTrustProxyHops({ TRUST_PROXY_HOPS: "true" } as NodeJS.ProcessEnv)
    ).toThrow(/TRUST_PROXY_HOPS/);
  });

  it("rejects a negative value", () => {
    expect(() =>
      resolveTrustProxyHops({ TRUST_PROXY_HOPS: "-1" } as NodeJS.ProcessEnv)
    ).toThrow(/TRUST_PROXY_HOPS/);
  });
});
