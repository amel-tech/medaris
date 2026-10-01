export interface UserPayload {
  sub: string;
  preferred_username: string;
  email?: string;
}

export interface AuthorizedRequest extends Request {
  user: UserPayload;
}

/**
 * The request an `@AuthzPublic()` handler receives (MDRS-122): `AuthGuard`
 * leaves `user` unset for a caller with no token, so the handler has to say
 * what anonymous means before it can read `request.user.sub`.
 */
export interface PublicRequest extends Request {
  user?: UserPayload;
}
