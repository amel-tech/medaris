import { resolveConfig } from "../src/server/config";
import { CHUNK_SIZE, chunkedWrites, readChunked } from "../src/server/cookies";
import { deriveKey, seal, unseal } from "../src/server/seal";
import {
  createSessionCookie,
  sessionFromTokens,
} from "../src/server/session-cookie";
import { clock, session, testConfig, tokens } from "./support/fixtures";

const source = (cookies: Record<string, string>) => ({
  get: (name: string) =>
    name in cookies ? { value: cookies[name] as string } : undefined,
  getAll: () =>
    Object.entries(cookies).map(([name, value]) => ({ name, value })),
});

const asCookies = (writes: Array<{ name: string; value: string }>) =>
  Object.fromEntries(writes.map(({ name, value }) => [name, value]));

describe("seal / unseal", () => {
  it("opens what it sealed, and nothing after it expired", async () => {
    const key = await deriveKey("secret", "nazar", "session");
    const sealed = await seal({ hello: "world" }, key, {
      now: clock.now,
      expiresAt: clock.now + 60_000,
    });
    expect(sealed).toMatch(/^[A-Za-z0-9_.-]+$/);
    expect(sealed.split(".")).toHaveLength(5);
    await expect(unseal(sealed, key, clock.now)).resolves.toMatchObject({
      hello: "world",
    });
    await expect(unseal(sealed, key, clock.now + 61_000)).resolves.toBeNull();
  });

  it("derives a different key per app and per purpose", async () => {
    const nazar = await deriveKey("same-secret", "nazar", "session");
    const sealed = await seal({ a: 1 }, nazar, {
      now: clock.now,
      expiresAt: clock.now + 60_000,
    });
    const tedris = await deriveKey("same-secret", "tedris", "session");
    const flow = await deriveKey("same-secret", "nazar", "flow");
    await expect(unseal(sealed, tedris, clock.now)).resolves.toBeNull();
    await expect(unseal(sealed, flow, clock.now)).resolves.toBeNull();
  });

  it("refuses an altered value", async () => {
    const key = await deriveKey("secret", "nazar", "session");
    const sealed = await seal({ a: 1 }, key, {
      now: clock.now,
      expiresAt: clock.now + 60_000,
    });
    const altered = `${sealed.slice(0, -3)}${sealed.slice(-3) === "AAA" ? "BBB" : "AAA"}`;
    await expect(unseal(altered, key, clock.now)).resolves.toBeNull();
    await expect(unseal("not-a-jwe", key, clock.now)).resolves.toBeNull();
  });
});

describe("chunking", () => {
  it("writes one cookie when the value fits", () => {
    const writes = chunkedWrites(source({}), "app.session", "short", 60);
    expect(writes).toEqual([
      { name: "app.session", value: "short", maxAge: 60 },
    ]);
  });

  it("splits a long value into numbered chunks and reads it back", () => {
    const value = "x".repeat(CHUNK_SIZE * 2 + 10);
    const writes = chunkedWrites(source({}), "app.session", value, 60);
    expect(writes.map((write) => write.name)).toEqual([
      "app.session.0",
      "app.session.1",
      "app.session.2",
    ]);
    expect(writes.every((write) => write.value.length <= CHUNK_SIZE)).toBe(
      true
    );
    expect(readChunked(source(asCookies(writes)), "app.session")).toBe(value);
  });

  it("removes the chunks a shorter value no longer uses", () => {
    const writes = chunkedWrites(
      source({
        "app.session.0": "a",
        "app.session.1": "b",
        "app.session.2": "c",
        "app.sessionx": "unrelated",
        "other.session": "unrelated",
      }),
      "app.session",
      "short",
      60
    );
    expect(writes).toEqual([
      { name: "app.session", value: "short", maxAge: 60 },
      { name: "app.session.0", value: "", maxAge: 0 },
      { name: "app.session.1", value: "", maxAge: 0 },
      { name: "app.session.2", value: "", maxAge: 0 },
    ]);
  });

  it("removes the whole family for null", () => {
    const writes = chunkedWrites(
      source({ "app.session": "whole", "app.session.0": "stale" }),
      "app.session",
      null,
      0
    );
    expect(writes).toEqual([
      { name: "app.session", value: "", maxAge: 0 },
      { name: "app.session.0", value: "", maxAge: 0 },
    ]);
  });

  it("stops reading at the first missing chunk", () => {
    expect(
      readChunked(
        source({ "app.session.0": "a", "app.session.2": "c" }),
        "app.session"
      )
    ).toBe("a");
    expect(readChunked(source({}), "app.session")).toBeUndefined();
  });
});

