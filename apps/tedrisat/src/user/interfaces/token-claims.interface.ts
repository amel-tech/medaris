/**
 * The access-token claims tedrisat keeps a copy of (MDRS-104). `AuthGuard`
 * puts the whole verified payload on `request.user`; only these are read.
 * Every field but `sub` is optional — a realm need not map them.
 */
export interface TokenClaims {
  sub: string;
  email?: unknown;
  email_verified?: unknown;
  given_name?: unknown;
  family_name?: unknown;
  locale?: unknown;
  realm_access?: { roles?: string[] };
}

export interface AuthenticatedRequest {
  user?: TokenClaims;
}

/** The profile fields copied from a token, normalised. */
export interface UserIdentity {
  id: string;
  email: string | null;
  emailVerified: boolean;
  givenName: string | null;
  familyName: string | null;
  locale: string | null;
}
