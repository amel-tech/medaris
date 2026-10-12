import type { StoreBackend } from "../../src/server/store-backend";

/**
 * The session store's key-value commands in memory, with Redis's semantics
 * (`SET … PX NX|XX`, sets that vanish when emptied, `PEXPIRE NX` then `GT`)
 * and the specs' clock for every TTL. Two `createAuth` instances given the
 * same one are two replicas sharing a Valkey. `down = true` makes every call
 * fail as a refused connection does.
 */
export class MemoryBackend implements StoreBackend {
  private readonly entries = new Map<
    string,
    { value: string | Set<string>; expiresAt?: number }
  >();
  down = false;

  constructor(private readonly now: () => number) {}

  private reachable() {
    if (this.down) {
      throw Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:6379"), {
        code: "ECONNREFUSED",
      });
    }
  }

  private live(key: string) {
    const entry = this.entries.get(key);
    if (entry?.expiresAt !== undefined && entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry;
  }

  private string(key: string) {
    const entry = this.live(key);
    if (entry && typeof entry.value !== "string") {
      throw new Error("WRONGTYPE");
    }
    return entry as { value: string; expiresAt?: number } | undefined;
  }

  private set_(key: string) {
    const entry = this.live(key);
    if (entry && typeof entry.value === "string") throw new Error("WRONGTYPE");
    return entry as { value: Set<string>; expiresAt?: number } | undefined;
  }

  async get(key: string) {
    this.reachable();
    return this.string(key)?.value ?? null;
  }

  async set(
    key: string,
    value: string,
    ttlMs: number,
    only?: "absent" | "present"
  ) {
    this.reachable();
    const exists = this.live(key) !== undefined;
    if ((only === "absent" && exists) || (only === "present" && !exists)) {
      return false;
    }
    this.entries.set(key, { value, expiresAt: this.now() + ttlMs });
    return true;
  }

  async del(keys: readonly string[]) {
    this.reachable();
    let count = 0;
    for (const key of keys) {
      if (this.live(key)) count++;
      this.entries.delete(key);
    }
    return count;
  }

  async delIfEquals(key: string, value: string) {
    this.reachable();
    if (this.string(key)?.value !== value) return false;
    this.entries.delete(key);
    return true;
  }

  async addToSet(key: string, member: string, ttlMs: number) {
    this.reachable();
    const entry = this.set_(key) ?? { value: new Set<string>() };
    entry.value.add(member);
    const at = this.now() + ttlMs;
    entry.expiresAt =
      entry.expiresAt === undefined ? at : Math.max(entry.expiresAt, at);
    this.entries.set(key, entry);
  }

  async removeFromSet(key: string, member: string) {
    this.reachable();
    const entry = this.set_(key);
    if (!entry) return;
    entry.value.delete(member);
    if (entry.value.size === 0) this.entries.delete(key);
  }

  async members(key: string) {
    this.reachable();
    return [...(this.set_(key)?.value ?? [])];
  }

  /** Every live key, sorted. */
  keys(): string[] {
    return [...this.entries.keys()].filter((key) => this.live(key)).sort();
  }

  /** Milliseconds left on `key`, or `null` when it is not there. */
  ttl(key: string): number | null {
    const entry = this.live(key);
    if (!entry) return null;
    return entry.expiresAt === undefined ? -1 : entry.expiresAt - this.now();
  }

  /** The raw value under `key` (a string, or a set's members). */
  raw(key: string): string | string[] | undefined {
    const entry = this.live(key);
    if (!entry) return undefined;
    return typeof entry.value === "string" ? entry.value : [...entry.value];
  }
}
