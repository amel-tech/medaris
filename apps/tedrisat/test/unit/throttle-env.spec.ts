import {
  assertBulkThrottleEnv,
  resolveBulkThrottlerLimit,
  resolveBulkThrottlerTtl,
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
  });
});
