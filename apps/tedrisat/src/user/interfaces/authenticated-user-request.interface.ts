import { TokenClaims } from "./token-claims.interface";

/** A request that has passed `AuthGuard`, so `user` is set. */
export interface AuthenticatedUserRequest extends Request {
  user: TokenClaims;
}
