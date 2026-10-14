import {
  assertBulkThrottleEnv,
  resolveBulkThrottlerLimit,
  resolveBulkThrottlerTtl,
  resolvePartnerThrottlerLimit,
  resolvePartnerThrottlerTtl,
} from "../../src/config/throttle-env";

/**
 * MDRS-31. The happy path — the bulk routes actually enforcing this budget —
 * is asserted end to end in test/e2e/throttler.e2e.spec.ts; this covers the
 * validation this file owns since it moved out of libs/common (a
 * tedrisat-only concern: teskilat has no bulk route to share a budget with).
 */
describe("bulk throttle env", () => {
  describe("resolveBulkThrottlerLimit", () => {
    it("defaults to 10 when unset", () => {
      expect(resolveBulkThrottlerLimit({} as NodeJS.ProcessEnv)).toBe(10);
    });

    it("reads a configured value", () => {
      expect(
        resolveBulkThrottlerLimit({
          THROTTLE_BULK_LIMIT: "5",
        } as NodeJS.ProcessEnv)
      ).toBe(5);
    });

    it("refuses zero rather than refusing every request", () => {
      expect(() =>
        resolveBulkThrottlerLimit({
          THROTTLE_BULK_LIMIT: "0",
        } as NodeJS.ProcessEnv)
      ).toThrow(/THROTTLE_BULK_LIMIT/);
    });

    it("refuses a non-numeric value rather than silently disabling the guard", () => {
      expect(() =>
        resolveBulkThrottlerLimit({
          THROTTLE_BULK_LIMIT: "ten",
        } as NodeJS.ProcessEnv)
      ).toThrow(/THROTTLE_BULK_LIMIT/);
    });
  });

  describe("resolveBulkThrottlerTtl", () => {
    it("falls back to THROTTLE_TTL when THROTTLE_BULK_TTL is unset", () => {
      expect(
        resolveBulkThrottlerTtl({
          THROTTLE_TTL: "30000",
        } as NodeJS.ProcessEnv)
      ).toBe(30000);
    });

    // The bulk budget overrides the per-user layer, so it measures against
    // that layer's window when one is set (2026-10-12).
    it("follows THROTTLE_USER_TTL over THROTTLE_TTL when THROTTLE_BULK_TTL is unset", () => {
      expect(
        resolveBulkThrottlerTtl({
          THROTTLE_TTL: "30000",
          THROTTLE_USER_TTL: "20000",
        } as NodeJS.ProcessEnv)
      ).toBe(20000);
    });

    it("prefers THROTTLE_BULK_TTL over THROTTLE_TTL when both are set", () => {
      expect(
        resolveBulkThrottlerTtl({
          THROTTLE_TTL: "30000",
          THROTTLE_BULK_TTL: "5000",
        } as NodeJS.ProcessEnv)
      ).toBe(5000);
    });
  });

  describe("assertBulkThrottleEnv", () => {
    it("does not throw for a valid or unset environment", () => {
      expect(() =>
        assertBulkThrottleEnv({} as NodeJS.ProcessEnv)
      ).not.toThrow();
    });

    it("throws at read time — the earliest point a boot check can catch it", () => {
      expect(() =>
        assertBulkThrottleEnv({
          THROTTLE_BULK_LIMIT: "not-a-number",
        } as NodeJS.ProcessEnv)
      ).toThrow(/THROTTLE_BULK_LIMIT/);
    });

    it("checks the partner budget too", () => {
      expect(() =>
        assertBulkThrottleEnv({
          THROTTLE_PARTNER_LIMIT: "0",
        } as NodeJS.ProcessEnv)
      ).toThrow(/THROTTLE_PARTNER_LIMIT/);
    });
  });
});

/**
 * Partner enrollments: a partner application's calls share the one subject of
 * its service account, so `/integrations/*` counts per partner against a
 * budget of its own instead of one person's 100 a minute.
 */
describe("partner throttle env", () => {
  it("defaults to 600 a minute per partner and route", () => {
    expect(resolvePartnerThrottlerLimit({} as NodeJS.ProcessEnv)).toBe(600);
    expect(resolvePartnerThrottlerTtl({} as NodeJS.ProcessEnv)).toBe(60_000);
  });

  it("reads THROTTLE_PARTNER_LIMIT and THROTTLE_PARTNER_TTL, falling back to the per-user window", () => {
    expect(
      resolvePartnerThrottlerLimit({
        THROTTLE_PARTNER_LIMIT: "120",
      } as NodeJS.ProcessEnv)
    ).toBe(120);
    expect(
      resolvePartnerThrottlerTtl({
        THROTTLE_USER_TTL: "30000",
      } as NodeJS.ProcessEnv)
    ).toBe(30_000);
    expect(
      resolvePartnerThrottlerTtl({
        THROTTLE_USER_TTL: "30000",
        THROTTLE_PARTNER_TTL: "10000",
      } as NodeJS.ProcessEnv)
    ).toBe(10_000);
  });
});
