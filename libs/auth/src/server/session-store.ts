import { base64url } from "jose";
import type { ResolvedAuthConfig } from "./config";
import { type CookieSource, type CookieWrite, chunkedWrites } from "./cookies";
import { failureSummary } from "./oidc";
import type { RefreshOutcome } from "./renewal";
import { deriveKey, seal, unseal } from "./seal";
import {
  cookieLifetime,
  idpSessionOf,
  type SessionCookie,
  type StoredSession,
  storedSessionFrom,
} from "./session-cookie";
import { createSingleFlight } from "./single-flight";
import {
  isSessionStoreUnavailable,
  SessionStoreUnavailableError,
  type StoreBackend,
} from "./store-backend";
import { valkeyBackend } from "./valkey";

/**
 * Where a session lives (auth Phase 2): the seam between the routes, the proxy
 * and the reads on one side and the two places on the other.
 *
 * - **cookie** (`createCookieSessionStore`): Phase 1 unchanged. The session is
 *   sealed into the cookie; there is nothing to look up, so a back-channel
 *   logout cannot find it and the proxy keeps asking `userinfo` instead.
 * - **server** (`createServerSessionStore`): Valkey. The cookie holds a random
 *   id (32 bytes, base64url) and nothing else; the session, still sealed, is
 *   kept under the id's SHA-256, so a dump of the store holds no cookie
 *   anyone could send. Two indexes, by the IdP's `sid` and by `sub`, let a
 *   back-channel logout find a session; a lock per session lets one replica
 *   refresh while the others wait for its result.
 *
 * The cookie keeps its Phase 1 name in both (`__Host-<app>.session`), so the
 * cookie policy names one cookie, and a Phase 1 cookie a browser still holds
 * is read and moved into the store on its first request (`migrate`): nobody
 * signs in again because of the deploy.
 */
export interface LoadedSession {
  session: StoredSession;
  /** server: the random id the cookie holds. */
  id?: string;
  /** server: `sha256(id)`, the key the session is stored under. */
  key?: string;
  /** server: read from a Phase 1 sealed cookie; `migrate` moves it into the store. */
  legacy?: true;
}

export interface SessionStore {
  readonly mode: "cookie" | "server";
  /**
   * The session the request's cookies name, or `null`. Throws
   * `SessionStoreUnavailableError` when the store cannot be asked.
   */
  load(source: CookieSource): Promise<LoadedSession | null>;
  /**
   * Stores a new session (a sign-in) and replaces `replacing`, the one this
   * browser had: a new id every time, so an id planted before the sign-in
   * names nothing after it. The cookie writes that go with it.
   */
  create(
    source: CookieSource,
    session: StoredSession,
    replacing?: LoadedSession | null
  ): Promise<{ loaded: LoadedSession; writes: CookieWrite[] }>;
  /**
   * server: moves a Phase 1 cookie's session into the store under a new id
   * (`null` when `loaded` is not one). cookie: always `null`.
   */
  migrate(
    source: CookieSource,
    loaded: LoadedSession
  ): Promise<{ loaded: LoadedSession; writes: CookieWrite[] } | null>;
  /**
   * The cookie writes for a session a renewal changed. server: a renewal is
   * only ever a refresh, which `refreshExclusively` has stored already; the
   * cookie keeps its id and gets the new lifetime.
   */
  renewed(
    source: CookieSource,
    loaded: LoadedSession,
    session: StoredSession
  ): Promise<CookieWrite[]>;
  /** Ends `loaded` (the store entry and its index entries) and removes the cookie. */
  remove(
    source: CookieSource,
    loaded: LoadedSession | null
  ): Promise<CookieWrite[]>;
  /** Only the cookie's removal; no store call. */
  clearCookie(source: CookieSource): CookieWrite[];
  /**
   * Runs `refresh` so that one replica spends the refresh token: server, under
   * the session's lock (the others wait for its result); cookie, directly.
   */
  refreshExclusively(
    loaded: LoadedSession,
    refresh: () => Promise<RefreshOutcome>
  ): Promise<RefreshOutcome>;
  /**
   * Ends every session of an IdP session (`sid`), or of an account (`sub`)
   * when the logout names no `sid`. How many it ended; `null` in cookie mode,
   * which has no way to find them.
   */
  endIdpSession(claims: { sid?: string; sub?: string }): Promise<number | null>;
  /** `true` the first time `jti` is seen within `ttlMs`: back-channel replay. */
  firstUse(jti: string, ttlMs: number): Promise<boolean>;
}

