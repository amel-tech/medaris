import { ThrottlerException } from "@nestjs/throttler";

/**
 * Reads allowed per feed inside one window (MDRS-120). A calendar app
 * re-reads a feed every few minutes at most; twenty a minute is room for a
 * person pressing "refresh" and a stop for a leaked URL being hammered.
 */
export const FEED_POLL_LIMIT = 20;
export const FEED_POLL_WINDOW_MS = 60_000;

/**
 * Counts reads per feed owner — per resolved token, not per address.
 *
 * Per address says little here: every read arrives through tedris-web, and
 * Google fetches everyone's subscriptions from the same servers, so it would
 * be one budget shared by every user. The route keeps a per-address limit
 * as well (`CALENDAR_FEED_THROTTLE`), which is what bounds requests with
 * made-up tokens; those never reach this counter, so it holds at most one
 * entry per user who has a feed.
 *
 * In memory, per process, like `RateLimitModule`'s store (MDRS-31): with
 * more than one replica the budget multiplies by the replica count.
 */
export class FeedPollLimiter {
  private readonly windows = new Map<
    string,
    { count: number; resetAt: number }
  >();

  constructor(
    private readonly limit = FEED_POLL_LIMIT,
    private readonly windowMs = FEED_POLL_WINDOW_MS
  ) {}

  /** Records one read of `key`'s feed; throws 429 past the limit. */
  hit(key: string, now: number = Date.now()): void {
    const current = this.windows.get(key);
    if (!current || current.resetAt <= now) {
      this.windows.set(key, { count: 1, resetAt: now + this.windowMs });
      return;
    }
    current.count += 1;
    if (current.count > this.limit) throw new ThrottlerException();
  }
}
