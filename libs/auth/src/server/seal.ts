import { EncryptJWT, jwtDecrypt } from "jose";

/**
 * Encrypts the cookies' contents: a compact JWE, `dir` + `A256GCM`, with a key
 * derived from `NEXTAUTH_SECRET` through HKDF-SHA-256.
 *
 * Authenticated encryption, so a cookie the browser altered fails to open
 * rather than opening to something else. One key per app and per purpose (the
 * session, a sign-in round trip): the HKDF salt is the cookie prefix and the
 * info names the purpose, so an app's sign-in cookie cannot be replayed as its
 * session, and two apps that were given the same secret (the `.env.example`
 * placeholders are all "set-me-per-machine") still cannot open each other's.
 */
export type SealPurpose = "session" | "flow";

const encoder = new TextEncoder();

export async function deriveKey(
  secret: string,
  cookiePrefix: string,
  purpose: SealPurpose
): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    "HKDF",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode(`medaris-auth:${cookiePrefix}`),
      info: encoder.encode(`medaris-auth ${purpose} cookie v1`),
    },
    material,
    256
  );
  return new Uint8Array(bits);
}

/** Seals `payload` until `expiresAt` (epoch ms). The result is cookie-safe base64url. */
export async function seal(
  payload: Record<string, unknown>,
  key: Uint8Array,
  { now, expiresAt }: { now: number; expiresAt: number }
): Promise<string> {
  return new EncryptJWT(payload)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt(Math.floor(now / 1000))
    .setExpirationTime(Math.floor(expiresAt / 1000))
    .encrypt(key);
}

/**
 * Opens a sealed value, or `null` for anything that is not one this key
 * sealed, or that has expired. Never throws: a cookie that does not open is a
 * cookie that is not there.
 */
export async function unseal<T>(
  token: string,
  key: Uint8Array,
  now: number
): Promise<T | null> {
  try {
    const { payload } = await jwtDecrypt(token, key, {
      keyManagementAlgorithms: ["dir"],
      contentEncryptionAlgorithms: ["A256GCM"],
      currentDate: new Date(now),
    });
    return payload as T;
  } catch {
    return null;
  }
}
