import {
  buildThrottlerOptions,
  buildUserThrottlerOptions,
  resolveUserThrottlerTtl,
} from "../../src/throttler/throttler.config";

const env = (values: Record<string, string>) => values as NodeJS.ProcessEnv;

describe("throttler config", () => {
  describe("the address layer", () => {
    it("defaults to 3000 per route per minute, a ceiling for a shared address", () => {
      expect(buildThrottlerOptions(env({}))).toEqual({
        throttlers: [{ ttl: 60_000, limit: 3000 }],
      });
    });

    it("reads THROTTLE_LIMIT and THROTTLE_TTL", () => {
      expect(
        buildThrottlerOptions(
          env({ THROTTLE_LIMIT: "500", THROTTLE_TTL: "30000" })
        )
      ).toEqual({ throttlers: [{ ttl: 30_000, limit: 500 }] });
    });
  });

  describe("the per-user layer", () => {
    it("defaults to 100 per route per minute under the name `user`", () => {
      expect(buildUserThrottlerOptions(env({}))).toEqual({
        throttlers: [{ name: "user", ttl: 60_000, limit: 100 }],
      });
    });

    it("reads THROTTLE_USER_LIMIT", () => {
      expect(
        buildUserThrottlerOptions(env({ THROTTLE_USER_LIMIT: "40" }))
          .throttlers[0].limit
      ).toBe(40);
    });

    it("follows THROTTLE_TTL when THROTTLE_USER_TTL is unset", () => {
      expect(resolveUserThrottlerTtl(env({ THROTTLE_TTL: "30000" }))).toBe(
        30_000
      );
    });

    it("prefers THROTTLE_USER_TTL when both are set", () => {
      expect(
        resolveUserThrottlerTtl(
          env({ THROTTLE_TTL: "30000", THROTTLE_USER_TTL: "5000" })
        )
      ).toBe(5000);
    });

    it.each([
      ["0", /zero/],
      ["ten", /not a whole number/],
      ["10 per min", /not a whole number/],
      ["99999999999999999999", /safe integer/],
    ])("refuses THROTTLE_USER_LIMIT=%s rather than misreading it", (raw, reason) => {
      expect(() =>
        buildUserThrottlerOptions(env({ THROTTLE_USER_LIMIT: raw }))
      ).toThrow(reason);
      expect(() =>
        buildUserThrottlerOptions(env({ THROTTLE_USER_LIMIT: raw }))
      ).toThrow(/THROTTLE_USER_LIMIT/);
    });

    it("refuses a malformed THROTTLE_USER_TTL", () => {
      expect(() =>
        buildUserThrottlerOptions(env({ THROTTLE_USER_TTL: "1m" }))
      ).toThrow(/THROTTLE_USER_TTL/);
    });
  });
});
