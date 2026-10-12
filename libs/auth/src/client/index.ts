"use client";

/**
 * `@medaris/auth/client`: the session context, sign-in and sign-out from the
 * browser, and the client half of the "unauthenticated" answer. Holds no token
 * and reaches no secret. `client-only` makes a Server Component that imports
 * it a build error; a server layout still renders `SessionProvider`, which
 * this file's "use client" turns into a client reference.
 */
import "client-only";

export {
  AUTH_ERROR_CODES,
  AUTH_ERROR_MESSAGE_KEYS,
  type AuthErrorCode,
  type AuthErrorMessageKey,
  authErrorMessageKey,
  isRetryableAuthError,
} from "../shared/auth-error";
export { AUTH_ROUTES, REAUTH_PARAM } from "../shared/routes";
export type { Session, SessionUser } from "../shared/session";
export {
  isUnauthenticated,
  type Unauthenticated,
} from "../shared/unauthenticated";
export {
  type SessionChange,
  type SessionContextValue,
  SessionProvider,
  type SessionProviderProps,
  type SessionStatus,
  sessionChange,
  useSession,
} from "./session-context";
export {
  browserSignInDeps,
  enterSignIn,
  fetchSession,
  type SignInDeps,
  type SignInIntent,
  type SignInOutcome,
  type SignInRequest,
  signIn,
  signInHref,
} from "./sign-in";
export { type SignOutOptions, signOut } from "./sign-out";
export { handleUnauthenticated } from "./unauthenticated";