/** How long a refresh may hold the session's lock. */
export const LOCK_TTL_MS = 10_000;
/** How often, and how long, a replica that lost the lock looks for the winner's result. */
const LOCK_POLL_MS = 100;
const LOCK_WAIT_MS = 3_000;
/** A Phase 1 cookie moved within this long is moved to the same new id again. */
const MIGRATION_GRACE_MS = 30_000;

/** The id in the cookie: 32 random bytes, base64url, no padding. */
const ID_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const encoder = new TextEncoder();

const randomId = () =>
  base64url.encode(crypto.getRandomValues(new Uint8Array(32)));

const sha256 = async (value: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", encoder.encode(value))
    ),
    (byte) => byte.toString(16).padStart(2, "0")
  ).join("");

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

type StoreConfig = Pick<
  ResolvedAuthConfig,
  "secret" | "cookiePrefix" | "cookies" | "sessionMaxAge" | "now" | "store"
>;

/** Picks the store the configuration names. */
export function createSessionStore(
  config: StoreConfig,
  sessionCookie: SessionCookie
): SessionStore {
  if (!config.store) return createCookieSessionStore(config, sessionCookie);
  const backend =
    config.store.backend ?? valkeyBackend(config.store.url as string);
  return createServerSessionStore(
    config,
    config.store.namespace,
    backend,
    sessionCookie
  );
}

/** Phase 1: the session sealed into the cookie. */
export function createCookieSessionStore(
  config: Pick<StoreConfig, "cookies" | "now">,
  sessionCookie: SessionCookie
): SessionStore {
  let warned = false;
  const seen = new Map<string, number>();
  const clearCookie = (source: CookieSource) =>
    chunkedWrites(source, config.cookies.session, null, 0);

  return {
    mode: "cookie",
    async load(source) {
      if (!warned && process.env.NODE_ENV === "production") {
        warned = true;
        console.warn(
          "@medaris/auth: no session store (WEB__AUTH_STORE_URL is unset): sessions are sealed in the cookie, and back-channel logout is off"
        );
      }
      const session = await sessionCookie.read(source);
      return session ? { session } : null;
    },
    async create(source, session) {
      return {
        loaded: { session },
        writes: await sessionCookie.writes(source, session),
      };
    },
    async migrate() {
      return null;
    },
    renewed(source, _loaded, session) {
      return sessionCookie.writes(source, session);
    },
    async remove(source) {
      return clearCookie(source);
    },
    clearCookie,
    refreshExclusively(_loaded, refresh) {
      return refresh();
    },
    async endIdpSession() {
      return null;
    },
    async firstUse(jti, ttlMs) {
      const now = config.now();
      for (const [known, until] of seen) {
        if (until <= now) seen.delete(known);
      }
      if (seen.has(jti)) return false;
      seen.set(jti, now + ttlMs);
      return true;
    },
  };
}

/**
 * Valkey: the cookie names the session, the store holds it. Key layout under
 * `namespace` (`<WEB__AUTH_STORE_KEY_PREFIX>:auth:<cookiePrefix>:`):
 *
 * | Key | Holds | TTL |
 * | -- | -- | -- |
 * | `s:<sha256(id)>` | the session, sealed (`store` key) | the refresh token's life, renewed by each refresh |
 * | `sid:<sid>` | set of `sha256(id)` of that IdP session | at least its longest member's |
 * | `sub:<sub>` | set of `sha256(id)` of that account | at least its longest member's |
 * | `lock:<sha256(id)>` | the refresh lock's owner | 10 s |
 * | `jti:<jti>` | a back-channel logout token already used | a few minutes |
 */
