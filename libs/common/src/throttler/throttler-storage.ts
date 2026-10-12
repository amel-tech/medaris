import type { ThrottlerStorage } from "@nestjs/throttler";

/** Not exported by the package's entry point, so read off the interface. */
type ThrottlerStorageRecord = Awaited<
  ReturnType<ThrottlerStorage["increment"]>
>;

/** How often keys with nothing left to count are dropped. */
const SWEEP_INTERVAL_MS = 60_000;

interface Entry {
  /** When each counted hit stops counting, oldest first. */
  expiries: number[];
  /** When the block lifts; 0 when the key is not blocked. */
  blockedUntil: number;
}

/**
 * The in-memory store `RateLimitModule` counts in, replacing
 * `ThrottlerStorageService`, the library's default (6.5.0).
 *
 * That store keeps its expiry timers per throttler name, and lifting one key's
 * block clears all of them: every other key's hits then stop expiring, and
 * their counts only grow until those keys are refused in turn. It also never
 * forgets a key. Keyed by address, both stayed small; keyed by user, there is
 * a key per person per route, and one person's block would freeze everyone's
 * counts.
 *
 * The counting is otherwise the same: a hit stops counting `ttl` after it was
 * made, the hit over `limit` is refused and blocks the key for
 * `blockDuration`, nothing is counted while blocked, and the count starts
 * again from zero when the block lifts. Per process, like the store it
 * replaces: with more than one replica the effective limit is the configured
 * one times the replica count.
 */
export class MemoryThrottlerStorage implements ThrottlerStorage {
  private readonly entries = new Map<string, Entry>();
  private nextSweepAt = 0;

  /** Keys currently held, for the spec. */
  get size(): number {
    return this.entries.size;
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    _throttlerName: string
  ): Promise<ThrottlerStorageRecord> {
    const now = Date.now();
    this.sweep(now);

    let entry = this.entries.get(key);
    if (!entry) {
      entry = { expiries: [], blockedUntil: 0 };
      this.entries.set(key, entry);
    }

    if (entry.blockedUntil !== 0 && entry.blockedUntil <= now) {
      entry.blockedUntil = 0;
      entry.expiries = [];
    }
    dropExpired(entry.expiries, now);

    if (entry.blockedUntil === 0) {
      entry.expiries.push(now + ttl);
      if (entry.expiries.length > limit) {
        entry.blockedUntil = now + blockDuration;
      }
    }

    const isBlocked = entry.blockedUntil !== 0;
    return {
      totalHits: entry.expiries.length,
      timeToExpire: secondsUntil(entry.expiries[0] ?? now, now),
      isBlocked,
      timeToBlockExpire: isBlocked ? secondsUntil(entry.blockedUntil, now) : 0,
    };
  }

  private sweep(now: number): void {
    if (now < this.nextSweepAt) return;
    this.nextSweepAt = now + SWEEP_INTERVAL_MS;

    for (const [key, entry] of this.entries) {
      const lastExpiry = entry.expiries[entry.expiries.length - 1] ?? 0;
      if (entry.blockedUntil <= now && lastExpiry <= now) {
        this.entries.delete(key);
      }
    }
  }
}

function dropExpired(expiries: number[], now: number): void {
  let expired = 0;
  while (expired < expiries.length && expiries[expired] <= now) expired++;
  if (expired > 0) expiries.splice(0, expired);
}

function secondsUntil(at: number, now: number): number {
  return Math.max(0, Math.ceil((at - now) / 1000));
}
