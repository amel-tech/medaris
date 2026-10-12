// `resolveUserThrottlerTtl` is the one resolver with a consumer outside this
// package (apps/tedrisat/src/config/throttle-env.ts's bulk-window fallback);
// the other resolvers, the option builders, the interceptor and the store stay
// unexported — no code outside this directory reads them, matching the
// convention libs/common/src/config/cors.config.ts sets for this package.
export { resolveUserThrottlerTtl } from "./throttler.config";
export * from "./throttler.module";