export function createServerSessionStore(
  config: StoreConfig,
  namespace: string,
  backend: StoreBackend,
  legacyCookie: SessionCookie
): SessionStore {
  const name = config.cookies.session;
  const keys = {
    session: (hash: string) => `${namespace}s:${hash}`,
    sid: (sid: string) => `${namespace}sid:${sid}`,
    sub: (sub: string) => `${namespace}sub:${sub}`,
    lock: (hash: string) => `${namespace}lock:${hash}`,
    jti: (jti: string) => `${namespace}jti:${jti}`,
  };

  let key: Promise<Uint8Array> | undefined;
  const keyOf = () => {
    key ??= deriveKey(config.secret, config.cookiePrefix, "store");
    return key;
  };

  let lastReport = 0;
  let suppressed = 0;
  /** Every store call goes through here: a failure becomes `SessionStoreUnavailableError`, logged at most every 30 s. */
  const guard = async <T>(call: () => Promise<T>): Promise<T> => {
    try {
      return await call();
    } catch (error) {
      if (isSessionStoreUnavailable(error)) throw error;
      const at = Date.now();
      if (at - lastReport >= 30_000) {
        console.error("@medaris/auth: session store unavailable", {
          ...failureSummary(error),
          ...(error instanceof Error ? { message: error.message } : {}),
          ...(suppressed ? { suppressed } : {}),
        });
        lastReport = at;
        suppressed = 0;
      } else {
        suppressed++;
      }
      throw new SessionStoreUnavailableError(error);
    }
  };

  const lifetimeMs = (session: StoredSession, now: number) =>
    cookieLifetime(session, now, config.sessionMaxAge) * 1000;

  const cookieWrites = (
    source: CookieSource,
    id: string,
    session: StoredSession
  ) =>
    chunkedWrites(
      source,
      name,
      id,
      cookieLifetime(session, config.now(), config.sessionMaxAge)
    );

  const clearCookie = (source: CookieSource) =>
    chunkedWrites(source, name, null, 0);

  const read = async (hash: string): Promise<StoredSession | null> => {
    const sealed = await guard(() => backend.get(keys.session(hash)));
    if (!sealed) return null;
    return storedSessionFrom(
      await unseal<unknown>(sealed, await keyOf(), config.now())
    );
  };

  /**
   * Writes `session` under `hash` with the refresh token's lifetime, and
   * indexes it. `"present"`: only over an entry that is still there, so a
   * session a back-channel logout deleted meanwhile is not brought back.
   */
  const write = async (
    hash: string,
    session: StoredSession,
    only: "absent" | "present"
  ): Promise<boolean> => {
    const now = config.now();
    const ttl = lifetimeMs(session, now);
    const sealed = await seal(
      session as unknown as Record<string, unknown>,
      await keyOf(),
      { now, expiresAt: now + ttl }
    );
    const written = await guard(() =>
      backend.set(keys.session(hash), sealed, ttl, only)
    );
    if (!written) return false;
    const sid = idpSessionOf(session);
    await guard(() =>
      Promise.all([
        sid ? backend.addToSet(keys.sid(sid), hash, ttl) : undefined,
        backend.addToSet(keys.sub(session.user.sub), hash, ttl),
      ])
    );
    return true;
  };

  const drop = async (hash: string, session: StoredSession) => {
    const sid = idpSessionOf(session);
    await guard(() =>
      Promise.all([
        backend.del([keys.session(hash)]),
        sid ? backend.removeFromSet(keys.sid(sid), hash) : undefined,
        backend.removeFromSet(keys.sub(session.user.sub), hash),
      ])
    );
  };

  const create: SessionStore["create"] = async (source, session, replacing) => {
    const id = randomId();
    const hash = await sha256(id);
    if (!(await write(hash, session, "absent"))) {
      // 256 random bits do not collide; a store that says so is not answering truthfully.
      throw new SessionStoreUnavailableError(new Error("session id taken"));
    }
    if (replacing?.key) await drop(replacing.key, replacing.session);
    return {
      loaded: { session, id, key: hash },
      writes: cookieWrites(source, id, session),
    };
  };

  // Parallel requests from one browser all carry its Phase 1 cookie; they get
  // one new id between them, not one each (in this process).
  const migrations = createSingleFlight<{
    loaded: LoadedSession;
    writes: CookieWrite[];
  }>(MIGRATION_GRACE_MS, config.now);

  return {
    mode: "server",
    async load(source) {
      const value = source.get(name)?.value;
      if (value && ID_PATTERN.test(value)) {
        const hash = await sha256(value);
        const session = await read(hash);
        return session ? { session, id: value, key: hash } : null;
      }
      const session = await legacyCookie.read(source);
      return session ? { session, legacy: true } : null;
    },
    create,
    async migrate(source, loaded) {
      if (!loaded.legacy) return null;
      const fingerprint = await sha256(
        JSON.stringify([loaded.session.user.sub, loaded.session.accessToken])
      );
      return migrations.run(fingerprint, () => create(source, loaded.session));
    },
    async renewed(source, loaded, session) {
      return loaded.id ? cookieWrites(source, loaded.id, session) : [];
    },
    async remove(source, loaded) {
      if (loaded?.key) await drop(loaded.key, loaded.session);
      return clearCookie(source);
    },
    clearCookie,
    async refreshExclusively(loaded, refresh) {
      const hash = loaded.key;
      if (!hash) return refresh();
      const lock = keys.lock(hash);
      const owner = randomId();
      const before = loaded.session.accessToken;

      if (await guard(() => backend.set(lock, owner, LOCK_TTL_MS, "absent"))) {
        try {
          // Another replica may have finished a refresh between this
          // request's read and the lock.
          const current = await read(hash);
          if (!current) return { kind: "failed", final: true };
          if (current.accessToken !== before) {
            return { kind: "refreshed", session: current };
          }
          const outcome = await refresh();
          if (outcome.kind === "refreshed") {
            if (!(await write(hash, outcome.session, "present"))) {
              return { kind: "failed", final: true };
            }
          } else if (outcome.final) {
            await drop(hash, loaded.session);
          }
          return outcome;
        } finally {
          await backend.delIfEquals(lock, owner).catch(() => undefined);
        }
      }

      // Another replica holds the lock: wait for what it stores.
      for (let waited = 0; waited < LOCK_WAIT_MS; waited += LOCK_POLL_MS) {
        await sleep(LOCK_POLL_MS);
        const current = await read(hash);
        if (!current) return { kind: "failed", final: true };
        if (current.accessToken !== before) {
          return { kind: "refreshed", session: current };
        }
        if ((await guard(() => backend.get(lock))) === null) {
          // Released. Read once more: the winner writes before it releases,
          // and may have done both since the read above.
          const settled = await read(hash);
          if (!settled) return { kind: "failed", final: true };
          if (settled.accessToken !== before) {
            return { kind: "refreshed", session: settled };
          }
          // Nothing new: its refresh could not reach the IdP.
          return { kind: "failed", final: false };
        }
      }
      return { kind: "failed", final: false };
    },
    async endIdpSession({ sid, sub }) {
      const index = sid ? keys.sid(sid) : sub ? keys.sub(sub) : null;
      if (!index) return 0;
      const hashes = await guard(() => backend.members(index));
      const ended = await guard(() =>
        backend.del(hashes.map((hash) => keys.session(hash)))
      );
      await guard(() =>
        Promise.all([
          backend.del([index]),
          ...(sid && sub
            ? hashes.map((hash) => backend.removeFromSet(keys.sub(sub), hash))
            : []),
        ])
      );
      return ended;
    },
    firstUse(jti, ttlMs) {
      return guard(() => backend.set(keys.jti(jti), "1", ttlMs, "absent"));
    },
  };
}
