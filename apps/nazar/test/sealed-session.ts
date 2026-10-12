import {
  cookieHeader,
  RETURN_TO_HEADER,
  type StoredSession,
  sealSessionCookies,
} from "@medaris/auth/testing";

/**
 * Nazar's session cookie for the specs, written by `@medaris/auth/testing`
 * (the package's own sealing and chunking), so nothing here copies the format
 * and drifts from it. The specs hand `nextHeaders` to a `next/headers`
 * stand-in, so `~/lib/auth` is the real one.
 */
export { cookieHeader, type StoredSession };

/** nazar's cookie settings as `lib/auth.ts` has them, with vitest.config.ts's values. */
const cookieConfig = () => ({
  baseUrl: process.env.NEXTAUTH_URL as string,
  secret: process.env.NEXTAUTH_SECRET as string,
  cookiePrefix: "nazar",
});

/** The cookies that hold `session`: one, or numbered chunks. */
export async function sessionCookies(
  session: StoredSession
): Promise<Array<{ name: string; value: string }>> {
  return (await sealSessionCookies(cookieConfig(), session)).cookies;
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

/**
 * What the specs hand `vi.mock("next/headers", …)`: `cookies()` holds the
 * session `session()` names, or none for `null`; `headers()` carries the
 * return path the proxy would have set (`RETURN_TO_HEADER`).
 */
export function nextHeaders(
  session: () => Partial<StoredSession> | null,
  returnTo: () => string | null = () => null
) {
  const jar = async () => {
    const wanted = session();
    return wanted === null ? [] : sessionCookies(storedSession(wanted));
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
      return new Headers(path ? { [RETURN_TO_HEADER]: path } : {});
    },
  };
}
