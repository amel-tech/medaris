import { signIn } from "next-auth/react";

/**
 * Which Keycloak form the visitor should land on (MDRS-101).
 *
 * `register` asks Keycloak for its registration form directly with the OIDC
 * `prompt=create` parameter (Initiating User Registration via OpenID Connect
 * 1.0), which Keycloak honours on the realm's own auth endpoint as long as the
 * realm allows user registration. Without it the visitor sees the login form
 * and has to find the "Register" link themselves.
 */
export type KeycloakSignInIntent = "signin" | "register";

export interface KeycloakSignInRequest {
  intent: KeycloakSignInIntent;
  /** Where NextAuth sends the browser after the callback. */
  callbackUrl: string;
  /**
   * The active locale. It becomes both `ui_locales`, the OIDC hint kept on
   * the auth session, and `kc_locale`, the explicit choice Keycloak ranks
   * above its own `KEYCLOAK_LOCALE` cookie and remembers for the forms that
   * follow (login → register → back). With only the hint, a stale cookie or a
   * restarted flow showed a Turkish form to an English visitor (MDRS-274).
   */
  locale: string;
}

/**
 * The three arguments `signIn()` takes, built in one place so the two web apps
 * cannot disagree about them. Pure, so the apps can assert on it without a
 * browser.
 */
export const keycloakSignInArgs = ({
  intent,
  callbackUrl,
  locale,
}: KeycloakSignInRequest): [
  "keycloak",
  { callbackUrl: string },
  Record<string, string>,
] => {
  const authorizationParams: Record<string, string> = {
    ui_locales: locale,
    kc_locale: locale,
  };
  if (intent === "register") authorizationParams.prompt = "create";
  return ["keycloak", { callbackUrl }, authorizationParams];
};

/** Starts the Keycloak round trip. Client-only: `next-auth/react`. */
export const keycloakSignIn = (request: KeycloakSignInRequest) =>
  signIn(...keycloakSignInArgs(request));
