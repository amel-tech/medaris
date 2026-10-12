/**
 * auth Phase 2: the session store against a real Valkey 8 (`valkey/valkey:8`
 * through Testcontainers), as the ACL user RUNBOOK.md gives each environment:
 * only its own key prefix, only the commands the store sends. What the unit
 * specs' in-memory stand-in assumes about Redis semantics (`SET … NX|XX`,
 * `PEXPIRE NX` then `GT`, the lock's compare-and-delete script) is checked
 * here against the server. Needs Docker, like tedrisat's e2e suites;
 * everything reached is on loopback.
 */

import Redis from "ioredis";
import { UnsecuredJWT } from "jose";
import {
  GenericContainer,
  type StartedTestContainer,
  Wait,
} from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AuthConfig } from "../src/server/config";
import { resolveConfig } from "../src/server/config";
import type { CookieSource, CookieWrite } from "../src/server/cookies";
import type { RefreshOutcome } from "../src/server/renewal";
import {
  createSessionCookie,
  type StoredSession,
} from "../src/server/session-cookie";
import { createSessionStore } from "../src/server/session-store";
import { SessionStoreUnavailableError } from "../src/server/store-backend";
import { clock, session, testConfig } from "./support/fixtures";

const IMAGE = "valkey/valkey:8";
const USER = "medaris-test";
const PASSWORD = "e2e-only-password";
const PREFIX = "test:auth:nazar:";
const noCookies: CookieSource = { get: () => undefined, getAll: () => [] };

let container: StartedTestContainer;
let admin: Redis;
let url: string;

beforeAll(async () => {
  container = await new GenericContainer(IMAGE)
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/))
    .start();
  const host = container.getHost();
  const port = container.getMappedPort(6379);
  admin = new Redis({ host, port });
  // The rule RUNBOOK.md gives `medaris-<env>`, with this spec's prefix.
  await admin.call(
    "ACL",
    "SETUSER",
    USER,
    "reset",
    "on",
    `>${PASSWORD}`,
    `~test:auth:*`,
    "resetchannels",
    "-@all",
    "+get",
    "+set",
    "+del",
    "+sadd",
    "+srem",
    "+smembers",
    "+pexpire",
    "+eval"
  );
  url = `redis://${USER}:${PASSWORD}@${host}:${port}/0`;
}, 180_000);

afterAll(async () => {
  // The store's clients live on globalThis (one per URL per process).
  const clients = (
    globalThis as Record<symbol, Map<string, { client: Redis }> | undefined>
  )[Symbol.for("@medaris/auth.valkey-clients")];
  for (const { client } of clients?.values() ?? []) client.disconnect();
  admin?.disconnect();
  await container?.stop();
});

const config = (storeUrl = url): AuthConfig =>
  testConfig({ sessionStore: { url: storeUrl, keyPrefix: "test" } });

const storeFor = (storeUrl = url) => {
  const resolved = resolveConfig(config(storeUrl));
  return createSessionStore(resolved, createSessionCookie(resolved));
};

const sourceOf = (writes: readonly CookieWrite[]): CookieSource => {
  const jar = new Map(writes.map((write) => [write.name, write.value]));
  return {
    get: (name) => {
      const value = jar.get(name);
      return value === undefined ? undefined : { value };
    },
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
  };
};

const stored = (
  sub: string,
  sid: string,
  overrides: Partial<StoredSession> = {}
) =>
  session({
    user: { sub },
    idToken: new UnsecuredJWT({ sub, sid }).encode(),
    ...overrides,
  });

