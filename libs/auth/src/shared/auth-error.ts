/**
 * The `?error=` codes the sign-in routes put on the app's sign-in page, and
 * which message each one shows (MDRS-101).
 *
 * The first four are NextAuth's names for the same failures, kept so the apps'
 * `Auth.*` messages and their sign-in pages read the same codes after the move:
 *
 * - `OAuthSignin`: the round trip could not start (the IdP's discovery
 *   document was out of reach);
 * - `OAuthCallback`: it came back and failed (an unknown or replayed `state`,
 *   an expired code). A second round trip usually fixes it;
 * - `AccessDenied`: the IdP refused the account (`error=access_denied`);
 * - `Configuration`: the IdP refused the app (`invalid_client`: a client
 *   secret that no longer matches, as MDRS-269 saw on nazar-dev). Retrying
 *   cannot help, so nothing retries it;
 * - `SignInLimit`: this browser went to sign in too often in a short time,
 *   whether the start route counted it or the sign-in page's own budget ran
 *   out. The hard stop against a loop: nothing starts another by itself, and
 *   the page says to wait a few minutes rather than "something went wrong".
 */
export const AUTH_ERROR_CODES = [
  "OAuthSignin",
  "OAuthCallback",
  "AccessDenied",
  "Configuration",
  "SignInLimit",
] as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

/**
 * Every key `authErrorMessageKey` can answer, so an app can pin that its
 * `Auth.*` messages have each one in every locale.
 */
export const AUTH_ERROR_MESSAGE_KEYS = [
  "accessDenied",
  "configurationError",
  "signInLimit",
  "errorDescription",
] as const;

export type AuthErrorMessageKey = (typeof AUTH_ERROR_MESSAGE_KEYS)[number];

/** The `Auth.*` message for an `?error=` code; anything unknown is the generic one. */
export const authErrorMessageKey = (
  error: string | null | undefined
): AuthErrorMessageKey => {
  if (error === "AccessDenied") return "accessDenied";
  if (error === "Configuration") return "configurationError";
  if (error === "SignInLimit") return "signInLimit";
  return "errorDescription";
};

const FINAL_ERRORS = new Set<string>([
  "AccessDenied",
  "Configuration",
  "SignInLimit",
]);

/** A failed round trip that one more automatic attempt may fix. */
export const isRetryableAuthError = (error: string | null | undefined) =>
  Boolean(error) && !FINAL_ERRORS.has(error as string);
