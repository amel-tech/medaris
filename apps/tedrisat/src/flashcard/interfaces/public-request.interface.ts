import { UserPayload } from "./user-payload.interface";

/**
 * The request an `@AuthzPublic()` handler receives (MDRS-45): `AuthGuard`
 * leaves `user` unset for a caller with no token, so the type says so and the
 * handler cannot read `request.user.sub` without deciding what anonymous means.
 */
export interface PublicRequest extends Request {
  user?: UserPayload;
}
