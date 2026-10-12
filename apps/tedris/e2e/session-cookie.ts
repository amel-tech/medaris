import { decodeJwt, EncryptJWT } from "jose";

/** What Keycloak's token endpoint answers, as far as a session is built from it. */
export interface GrantTokens {
  access_token: string;
  refresh_token: string;
  id_token: string;
  expires_in: number;
  refresh_expires_in: number;
}

/** The longest value `@medaris/auth` writes into one cookie. */
const CHUNK = 3800;

/**
 * The session cookie(s) `@medaris/auth` would have written for these tokens,
 * for a browser signed in without the sign-in form (`signIn` in sign-in.ts).
 *
 * The package's `StoredSession` (libs/auth/src/server/session-cookie.ts),
 * sealed as a compact JWE (`dir` + `A256GCM`) with a key derived from the
 * app's NEXTAUTH_SECRET through HKDF-SHA-256, salted with the cookie prefix
 * and labelled "session" (libs/auth/src/server/seal.ts). The package does not
 * export the format, so a change there has to be made here too:
 * test/auth-wiring.spec.ts reads what this writes through the app's own
 * `auth()`, and goes red when the two drift.
 *
 * Named `__Host-tedris.session` over https and `tedris.session` over plain
 * http; past 3800 characters the value goes in numbered chunks (`.0`, `.1`,
 * …), which the app reads back in order.
 */
export async function tedrisSessionCookies(
  tokens: GrantTokens,
  { secret, secure, now }: { secret: string; secure: boolean; now: number }
): Promise<{
  cookies: Array<{ name: string; value: string }>;
  maxAge: number;
}> {
  const claims = decodeJwt(tokens.id_token);
  const text = (key: string) => {
    const value = claims[key];
    return typeof value === "string" && value ? value : undefined;
  };
  const refreshTokenExpiresAt =
    tokens.refresh_expires_in > 0
      ? now + tokens.refresh_expires_in * 1000
      : undefined;
  const session = {
    v: 1,
    user: {
      sub: claims.sub as string,
      name: text("name"),
      email: text("email"),
      username: text("preferred_username"),
      locale: text("locale"),
      image: text("picture"),
    },
    accessToken: tokens.access_token,
    accessTokenExpiresAt: now + tokens.expires_in * 1000,
    refreshToken: tokens.refresh_token,
    ...(refreshTokenExpiresAt ? { refreshTokenExpiresAt } : {}),
    idToken: tokens.id_token,
    checkedAt: now,
  };
  const maxAge = Math.max(
    1,
    Math.floor(
      ((refreshTokenExpiresAt ?? now + 30 * 24 * 60 * 60 * 1000) - now) / 1000
    )
  );

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
        salt: encoder.encode("medaris-auth:tedris"),
        info: encoder.encode("medaris-auth session cookie v1"),
      },
      material,
      256
    )
  );
  const sealed = await new EncryptJWT(session)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt(Math.floor(now / 1000))
    .setExpirationTime(Math.floor(now / 1000) + maxAge)
    .encrypt(key);

  const name = `${secure ? "__Host-" : ""}tedris.session`;
  const pieces =
    sealed.length > CHUNK
      ? (sealed.match(new RegExp(`.{1,${CHUNK}}`, "g")) ?? [])
      : [sealed];
  return {
    cookies: pieces.map((value, index) => ({
      name: pieces.length === 1 ? name : `${name}.${index}`,
      value,
    })),
    maxAge,
  };
}