describe("the session store on Valkey 8", () => {
  it("keeps a session under the hash of its id, indexed by sid and sub, with the refresh token's TTL", async () => {
    const store = storeFor();
    const { loaded, writes } = await store.create(
      noCookies,
      stored("user-a", "sso-a")
    );
    const id = writes[0]?.value as string;
    expect(id).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const keys = (await admin.keys(`${PREFIX}*`)).sort();
    expect(keys).toEqual([
      `${PREFIX}s:${loaded.key}`,
      `${PREFIX}sid:sso-a`,
      `${PREFIX}sub:user-a`,
    ]);
    expect(keys.join()).not.toContain(id);
    for (const key of keys) {
      const ttl = await admin.pttl(key);
      expect(ttl).toBeGreaterThan(29 * 60_000);
      expect(ttl).toBeLessThanOrEqual(30 * 60_000);
    }

    const read = await store.load(sourceOf(writes));
    expect(read?.session).toMatchObject({
      accessToken: "access-1",
      user: { sub: "user-a" },
    });
    await expect(
      store.load(
        sourceOf([{ name: "nazar.session", value: "B".repeat(43), maxAge: 1 }])
      )
    ).resolves.toBeNull();
  });

  it("keeps an index at least as long as its longest session", async () => {
    const store = storeFor();
    await store.create(noCookies, stored("user-b", "sso-b1"));
    await store.create(
      noCookies,
      stored("user-b", "sso-b2", { refreshTokenExpiresAt: clock.now + 60_000 })
    );
    expect(await admin.scard(`${PREFIX}sub:user-b`)).toBe(2);
    expect(await admin.pttl(`${PREFIX}sub:user-b`)).toBeGreaterThan(
      29 * 60_000
    );
    expect(await admin.pttl(`${PREFIX}sid:sso-b2`)).toBeLessThanOrEqual(60_000);
  });

  it("lets one of two replicas refresh: the other waits for what the winner stores", async () => {
    const first = storeFor();
    const second = storeFor();
    const { loaded } = await first.create(noCookies, stored("user-c", "sso-c"));
    let calls = 0;
    let finish!: (outcome: RefreshOutcome) => void;
    const slow = () =>
      new Promise<RefreshOutcome>((resolve) => {
        calls++;
        finish = resolve;
      });

    const winner = first.refreshExclusively(loaded, slow);
    while (calls === 0) await new Promise((resolve) => setTimeout(resolve, 10));
    expect(await admin.exists(`${PREFIX}lock:${loaded.key}`)).toBe(1);
    const loser = second.refreshExclusively(loaded, slow);
    await new Promise((resolve) => setTimeout(resolve, 150));
    finish({
      kind: "refreshed",
      session: { ...loaded.session, accessToken: "access-2" },
    });

    const [won, waited] = await Promise.all([winner, loser]);
    expect(calls).toBe(1);
    expect(won).toMatchObject({
      kind: "refreshed",
      session: { accessToken: "access-2" },
    });
    expect(waited).toMatchObject({
      kind: "refreshed",
      session: { accessToken: "access-2" },
    });
    expect(await admin.exists(`${PREFIX}lock:${loaded.key}`)).toBe(0);
  });

  it("ends every session of an IdP session, and remembers a logout token's jti once", async () => {
    const store = storeFor();
    const one = await store.create(noCookies, stored("user-d", "sso-d"));
    const two = await store.create(noCookies, stored("user-d", "sso-d"));
    const other = await store.create(noCookies, stored("user-d", "sso-e"));

    await expect(
      store.endIdpSession({ sid: "sso-d", sub: "user-d" })
    ).resolves.toBe(2);
    await expect(store.load(sourceOf(one.writes))).resolves.toBeNull();
    await expect(store.load(sourceOf(two.writes))).resolves.toBeNull();
    await expect(store.load(sourceOf(other.writes))).resolves.not.toBeNull();
    expect(await admin.exists(`${PREFIX}sid:sso-d`)).toBe(0);
    expect(await admin.smembers(`${PREFIX}sub:user-d`)).toEqual([
      other.loaded.key,
    ]);

    await expect(store.firstUse("jti-1", 60_000)).resolves.toBe(true);
    await expect(store.firstUse("jti-1", 60_000)).resolves.toBe(false);
  });

  it("removes a signed-out session with its index entries", async () => {
    const store = storeFor();
    const { loaded, writes } = await store.create(
      noCookies,
      stored("user-f", "sso-f")
    );
    await store.remove(sourceOf(writes), loaded);
    expect(await admin.keys(`${PREFIX}*:user-f`)).toEqual([]);
    expect(await admin.keys(`${PREFIX}*sso-f`)).toEqual([]);
    expect(await admin.exists(`${PREFIX}s:${loaded.key}`)).toBe(0);
  });

  it("gives the ACL user nothing outside its prefix", async () => {
    const outsider = new Redis(url, { enableReadyCheck: false });
    try {
      await expect(outsider.set("prod:auth:nazar:s:x", "1")).rejects.toThrow(
        /NOPERM/
      );
      await expect(outsider.call("FLUSHALL")).rejects.toThrow(/NOPERM/);
    } finally {
      outsider.disconnect();
    }
  });

  it("fails fast, as unavailable, when nothing listens", async () => {
    const store = storeFor("redis://127.0.0.1:1/0");
    const cookie = sourceOf([
      { name: "nazar.session", value: "C".repeat(43), maxAge: 1 },
    ]);

    let started = Date.now();
    await expect(store.load(cookie)).rejects.toBeInstanceOf(
      SessionStoreUnavailableError
    );
    expect(Date.now() - started).toBeLessThan(2_500);

    // While ioredis reconnects in the background, a request does not wait for it.
    started = Date.now();
    await expect(store.load(cookie)).rejects.toBeInstanceOf(
      SessionStoreUnavailableError
    );
    expect(Date.now() - started).toBeLessThan(200);
  });
});
