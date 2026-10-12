import { NextRequest } from "next/server";
import type { AuthConfig } from "../../src/server/config";
import { resolveConfig } from "../../src/server/config";
import type { CookieWrite } from "../../src/server/cookies";
import {
  createSessionCookie,
  type StoredSession,
} from "../../src/server/session-cookie";

/** A clock the specs move by hand. */
export const clock = { now: Date.UTC(2026, 9, 12, 9, 0, 0) };

export const ORIGIN = "http://localhost:4002";

export const testConfig = (
  overrides: Partial<AuthConfig> = {}
): AuthConfig => ({
  issuer: "https://idp.example/realms/medaris",
  clientId: "nazar-test",
  clientSecret: "client-secret",
  baseUrl: ORIGIN,
  secret: "test-nextauth-secret",
  cookiePrefix: "nazar",
  pages: { signIn: "/auth/signin" },
  now: () => clock.now,
  ...overrides,
});

export const session = (
  overrides: Partial<StoredSession> = {}
): StoredSession => ({
  v: 1,
  user: { sub: "user-1", name: "Ayşe Yılmaz", email: "ayse@example.org" },
  accessToken: "access-1",
  accessTokenExpiresAt: clock.now + 4 * 60_000,
  refreshToken: "refresh-1",
  refreshTokenExpiresAt: clock.now + 30 * 60_000,
  idToken: "id-token-1",
  checkedAt: clock.now - 10_000,
  ...overrides,
});

const noCookies = { get: () => undefined, getAll: () => [] };

/** `name=value; …` for the writes that store `stored` under `config`. */
export async function sessionCookieHeader(
  config: AuthConfig,
  stored: StoredSession
): Promise<string> {
  const writes = await createSessionCookie(resolveConfig(config)).writes(
    noCookies,
    stored
  );
  return cookieHeader(writes);
}

export const cookieHeader = (writes: readonly CookieWrite[]) =>
  writes
    .filter((write) => write.maxAge > 0)
    .map((write) => `${write.name}=${write.value}`)
    .join("; ");

export const request = (
  path: string,
  init: {
    cookie?: string;
    method?: string;
    headers?: Record<string, string>;
    body?: BodyInit;
  } = {}
) =>
  new NextRequest(new URL(path, ORIGIN), {
    method: init.method ?? "GET",
    body: init.body,
    headers: {
      ...(init.cookie ? { cookie: init.cookie } : {}),
      ...init.headers,
    },
  });

/** Reads the session a response stores, through the package's own reader. */
export async function storedSessionOf(
  config: AuthConfig,
  response: Response
): Promise<StoredSession | null> {
  const jar = new Map<string, string>();
  for (const line of response.headers.getSetCookie()) {
    const [pair] = line.split(";");
    const index = pair?.indexOf("=") ?? -1;
    if (!pair || index < 0) continue;
    const value = pair.slice(index + 1);
    if (value) jar.set(pair.slice(0, index), value);
  }
  return createSessionCookie(resolveConfig(config)).read({
    get: (name) => {
      const value = jar.get(name);
      return value === undefined ? undefined : { value };
    },
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
  });
}

/** The Set-Cookie attributes for `name`, lower-cased, or `undefined`. */
export function setCookie(response: Response, name: string) {
  const line = response.headers
    .getSetCookie()
    .find((entry) => entry.startsWith(`${name}=`));
  if (!line) return undefined;
  const [pair = "", ...attributes] = line.split(";").map((part) => part.trim());
  return {
    value: pair.slice(name.length + 1),
    attributes: attributes.map((attribute) => attribute.toLowerCase()),
  };
}

/** A token endpoint answer as openid-client returns it. */
export const tokens = (
  overrides: Partial<{
    access_token: string;
    expires_in: number;
    refresh_token: string;
    id_token: string;
    refresh_expires_in: number;
    claims: Record<string, unknown> | undefined;
  }> = {}
) => {
  const { claims, ...rest } = overrides;
  const idClaims =
    "claims" in overrides
      ? claims
      : {
          sub: "user-1",
          name: "Ayşe Yılmaz",
          email: "ayse@example.org",
          preferred_username: "ayse",
          locale: "tr",
        };
  return {
    access_token: "access-new",
    expires_in: 300,
    refresh_token: "refresh-new",
    id_token: "id-token-new",
    refresh_expires_in: 1800,
    token_type: "bearer",
    ...rest,
    claims: () => idClaims,
  };
};
