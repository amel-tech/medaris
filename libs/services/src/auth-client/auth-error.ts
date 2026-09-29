/**
 * Which message an app's own error page shows for a NextAuth error code
 * (MDRS-101). NextAuth puts the code in `?error=` when it redirects to
 * `pages.error` or `pages.signIn`; the codes are NextAuth's, the wording is
 * each app's `Auth.*` i18n keys.
 *
 * `AccessDenied` — the `signIn` callback refused the account.
 * `Configuration` — the server is misconfigured; retrying will not help.
 * Everything else (`OAuthSignin`, `OAuthCallback`, `Callback`, `Verification`,
 * an unknown code) is a failed round trip that a retry can fix.
 */
export type AuthErrorMessageKey =
  | "accessDenied"
  | "configurationError"
  | "errorDescription";

export const authErrorMessageKey = (
  error: string | null | undefined
): AuthErrorMessageKey => {
  if (error === "AccessDenied") return "accessDenied";
  if (error === "Configuration") return "configurationError";
  return "errorDescription";
};
