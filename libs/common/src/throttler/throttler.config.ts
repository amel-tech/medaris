import type {
  ThrottlerModuleOptions,
  ThrottlerOptions,
} from "@nestjs/throttler";

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

/**
 * The bulk routes get their own, much lower budget.
 *
 * `POST /flashcard/decks/:deckId/cards/bulk/import` accepts a 5MB workbook
 * (apps/tedrisat/src/flashcard/flashcard.controller.ts) and
 * `ExcelService.parseSheet` walks every row of it in-process, so ten of those a
 * minute is already an order of magnitude more work than a hundred ordinary
 * reads. Ten is also enough for the real interaction: a person importing decks
 * one file at a time never approaches it.
 */
const DEFAULT_BULK_LIMIT = 10;

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
export function resolveThrottlerLimit(
  env: NodeJS.ProcessEnv = process.env
): number {
  return readPositiveInt(env, "THROTTLE_LIMIT", DEFAULT_LIMIT);
}

/**
 * Window for the bulk routes (`THROTTLE_BULK_TTL`).
 *
 * Falls back to the default window rather than to a constant of its own, so an
 * operator who widens `THROTTLE_TTL` does not silently leave the expensive
 * routes measuring against the old one.
 */
export function resolveBulkThrottlerTtl(
  env: NodeJS.ProcessEnv = process.env
): number {
  return readPositiveInt(env, "THROTTLE_BULK_TTL", resolveThrottlerTtl(env));
}

/** Requests allowed on a bulk route inside that window (`THROTTLE_BULK_LIMIT`). */
export function resolveBulkThrottlerLimit(
  env: NodeJS.ProcessEnv = process.env
): number {
  return readPositiveInt(env, "THROTTLE_BULK_LIMIT", DEFAULT_BULK_LIMIT);
}

/**
 * The override handed to `@Throttle({ default: BULK_THROTTLE })`.
 *
 * Both fields are resolver functions rather than numbers because a decorator
 * argument is evaluated when the controller class is defined — which happens
 * while `AppModule` is being imported, and would freeze whatever the
 * environment held at that moment into the compiled module. `ThrottlerGuard`
 * calls `resolveValue` on every request, so this reads the environment as it
 * is, and a deployment can retune the expensive routes without a rebuild.
 * The `context` argument is unused: the budget is per route already.
 */
export const BULK_THROTTLE: Pick<ThrottlerOptions, "limit" | "ttl"> = {
  limit: () => resolveBulkThrottlerLimit(),
  ttl: () => resolveBulkThrottlerTtl(),
};

/**
 * Build the options `ThrottlerModule` is registered with.
 *
 * A single unnamed throttler, on purpose. With more than one named throttler
 * every one of them is enforced on every route, and a route-level `@Throttle`
 * can only override the ones it names — so a "bulk" throttler declared here
 * would also apply to the health check, and the bulk routes would be measured
 * against both budgets at once. The stricter bulk budget is therefore an
 * override of `default` (see BULK_THROTTLE), not a second throttler.
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
  // Read at boot purely so a malformed value stops it. The bulk budget itself
  // is resolved per request through BULK_THROTTLE, and without these two calls
  // a typo in THROTTLE_BULK_LIMIT would first surface as a 500 on an import,
  // long after the deployment looked healthy.
  resolveBulkThrottlerTtl(env);
  resolveBulkThrottlerLimit(env);

  return {
    throttlers: [
      {
        ttl: resolveThrottlerTtl(env),
        limit: resolveThrottlerLimit(env),
      },
    ],
  };
}
