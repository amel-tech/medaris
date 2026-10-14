/**
 * What an access token says beyond the registered JWT claims, read in one
 * place (auth audit C5).
 *
 * `iss`, `aud`, `exp` and `sub` are standard, and `JwtVerifierService` checks
 * them the same way for any IdP. How a token says it is an access token,
 * which client it was issued to, which roles its subject holds and what
 * gender the account has is not: each IdP has its own claims for that. Every
 * reader of those goes through `mapAccessTokenClaims`, so replacing Keycloak with QAuth means
 * adding QAuth's mapping next to this one and choosing it here, rather than
 * finding every `realm_access` in the code.
 *
 * Today the mapping is Keycloak's, unchanged:
 *
 * - token type: the payload's `typ`, which Keycloak sets to `Bearer` on an
 *   access token, `ID` on an ID token and `Refresh` on a refresh token;
 * - client: `azp`;
 * - roles: `realm_access.roles`; client roles: `resource_access.<client>.roles`;
 * - gender: `gender`, a string the realm's `gender` client scope maps from the
 *   required user-profile attribute of the same name (#317). Tokens issued
 *   before that scope is rolled out carry none, and neither does a client
 *   without it, so its absence is the ordinary case, not an error.
 *
 * QAuth's claims are not fixed yet (not verified). If it follows RFC 9068,
 * its mapping reads the header's `typ: at+jwt` and `client_id`, and then
 * needs the protected header passed in alongside the payload.
 */
export interface AccessTokenClaims {
  /** The token says it is an access token, not an ID or refresh token. */
  isAccessToken: boolean;
  /** The token-type marker as it appears in the token, for messages only. */
  tokenType: unknown;
  /** The client the token was issued to; undefined when absent or not a string. */
  clientId: string | undefined;
  /** The subject's realm-wide roles; empty when absent or malformed. */
  roles: string[];
  /** The subject's roles per client id. Nothing reads them yet. */
  clientRoles: Record<string, string[]>;
  /**
   * The account's gender, the one source of it (#317). Undefined when the
   * token carries none or carries anything but `FEMALE` / `MALE`.
   */
  gender: AccessTokenGender | undefined;
}

/** The two values the realm's `gender` attribute allows, as tedrisat stores them. */
export const ACCESS_TOKEN_GENDERS = ["FEMALE", "MALE"] as const;
export type AccessTokenGender = (typeof ACCESS_TOKEN_GENDERS)[number];

/** Keycloak's payload `typ` on an access token. */
const KEYCLOAK_ACCESS_TOKEN_TYPE = "Bearer";

/**
 * Exactly one of the two values, as the attribute's `options` validator
 * writes them. Anything else (another case, an array, an empty string) is no
 * gender: a mapper misconfigured by hand must not put a third value into
 * tedrisat.
 */
function genderIn(value: unknown): AccessTokenGender | undefined {
  return ACCESS_TOKEN_GENDERS.find((gender) => gender === value);
}

/**
 * `{ roles: [...] }` as Keycloak nests it, read defensively: a protocol
 * mapper that sends something else must read as "no roles", never throw and
 * never grant (`AuthzService` relied on this before it moved here).
 */
function rolesIn(access: unknown): string[] {
  if (typeof access !== "object" || access === null) {
    return [];
  }
  const roles = (access as { roles?: unknown }).roles;
  return Array.isArray(roles)
    ? roles.filter((role): role is string => typeof role === "string")
    : [];
}

function clientRolesIn(access: unknown): Record<string, string[]> {
  if (typeof access !== "object" || access === null) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(access).map(([client, entry]) => [client, rolesIn(entry)])
  );
}

/**
 * Maps a verified access token's payload (`request.user`) to the claims this
 * codebase reads beyond the registered ones. Keycloak's mapping; see above.
 */
export function mapAccessTokenClaims(payload: object): AccessTokenClaims {
  const claims = payload as Record<string, unknown>;

  return {
    isAccessToken: claims.typ === KEYCLOAK_ACCESS_TOKEN_TYPE,
    tokenType: claims.typ,
    clientId: typeof claims.azp === "string" ? claims.azp : undefined,
    roles: rolesIn(claims.realm_access),
    clientRoles: clientRolesIn(claims.resource_access),
    gender: genderIn(claims.gender),
  };
}
