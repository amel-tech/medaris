import type { ThrottlerModuleOptions } from "@nestjs/throttler";

/**
 * Requests one client may make to a single route inside one window.
 *
 * The limit is per route, not per API: `ThrottlerGuard.generateKey` hashes the
 * controller class and the handler name into the storage key, so a client that
 * has exhausted its budget on one endpoint still reaches the others. That is
 * what makes a global default safe to set at all — a shared counter across
 * every route would have to be sized for the busiest client of the busiest
 * screen, which is no limit at all.
 *
 * 100/minute is a ceiling on abuse, not a quota anyone should feel: the web
 * apps' heaviest screen (a deck with its cards and labels) issues well under
 * ten calls to any one route per page load.
 */
const DEFAULT_TTL_MS = 60_000;
const DEFAULT_LIMIT = 100;

function fail(key: string, raw: string, reason: string): never {
  throw new Error(
    `${key} is not usable: "${raw}" ${reason}. ` +
      "Set it to a positive whole number — a count for the limits, milliseconds " +
      "for the windows, as in THROTTLE_TTL=60000 and THROTTLE_LIMIT=100. " +
      "See the repository-root .env.example, where these keys carry the API__ " +
      "prefix (API__THROTTLE_LIMIT and so on) — MDRS-25 strips it on the way in, " +
      "so the name above is what the app reads, not what you set."
  );
}

/**
 * Read a count or a duration, refusing anything that is not a positive integer.
 *
 * Deliberately strict rather than `parseInt`-and-hope: `parseInt("10 per min")`
 * is 10 and `parseInt("abc")` is NaN, and a NaN limit makes
 * `ThrottlerStorageService` compare `totalHits > NaN` — always false, so every
 * request is allowed and the rate limiter silently does nothing. A typo has to
 * stop the boot, not disable the guard.
 */
function readPositiveInt(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number
): number {
  const raw = env[key]?.trim();

  if (!raw) {
    return fallback;
  }

  if (!/^\d+$/.test(raw)) {
    fail(key, raw, "is not a whole number");
  }

  const value = Number(raw);

  if (value === 0) {
    // Zero would not mean "no limit" — it means every request is over budget
    // and the API answers 429 to everyone. Unset the variable instead.
    fail(key, raw, "is zero, which would refuse every request");
  }

  if (!Number.isSafeInteger(value)) {
    fail(key, raw, "is too large to be a safe integer");
  }

  return value;
}

/** Length of the default window, in milliseconds (`THROTTLE_TTL`). */
export function resolveThrottlerTtl(
  env: NodeJS.ProcessEnv = process.env
): number {
  return readPositiveInt(env, "THROTTLE_TTL", DEFAULT_TTL_MS);
}

/** Requests allowed per route inside that window (`THROTTLE_LIMIT`). */
function resolveThrottlerLimit(env: NodeJS.ProcessEnv = process.env): number {
  return readPositiveInt(env, "THROTTLE_LIMIT", DEFAULT_LIMIT);
}

/**
 * Build the options `ThrottlerModule` is registered with.
 *
 * A single unnamed throttler, on purpose. With more than one named throttler
 * every one of them is enforced on every route, and a route-level `@Throttle`
 * can only override the ones it names — so a "bulk" throttler declared here
 * would also apply to the health check, and a route overriding it would be
 * measured against both budgets at once. tedrisat's bulk routes take a
 * stricter budget this way already, as an override of `default`
 * (`apps/tedrisat/src/config/throttle-env.ts`), not a second throttler here —
 * this module has no bulk-specific concept, since teskilat has no bulk route
 * to share one with.
 *
 * The store is `ThrottlerStorageService`, the in-memory default. It counts per
 * process, so with more than one replica the effective limit is the configured
 * one multiplied by the replica count. Redis is what fixes that — the
 * connection details already exist as `redis.host` / `redis.port` /
 * `redis.password` in apps/tedrisat/src/config/config.ts — and it has to land
 * before tedrisat is scaled past a single instance.
 */
export function buildThrottlerOptions(
  env: NodeJS.ProcessEnv = process.env
): ThrottlerModuleOptions {
  return {
    throttlers: [
      {
        ttl: resolveThrottlerTtl(env),
        limit: resolveThrottlerLimit(env),
      },
    ],
  };
}