describe("the session cookie", () => {
  const config = resolveConfig(testConfig());

  it("round-trips a session under the app's own cookie name", async () => {
    const cookie = createSessionCookie(config);
    const stored = session();
    const writes = await cookie.writes(source({}), stored);
    expect(writes.map((write) => write.name)).toEqual(["nazar.session"]);
    // Lives until the refresh token's deadline.
    expect(writes[0]?.maxAge).toBe(30 * 60);
    await expect(cookie.read(source(asCookies(writes)))).resolves.toEqual(
      stored
    );
  });

  it("chunks a session with large tokens", async () => {
    const cookie = createSessionCookie(config);
    const stored = session({
      accessToken: "a".repeat(3000),
      refreshToken: "r".repeat(1500),
      idToken: "i".repeat(2500),
    });
    const writes = await cookie.writes(source({}), stored);
    expect(writes.length).toBeGreaterThan(1);
    expect(
      writes.every((write) => write.name.startsWith("nazar.session."))
    ).toBe(true);
    await expect(cookie.read(source(asCookies(writes)))).resolves.toEqual(
      stored
    );
  });

  it("uses __Host- names over https", () => {
    const secure = resolveConfig(
      testConfig({ baseUrl: "https://nazar.example" })
    );
    expect(secure.secure).toBe(true);
    expect(secure.cookies.session).toBe("__Host-nazar.session");
    expect(secure.cookies.flowPrefix).toBe("__Host-nazar.auth-flow.");
  });

  it("reads another app's or another secret's cookie as no session", async () => {
    const writes = await createSessionCookie(config).writes(
      source({}),
      session()
    );
    const other = createSessionCookie(
      resolveConfig(testConfig({ secret: "another-secret" }))
    );
    await expect(other.read(source(asCookies(writes)))).resolves.toBeNull();
  });
});

describe("sessionFromTokens", () => {
  it("keeps the identity claims and the token deadlines, on this server's clock", () => {
    const stored = sessionFromTokens(tokens(), clock.now);
    expect(stored).toEqual({
      v: 1,
      user: {
        sub: "user-1",
        name: "Ayşe Yılmaz",
        email: "ayse@example.org",
        username: "ayse",
        locale: "tr",
      },
      accessToken: "access-new",
      accessTokenExpiresAt: clock.now + 300_000,
      refreshToken: "refresh-new",
      refreshTokenExpiresAt: clock.now + 1_800_000,
      idToken: "id-token-new",
      checkedAt: clock.now,
    });
  });

  it("reads refresh_expires_in: 0 as no deadline", () => {
    const stored = sessionFromTokens(
      tokens({ refresh_expires_in: 0 }),
      clock.now
    );
    expect(stored?.refreshTokenExpiresAt).toBeUndefined();
  });

  it("keeps what a refresh does not bring, and renews the profile when it does", () => {
    const previous = session();
    const refreshed = sessionFromTokens(
      {
        access_token: "access-2",
        expires_in: 300,
        claims: () => undefined,
      },
      clock.now,
      previous
    );
    expect(refreshed).toMatchObject({
      user: previous.user,
      accessToken: "access-2",
      refreshToken: previous.refreshToken,
      refreshTokenExpiresAt: previous.refreshTokenExpiresAt,
      idToken: previous.idToken,
    });
    const renamed = sessionFromTokens(
      tokens({ claims: { sub: "user-1", name: "Ayşe Kaya" } }),
      clock.now,
      previous
    );
    expect(renamed?.user).toEqual({ sub: "user-1", name: "Ayşe Kaya" });
  });

  it("names no session without a subject", () => {
    expect(sessionFromTokens(tokens({ claims: {} }), clock.now)).toBeNull();
  });
});
