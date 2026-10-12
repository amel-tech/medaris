import Redis from "ioredis";
import type { StoreBackend } from "./store-backend";

/**
 * The session store's Valkey client (auth Phase 2), through ioredis 5: Valkey 8
 * speaks the Redis protocol.
 *
 * One client per URL per process, kept on `globalThis`: Next's dev server
 * evaluates `lib/auth.ts` again on every change, and a client per evaluation
 * would leave the old connections open until the process ends.
 *
 * A request must never hang on a dead store, so:
 * - `connectTimeout` 2 s and `commandTimeout` 1 s;
 * - no offline queue: a command sent while the connection is down fails at
 *   once instead of waiting for a reconnect, and ioredis reconnects in the
 *   background (`retryStrategy`);
 * - the first connection is opened by the first request that needs it and
 *   awaited (`lazyConnect`), so nothing connects while `next build` evaluates
 *   the module; after that a request never waits for a reconnect.
 *
 * No ready check (`INFO`) and no `CLIENT SETINFO`: the environment's ACL user
 * may run only the commands below on its own key prefix (RUNBOOK).
 */
const CONNECT_TIMEOUT_MS = 2_000;
const COMMAND_TIMEOUT_MS = 1_000;

/** Deletes KEYS[1] only while it holds ARGV[1]: a lock released by its owner. */
const DELETE_IF_EQUALS = `if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end`;

const REGISTRY = Symbol.for("@medaris/auth.valkey-clients");

interface Entry {
  client: Redis;
  /** The first connection, while it is being opened. */
  connecting?: Promise<void>;
}

const registry = (): Map<string, Entry> => {
  const holder = globalThis as { [REGISTRY]?: Map<string, Entry> };
  holder[REGISTRY] ??= new Map();
  return holder[REGISTRY];
};

/** At most one line per 30 s: a store that is down would otherwise log every reconnect. */
const throttled = (intervalMs: number) => {
  let last = 0;
  let suppressed = 0;
  return (message: string, details: Record<string, unknown>) => {
    const at = Date.now();
    if (at - last < intervalMs) {
      suppressed++;
      return;
    }
    console.error(message, suppressed ? { ...details, suppressed } : details);
    last = at;
    suppressed = 0;
  };
};

function clientFor(url: string): Entry {
  const clients = registry();
  const known = clients.get(url);
  if (known) return known;
  const client = new Redis(url, {
    lazyConnect: true,
    connectTimeout: CONNECT_TIMEOUT_MS,
    commandTimeout: COMMAND_TIMEOUT_MS,
    enableOfflineQueue: false,
    enableReadyCheck: false,
    disableClientInfo: true,
    maxRetriesPerRequest: 0,
    retryStrategy: (times) => Math.min(times * 200, 2_000),
  });
  const report = throttled(30_000);
  // ioredis prints an "Unhandled error event" for every failed reconnect
  // without a listener. The message names host and port, never the password.
  client.on("error", (error: Error & { code?: unknown }) =>
    report("@medaris/auth: session store connection error", {
      message: error.message,
      ...(typeof error.code === "string" ? { code: error.code } : {}),
    })
  );
  const entry: Entry = { client };
  clients.set(url, entry);
  return entry;
}

/**
 * Waits for the first connection; after that, fails fast while ioredis is
 * reconnecting rather than holding the request.
 */
async function ready(entry: Entry): Promise<Redis> {
  const { client } = entry;
  if (client.status === "ready") return client;
  if (client.status === "wait" || client.status === "end") {
    entry.connecting ??= client.connect().finally(() => {
      entry.connecting = undefined;
    });
  }
  if (entry.connecting) {
    await entry.connecting;
    return client;
  }
  throw new Error(`the session store connection is ${client.status}`);
}

export function valkeyBackend(url: string): StoreBackend {
  const entry = clientFor(url);
  return {
    async get(key) {
      return (await ready(entry)).get(key);
    },
    async set(key, value, ttlMs, only) {
      const client = await ready(entry);
      const answer =
        only === "absent"
          ? await client.set(key, value, "PX", ttlMs, "NX")
          : only === "present"
            ? await client.set(key, value, "PX", ttlMs, "XX")
            : await client.set(key, value, "PX", ttlMs);
      return answer === "OK";
    },
    async del(keys) {
      if (keys.length === 0) return 0;
      return (await ready(entry)).del(...keys);
    },
    async delIfEquals(key, value) {
      const deleted = await (await ready(entry)).eval(
        DELETE_IF_EQUALS,
        1,
        key,
        value
      );
      return deleted === 1;
    },
    async addToSet(key, member, ttlMs) {
      const results = await (await ready(entry))
        .pipeline()
        .sadd(key, member)
        .pexpire(key, ttlMs, "NX")
        .pexpire(key, ttlMs, "GT")
        .exec();
      const failed = results?.find(([error]) => error)?.[0];
      if (failed) throw failed;
    },
    async removeFromSet(key, member) {
      await (await ready(entry)).srem(key, member);
    },
    async members(key) {
      return (await ready(entry)).smembers(key);
    },
  };
}
