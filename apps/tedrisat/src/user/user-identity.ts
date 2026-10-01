import { TokenClaims, UserIdentity } from "./interfaces/token-claims.interface";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** RFC 5321's path limit; anything longer is not an address. */
const MAX_EMAIL_LENGTH = 320;
const MAX_NAME_LENGTH = 200;
const MAX_LOCALE_LENGTH = 35;

function text(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) return null;
  return trimmed;
}

/**
 * The profile a token describes, or `null` when the token names no user this
 * table can hold. `users.id` is a `uuid` like every other user column in
 * tedrisat, so a realm that mints a non-UUID `sub` (a federated `f:…` id) is
 * skipped rather than failing the request with a Postgres 22P02.
 */
export function identityFromClaims(
  claims: TokenClaims | undefined
): UserIdentity | null {
  if (!claims || typeof claims.sub !== "string") return null;
  if (!UUID_REGEX.test(claims.sub)) return null;

  return {
    id: claims.sub.toLowerCase(),
    email: text(claims.email, MAX_EMAIL_LENGTH),
    emailVerified: claims.email_verified === true,
    givenName: text(claims.given_name, MAX_NAME_LENGTH),
    familyName: text(claims.family_name, MAX_NAME_LENGTH),
    locale: text(claims.locale, MAX_LOCALE_LENGTH),
  };
}

/**
 * The token-owned columns as one comparable string. A change in any of them
 * must reach the row on the next request, whatever the cache says.
 * `locale` is not part of it: the token only seeds it (see `UserRepository`).
 */
export function identityFingerprint(identity: UserIdentity): string {
  return JSON.stringify([
    identity.email,
    identity.emailVerified,
    identity.givenName,
    identity.familyName,
  ]);
}
