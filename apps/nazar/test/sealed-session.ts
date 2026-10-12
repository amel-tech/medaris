import { EncryptJWT } from "jose";

/**
 * Nazar's session cookie as `@medaris/auth` writes it, for the specs (through
 * a `next/headers` stand-in, so `~/lib/auth` is the real one) and for the
 * Playwright helper that signs a browser in without Keycloak's form
 * (`e2e/accounts.ts`).
 *
 * The format: a compact JWE, `dir` + `A256GCM`, its key HKDF-SHA-256 over
 * NEXTAUTH_SECRET, salted with the cookie prefix and labelled with the
 * purpose; split into `<name>.0`, `<name>.1`, … past 3800 characters. The
 * package keeps it in `libs/auth/src/server/seal.ts`, `session-cookie.ts` and
 * `cookies.ts` and exports no way to write it (its server entry is
 * `server-only`), so it is written out again here. A change there needs the
 * same change here; the specs that sign in through this file fail if the two
 * part.
 */
export interface StoredSession {
  v: 1;
  user: { sub: string; name?: string; email?: string };
  accessToken: string;
  accessTokenExpiresAt: number;
  refreshToken?: string;
  refreshTokenExpiresAt?: number;
  idToken?: string;
  checkedAt: number;
}

export interface SealOptions {
  /** NEXTAUTH_SECRET */
  secret: string;
  /** `cookiePrefix` in lib/auth.ts */
  cookiePrefix?: string;
  /** `https` base URL: the `__Host-` prefix */
  secure?: boolean;
  now?: number;
}

const CHUNK = 3800;

export async function sealSession(
  session: StoredSession,
  { secret, cookiePrefix = "nazar", now = Date.now() }: SealOptions
): Promise<string> {
  const encoder = new TextEncoder();
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    "HKDF",
    false,
    ["deriveBits"]
  );
  const key = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: encoder.encode(`medaris-auth:${cookiePrefix}`),
        info: encoder.encode("medaris-auth session cookie v1"),
      },
      material,
      256
    )
  );
  // As long as the cookie lives: the refresh token's deadline, 30 days when
  // it has none, the access token's life without one (`cookieLifetime`).
  const until = session.refreshToken
    ? (session.refreshTokenExpiresAt ?? now + 30 * 24 * 60 * 60_000)
    : session.accessTokenExpiresAt;
  return new EncryptJWT({ ...session })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt(Math.floor(now / 1000))
    .setExpirationTime(Math.floor(until / 1000))
    .encrypt(key);
}

/** The cookies that hold `session`: one, or numbered chunks. */
export async function sessionCookies(
  session: StoredSession,
  options: SealOptions
): Promise<Array<{ name: string; value: string }>> {
  const sealed = await sealSession(session, options);
  const name = `${options.secure ? "__Host-" : ""}${options.cookiePrefix ?? "nazar"}.session`;
  if (sealed.length <= CHUNK) return [{ name, value: sealed }];
  const cookies: Array<{ name: string; value: string }> = [];
  for (let start = 0; start < sealed.length; start += CHUNK) {
    cookies.push({
      name: `${name}.${cookies.length}`,
      value: sealed.slice(start, start + CHUNK),
    });
  }
  return cookies;
}

/** A fresh session, Keycloak's confirmation just in, for the specs. */
export const storedSession = (
  overrides: Partial<StoredSession> = {}
): StoredSession => ({
  v: 1,
  user: {
    sub: "user-1",
    name: "Mehmet Emin Işıkoğlu",
    email: "mehmet@example.com",
  },
  accessToken: "access-1",
  accessTokenExpiresAt: Date.now() + 4 * 60_000,
  refreshToken: "refresh-1",
  refreshTokenExpiresAt: Date.now() + 30 * 60_000,
  idToken: "id-token-1",
  checkedAt: Date.now(),
  ...overrides,
});

/** `name=value; …`, as a browser sends them. */
export const cookieHeader = (
  cookies: ReadonlyArray<{ name: string; value: string }>
) => cookies.map(({ name, value }) => `${name}=${value}`).join("; ");

/**
 * What the specs hand `vi.mock("next/headers", …)`: `cookies()` holds the
 * session `session()` names (sealed with vitest.config.ts's NEXTAUTH_SECRET),
 * or none for `null`; `headers()` carries the return path the proxy would
 * have set (`x-medaris-auth-return-to`).
 */
export function nextHeaders(
  session: () => Partial<StoredSession> | null,
  returnTo: () => string | null = () => null
) {
  const jar = async () => {
    const wanted = session();
    return wanted === null
      ? []
      : sessionCookies(storedSession(wanted), {
          secret: process.env.NEXTAUTH_SECRET as string,
        });
  };
  return {
    cookies: async () => {
      const all = await jar();
      return {
        get: (name: string) => all.find((cookie) => cookie.name === name),
        getAll: () => all,
      };
    },
    headers: async () => {
      const path = returnTo();
      return new Headers(path ? { "x-medaris-auth-return-to": path } : {});
    },
  };
}
