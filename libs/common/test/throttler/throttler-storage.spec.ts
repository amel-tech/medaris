import { MemoryThrottlerStorage } from "../../src/throttler/throttler-storage";

/**
 * The store both throttling layers count in. The test that matters most is
 * "lifting one key's block": `ThrottlerStorageService` 6.5.0 fails it, because
 * it clears every key's expiry timers when one key's block lifts.
 */

const TTL = 60_000;
const LIMIT = 3;

describe("MemoryThrottlerStorage", () => {
  let storage: MemoryThrottlerStorage;
  const hit = (key: string) => storage.increment(key, TTL, LIMIT, TTL, "user");

  beforeEach(() => {
    vi.useFakeTimers({ now: 1_000_000 });
    storage = new MemoryThrottlerStorage();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts up to the limit and blocks the hit over it, for blockDuration", async () => {
    for (let n = 1; n <= LIMIT; n++) {
      const record = await hit("a");
      expect(record.totalHits).toBe(n);
      expect(record.isBlocked).toBe(false);
    }

    const refused = await hit("a");
    expect(refused.isBlocked).toBe(true);
    expect(refused.timeToBlockExpire).toBe(60);
  });

  it("lets each hit stop counting ttl after it was made", async () => {
    await hit("a");
    vi.advanceTimersByTime(30_000);
    await hit("a");
    vi.advanceTimersByTime(30_000);

    const record = await hit("a");
    expect(record.totalHits).toBe(2);
    expect(record.isBlocked).toBe(false);
  });

  it("counts nothing while blocked and starts again from zero when the block lifts", async () => {
    for (let n = 0; n <= LIMIT; n++) await hit("a");
    vi.advanceTimersByTime(TTL - 1);
    expect((await hit("a")).isBlocked).toBe(true);

    vi.advanceTimersByTime(1);
    const record = await hit("a");
    expect(record.isBlocked).toBe(false);
    expect(record.totalHits).toBe(1);
  });

  it("lifting one key's block leaves every other key's hits expiring", async () => {
    for (let n = 0; n <= LIMIT; n++) await hit("a");
    vi.advanceTimersByTime(TTL - 1_000);
    await hit("b");
    await hit("b");
    vi.advanceTimersByTime(1_000);
    // a's block has lifted; this hit is the one that resets it.
    expect((await hit("a")).isBlocked).toBe(false);

    vi.advanceTimersByTime(TTL);
    expect((await hit("b")).totalHits).toBe(1);
  });

  it("keeps keys apart", async () => {
    for (let n = 0; n <= LIMIT; n++) await hit("a");

    const other = await hit("b");
    expect(other.isBlocked).toBe(false);
    expect(other.totalHits).toBe(1);
  });

  it("forgets a key once nothing in it counts any more", async () => {
    await hit("a");
    for (let n = 0; n <= LIMIT; n++) await hit("blocked");
    expect(storage.size).toBe(2);

    vi.advanceTimersByTime(TTL);
    await hit("b");
    expect(storage.size).toBe(1);
  });
});
