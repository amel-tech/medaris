import { resolveThrottlerTtl } from "@medaris/common";
import type { ThrottlerOptions } from "@nestjs/throttler";

/**
 * The bulk routes get their own, much lower budget than the shared default
 * (MDRS-31).
 *
 * `POST /flashcard/decks/:deckId/cards/bulk/import` accepts a 5MB workbook
 * (../flashcard/flashcard.controller.ts) and `ExcelService.parseSheet` walks
 * every row of it in-process, so ten of those a minute is already an order of
 * magnitude more work than a hundred ordinary reads. Ten is also enough for
 * the real interaction: a person importing decks one file at a time never
 * approaches it.
 *
 * This lives here, not in `libs/common/src/throttler/`, because it is
 * tedrisat-only tuning: teskilat has no bulk route and no `@Throttle` override
 * to feed it. The generic default budget and `RateLimitModule` stay shared —
 * this file mirrors `security-env.ts` / `swagger-env.ts` next to it, each
 * owning the app-specific slice of the environment its own app reads.
 */
const DEFAULT_BULK_LIMIT = 10;

function fail(key: string, raw: string, reason: string): never {
  throw new Error(
    `${key} is not usable: "${raw}" ${reason}. ` +
      "Set it to a positive whole number — a count for the limit, milliseconds " +
      "for the window, as in THROTTLE_BULK_LIMIT=10. See the repository-root " +
      ".env.example, where this key carries the API__ prefix " +
      "(API__THROTTLE_BULK_LIMIT) — MDRS-25 strips it on the way in, so the " +
      "name above is what the app reads, not what you set."
  );
}

/**
 * Read a count or a duration, refusing anything that is not a positive
 * integer. Deliberately strict rather than `parseInt`-and-hope — see the
 * identical helper in libs/common/src/throttler/throttler.config.ts for why a
 * NaN limit is worse than none.
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
    fail(key, raw, "is zero, which would refuse every request");
  }

  if (!Number.isSafeInteger(value)) {
    fail(key, raw, "is too large to be a safe integer");
  }

  return value;
}

/**
 * Window for the bulk routes (`THROTTLE_BULK_TTL`).
 *
 * Falls back to the shared default window rather than to a constant of its
 * own, so an operator who widens `THROTTLE_TTL` does not silently leave the
 * expensive routes measuring against the old one.
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
 * Read both once, purely so a malformed value stops the boot rather than
 * surfacing as a 500 on the first import — call from `config/config.ts`'s
 * factory, which every other eager env check in this app already goes
 * through (see `readSecurityEnv`).
 */
export function assertBulkThrottleEnv(env: NodeJS.ProcessEnv = process.env) {
  resolveBulkThrottlerTtl(env);
  resolveBulkThrottlerLimit(env);
}

/**
 * The override handed to `@Throttle({ default: BULK_THROTTLE })`.
 *
 * Both fields are resolver functions rather than numbers because a decorator
 * argument is evaluated when the controller class is defined — which happens
 * while `AppModule` is being imported, and would freeze whatever the
 * environment held at that moment into the compiled module. `ThrottlerGuard`
 * calls `resolveValue` on every request, so this reads the environment as it
 * is, and a deployment can retune the expensive routes without a rebuild. The
 * `context` argument is unused: the budget is per route already.
 */
export const BULK_THROTTLE: Pick<ThrottlerOptions, "limit" | "ttl"> = {
  limit: () => resolveBulkThrottlerLimit(),
  ttl: () => resolveBulkThrottlerTtl(),
};
