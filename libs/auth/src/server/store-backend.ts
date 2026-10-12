/**
 * The key-value commands the session store needs (auth Phase 2), and nothing
 * more: Valkey's, through ioredis (`valkey.ts`), and an in-memory stand-in in
 * the specs. Written as Redis semantics, so the stand-in and the real store
 * can be held to the same behaviour (`valkey-store.e2e.spec.ts` runs these
 * against a `valkey/valkey:8` container).
 *
 * Every TTL is in milliseconds. Any method may reject when the store cannot be
 * reached; the session store turns that into `SessionStoreUnavailableError`.
 */
export interface StoreBackend {
  /** `GET`. */
  get(key: string): Promise<string | null>;
  /**
   * `SET key value PX ttlMs`, with `NX` (`"absent"`) or `XX` (`"present"`).
   * Whether the value was written.
   */
  set(
    key: string,
    value: string,
    ttlMs: number,
    only?: "absent" | "present"
  ): Promise<boolean>;
  /** `DEL`; how many of the keys existed. */
  del(keys: readonly string[]): Promise<number>;
  /** Deletes `key` only while it still holds `value`: a lock released by its owner. */
  delIfEquals(key: string, value: string): Promise<boolean>;
  /**
   * `SADD`, then an expiry no shorter than `ttlMs` and no shorter than the
   * one the set had (`PEXPIRE NX`, then `PEXPIRE GT`): the set outlives every
   * member's session.
   */
  addToSet(key: string, member: string, ttlMs: number): Promise<void>;
  /** `SREM`. */
  removeFromSet(key: string, member: string): Promise<void>;
  /** `SMEMBERS`. */
  members(key: string): Promise<string[]>;
}

/**
 * The session store could not be asked (refused, timed out, not connected).
 * Not "signed out": the session may be there, so nothing that sees this sends
 * anyone through the IdP again. `proxy.ts` lets the request through without
 * its gate, the reads treat the caller as a visitor, and `requireSession()`,
 * `requireAccessToken()`, `redirectToSignIn()` and `withAccessToken()` throw
 * this instead of redirecting, so a protected page ends on the app's error
 * page and the next request tries again.
 */
export class SessionStoreUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("@medaris/auth: the session store could not be reached", { cause });
    this.name = "SessionStoreUnavailableError";
  }
}

export const isSessionStoreUnavailable = (
  error: unknown
): error is SessionStoreUnavailableError =>
  error instanceof SessionStoreUnavailableError;
