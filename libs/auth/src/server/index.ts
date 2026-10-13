/**
 * `@medaris/auth/server`: everything that touches a token or a cookie.
 * `server-only` makes a client component that imports this a build error,
 * not a token in the browser bundle.
 */
import "server-only";

export {
  ACCOUNT_ACTION_PARAM,
  ACCOUNT_ACTIONS,
  type AccountAction,
  type AccountActionRequest,
  accountActionHref,
} from "../shared/account-action";
export {
  AUTH_ERROR_CODES,
  AUTH_ERROR_MESSAGE_KEYS,
  type AuthErrorCode,
  type AuthErrorMessageKey,
  authErrorMessageKey,
  isRetryableAuthError,
} from "../shared/auth-error";
export { AUTH_BASE_PATH, AUTH_ROUTES, REAUTH_PARAM } from "../shared/routes";
export type { Session, SessionUser } from "../shared/session";
export {
  httpStatusOf,
  isUnauthenticated,
  isUnauthorizedError,
  type Unauthenticated,
  unauthenticated,
} from "../shared/unauthenticated";
export type { AuthConfig, AuthPages, SessionStoreConfig } from "./config";
export { type Auth, createAuth } from "./create-auth";
export type { AuthProxy, AuthProxyOptions } from "./proxy";
export type {
  RequireOptions,
  ServerReads,
  SignInRedirectOptions,
} from "./reads";
export { RETURN_TO_HEADER } from "./return-to";
export type { AuthRouteHandlers } from "./routes";
export {
  isSessionStoreUnavailable,
  SessionStoreUnavailableError,
  type StoreBackend,
} from "./store-backend";
