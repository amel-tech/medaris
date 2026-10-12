import {
  errors,
  type JWSAlgorithm,
  type JWTVerifyGetKey,
  jwtVerify,
} from "jose";

/**
 * The checks OIDC Back-Channel Logout 1.0 §2.6 asks of a logout token (auth
 * Phase 2), in the spec's order:
 *
 * 1. signed by the IdP: a key from its `jwks_uri`, with one of the algorithms
 *    the API's verifier takes (RS256 today; ES256 and EdDSA for a move to an
 *    EC or Ed25519 key, or to QAuth). The list is ours, so the token's own
 *    `alg` cannot pick `none` or an HMAC keyed with the public key;
 * 2. `iss` is the issuer, `aud` names this client, `iat` is recent (a token
 *    older than `MAX_TOKEN_AGE_S` is refused), and `exp`, when present, has
 *    not passed;
 * 3. it names a `sid`, a `sub`, or both;
 * 4. `events` holds the back-channel logout event;
 * 5. it has no `nonce`, so an ID token, which shares issuer, audience and
 *    keys, cannot be posted here as a logout;
 * 6. its `jti` has not been seen (the caller checks that, in the store).
 *
 * Keycloak 26 sends `iss`, `aud` (the client id), `iat`, `exp` (two minutes
 * on), `jti`, `sub`, the event, and `sid` when the client has "Backchannel
 * logout session required" on; the header's `typ` is `logout+jwt`
 * (DefaultTokenManager.initLogoutToken, 26.3.2).
 */
export const BACKCHANNEL_LOGOUT_EVENT =
  "http://schemas.openid.net/event/backchannel-logout";

const ACCEPTED_ALGORITHMS: JWSAlgorithm[] = [
  "RS256",
  "ES256",
  "EdDSA",
  "Ed25519",
];

/** How old a logout token may be (its `iat`); the spec asks OPs for at most two minutes. */
export const MAX_TOKEN_AGE_S = 120;
/** Clock difference allowed between the IdP and this server. */
export const CLOCK_TOLERANCE_S = 30;
/** How long a `jti` is remembered: longer than any token that passes the age check. */
export const JTI_TTL_MS = (MAX_TOKEN_AGE_S + 2 * CLOCK_TOLERANCE_S) * 1000;

/** What the logout names. */
export interface LogoutClaims {
  jti: string;
  sid?: string;
  sub?: string;
}

/** A token that is not a valid logout token: answered with 400. */
export class InvalidLogoutTokenError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "InvalidLogoutTokenError";
  }
}

/**
 * jose errors that say "this token is not acceptable", as opposed to "the
 * IdP's keys could not be fetched", which is ours to answer with a 5xx.
 */
const isTokenRefusal = (error: unknown) =>
  error instanceof errors.JOSEError &&
  !(error instanceof errors.JWKSTimeout) &&
  !(error instanceof errors.JWKSInvalid);

const text = (value: unknown) =>
  typeof value === "string" && value ? value : undefined;

/**
 * The claims of a valid logout token. Throws `InvalidLogoutTokenError` for
 * one that fails a check; anything else it throws (the keys out of reach) is
 * not the token's fault.
 */
export async function verifyLogoutToken(
  token: string,
  {
    keys,
    issuer,
    clientId,
    now,
  }: { keys: JWTVerifyGetKey; issuer: string; clientId: string; now: number }
): Promise<LogoutClaims> {
  let payload: Record<string, unknown>;
  try {
    ({ payload } = await jwtVerify(token, keys, {
      issuer,
      audience: clientId,
      algorithms: ACCEPTED_ALGORITHMS,
      maxTokenAge: MAX_TOKEN_AGE_S,
      clockTolerance: CLOCK_TOLERANCE_S,
      currentDate: new Date(now),
      requiredClaims: ["iat", "jti"],
    }));
  } catch (error) {
    if (isTokenRefusal(error)) {
      throw new InvalidLogoutTokenError(
        error instanceof errors.JOSEError ? error.code : "invalid token"
      );
    }
    throw error;
  }

  const sid = text(payload.sid);
  const sub = text(payload.sub);
  if (!sid && !sub) {
    throw new InvalidLogoutTokenError("the token names neither sid nor sub");
  }
  const { events } = payload;
  if (
    typeof events !== "object" ||
    events === null ||
    Array.isArray(events) ||
    !Object.hasOwn(events, BACKCHANNEL_LOGOUT_EVENT)
  ) {
    throw new InvalidLogoutTokenError(
      "the token has no back-channel logout event"
    );
  }
  if ("nonce" in payload) {
    throw new InvalidLogoutTokenError("a logout token carries no nonce");
  }
  const jti = text(payload.jti);
  if (!jti) throw new InvalidLogoutTokenError("the token has no jti");
  return {
    jti,
    ...(sid ? { sid } : {}),
    ...(sub ? { sub } : {}),
  };
}
