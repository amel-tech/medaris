export interface UserPayload {
  sub: string;
  preferred_username: string;
  given_name?: string;
  family_name?: string;
  name?: string;
  email?: string;
  /** Carries SYSTEM_ADMIN, the one realm role authorization reads. */
  realm_access?: { roles?: string[] };
}

export interface AuthorizedRequest extends Request {
  user: UserPayload;
}

/**
 * The request an `@AuthzPublic()` handler receives (MDRS-122): `AuthGuard`
 * leaves `user` unset for a caller with no token.
 */
export interface PublicRequest extends Request {
  user?: UserPayload;
}
