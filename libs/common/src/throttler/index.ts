// `resolveThrottlerTtl` is the one resolver with a consumer outside this
// package (apps/tedrisat/src/config/throttle-env.ts's bulk-window fallback);
// buildThrottlerOptions, resolveThrottlerLimit and the internal parsing
// helpers stay unexported — no code outside throttler.config.ts /
// throttler.module.ts reads them, matching the convention
// libs/common/src/config/cors.config.ts sets for this package.
export { resolveThrottlerTtl } from "./throttler.config";
export * from "./throttler.module";
