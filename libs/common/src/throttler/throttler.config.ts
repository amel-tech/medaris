import type { ThrottlerOptions } from "@nestjs/throttler";

/**
 * Two budgets, both per route and per window: `ThrottlerGuard.generateKey`
 * hashes the controller class and the handler name into the storage key, so a
 * caller that has spent its budget on one endpoint still reaches the others.
 *
 * The address layer (`THROTTLE_LIMIT`) is keyed by the client's address and
 * runs before the token is verified. In production that address is the
 * reverse proxy's, or mdrs1's for the calls tedris, nazar and nizam make from
 * their servers, for nearly every request: it is a ceiling for the whole
 * platform on one route, not one caller's budget. 3000 a minute is the value
 * production has run on since the 2026-10-12 incident, in which 100 refused
 * thousands of requests once a few hundred people had signed in.
 *
 * The per-user layer (`THROTTLE_USER_LIMIT`) is keyed by the verified token's
 * `sub`. 100 a minute is sized for one person: the heaviest screen (a deck
 * with its cards and labels) issues well under ten calls to any one route per
 * page load, so it takes more than ten loads of it in one minute to get near.
 */
const DEFAULT_TTL_MS = 60_000;
const DEFAULT_LIMIT = 3000;
const DEFAULT_USER_LIMIT = 100;

/**
 * The per-user layer's throttler name. A route tunes that layer with
 * `@Throttle({ user: … })` and the address layer with `@Throttle({ default: … })`;
 * neither override reaches the other layer.
 */
export const USER_THROTTLER = "user";

function fail(key: string, raw: string, reason: string): never {
  throw new Error(
    `${key} is not usable: "${raw}" ${reason}. ` +
      "Set it to a positive whole number — a count for the limits, milliseconds " +
      "for the windows, as in THROTTLE_TTL=60000, THROTTLE_LIMIT=3000 and " +
      "THROTTLE_USER_LIMIT=100. See the repository-root .env.example, where " +
      "these keys carry the API__ prefix (API__THROTTLE_LIMIT and so on) — " +
      "MDRS-25 strips it on the way in, so the name above is what the app " +
      "reads, not what you set."
  );
}

/**
 * Read a count or a duration, refusing anything that is not a positive integer.
 *
 * Deliberately strict rather than `parseInt`-and-hope: `parseInt("10 per min")`
 * is 10 and `parseInt("abc")` is NaN, and a NaN limit makes the store compare
 * its hit count with NaN — always false, so every request is allowed and the
 * rate limiter silently does nothing. A typo has to stop the boot, not disable
 * the guard.
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

/** Length of the address layer's window, in milliseconds (`THROTTLE_TTL`). */
export function resolveThrottlerTtl(
  env: NodeJS.ProcessEnv = process.env
): number {
  return readPositiveInt(env, "THROTTLE_TTL", DEFAULT_TTL_MS);
}

/** Requests per route inside that window, per address (`THROTTLE_LIMIT`). */
function resolveThrottlerLimit(env: NodeJS.ProcessEnv = process.env): number {
  return readPositiveInt(env, "THROTTLE_LIMIT", DEFAULT_LIMIT);
}

/**
 * Length of the per-user window (`THROTTLE_USER_TTL`). Falls back to
 * `THROTTLE_TTL`, so an operator who widens that window moves both layers.
 */
export function resolveUserThrottlerTtl(
  env: NodeJS.ProcessEnv = process.env
): number {
  return readPositiveInt(env, "THROTTLE_USER_TTL", resolveThrottlerTtl(env));
}

/** Requests per route inside that window, per user (`THROTTLE_USER_LIMIT`). */
function resolveUserThrottlerLimit(
  env: NodeJS.ProcessEnv = process.env
): number {
  return readPositiveInt(env, "THROTTLE_USER_LIMIT", DEFAULT_USER_LIMIT);
}

/**
 * The options `ThrottlerModule` is registered with: the address layer, which
 * the global `ThrottlerGuard` enforces.
 *
 * A single unnamed throttler, on purpose. With more than one named throttler
 * in these options every one of them is enforced on every route by that guard,
 * and it runs before `AuthGuard` — so the per-user layer declared here would
 * count every request by address against one person's budget. That layer has
 * its own options instead (`buildUserThrottlerOptions`), read by its own
 * `ThrottlerGuard` instance, `UserThrottlerInterceptor`.
 *
 * The store is `MemoryThrottlerStorage` (./throttler-storage.ts), set by
 * `RateLimitModule` and shared by both layers. It counts per process, so with
 * more than one replica the effective limit is the configured one multiplied
 * by the replica count. Redis is what fixes that — the connection details
 * already exist as `redis.host` / `redis.port` / `redis.password` in
 * apps/tedrisat/src/config/config.ts — and it has to land before tedrisat is
 * scaled past a single instance.
 */
export function buildThrottlerOptions(env: NodeJS.ProcessEnv = process.env): {
  throttlers: ThrottlerOptions[];
} {
  return {
    throttlers: [
      {
        ttl: resolveThrottlerTtl(env),
        limit: resolveThrottlerLimit(env),
      },
    ],
  };
}

/** The per-user layer's options, read by `UserThrottlerInterceptor`. */
export function buildUserThrottlerOptions(
  env: NodeJS.ProcessEnv = process.env
): { throttlers: ThrottlerOptions[] } {
  return {
    throttlers: [
      {
        name: USER_THROTTLER,
        ttl: resolveUserThrottlerTtl(env),
        limit: resolveUserThrottlerLimit(env),
      },
    ],
  };
}
