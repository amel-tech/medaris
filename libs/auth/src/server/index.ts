/**
 * `@medaris/auth/server`: everything that touches a token or a cookie.
 * `server-only` makes a client component that imports this a build error,
 * not a token in the browser bundle.
 */
import "server-only";

export type {
  AuthErrorCode,
  AuthErrorMessageKey,
} from "../shared/auth-error";
export { AUTH_BASE_PATH, AUTH_ROUTES } from "../shared/routes";
export type { Session, SessionUser } from "../shared/session";
export {
  httpStatusOf,
  isUnauthenticated,
  isUnauthorizedError,
  type Unauthenticated,
  unauthenticated,
} from "../shared/unauthenticated";
export type { AuthConfig, AuthPages } from "./config";
export { type Auth, createAuth } from "./create-auth";
export type { AuthProxy, AuthProxyOptions } from "./proxy";
export type { RequireOptions, ServerReads } from "./reads";
export type { AuthRouteHandlers } from "./routes";
