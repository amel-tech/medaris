import { Injectable } from "@nestjs/common";
import { UserIdentity } from "./interfaces/token-claims.interface";
import { LAST_SEEN_REFRESH_HOURS, UserRepository } from "./user.repository";
import { identityFingerprint } from "./user-identity";

const REFRESH_AFTER_MS = LAST_SEEN_REFRESH_HOURS * 60 * 60 * 1000;

/**
 * Upper bound on remembered users. A cache that only ever grows is a memory
 * leak with a slow fuse; past this size the least recently synced entry goes.
 */
const MAX_ENTRIES = 10_000;

interface CacheEntry {
  fingerprint: string;
  syncedAt: number;
}

/**
 * Keeps `users` in step with the tokens that reach tedrisat (MDRS-104)
 * without writing on every request.
 *
 * Per process, in memory: a user whose claims are unchanged and whose row was
 * written less than `LAST_SEEN_REFRESH_HOURS` ago costs nothing. Anything else
 * — first sight, a changed e-mail or name, an expired entry — goes to the
 * database, where `UserRepository.upsert` makes the same decision again for
 * the cases this cache cannot know about (another instance, a restart).
 */
@Injectable()
export class UserSyncService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly users: UserRepository) {}

  /** Writes the row if the cache cannot vouch for it. */
  async sync(identity: UserIdentity, now = Date.now()): Promise<void> {
    const fingerprint = identityFingerprint(identity);
    const cached = this.cache.get(identity.id);
    if (
      cached &&
      cached.fingerprint === fingerprint &&
      now - cached.syncedAt < REFRESH_AFTER_MS
    ) {
      return;
    }

    await this.users.upsert(identity);
    this.remember(identity.id, { fingerprint, syncedAt: now });
  }

  /** Writes the row regardless of the cache — for a caller that must read it next. */
  async syncNow(identity: UserIdentity, now = Date.now()): Promise<void> {
    await this.users.upsert(identity);
    this.remember(identity.id, {
      fingerprint: identityFingerprint(identity),
      syncedAt: now,
    });
  }

  private remember(id: string, entry: CacheEntry): void {
    // Delete first so re-insertion moves the key to the end: Map iteration is
    // insertion order, which makes the first key the least recently synced.
    this.cache.delete(id);
    this.cache.set(id, entry);
    if (this.cache.size > MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
  }
}
