import { AUTH_ROUTES } from "./routes";

/**
 * Account actions: a page of the IdP where a signed-in person changes
 * something the account holds, started from an app and coming back to it.
 *
 * Keycloak calls them application-initiated actions (AIA): an authorization
 * request with `kc_action=<action>` shows that action's form to the signed-in
 * user (after the login form when the SSO session has ended), then sends the
 * browser to the callback with a code, as a sign-in does. The callback stores
 * a new session from that code, so the tokens the app holds afterwards carry
 * what the person changed (since #317 the account's gender lives in its
 * profile, `UPDATE_PROFILE`). `kc_action` is Keycloak's parameter; another IdP
 * would need its own mapping in the start route.
 */

/** `?action=` on the start route. */
export const ACCOUNT_ACTION_PARAM = "action";

/**
 * The actions an app may start, and nothing else: the start route ignores any
 * other value, so a link cannot open Keycloak's `delete_account` (or any
 * action added later) in an app's name.
 */
export const ACCOUNT_ACTIONS = ["UPDATE_PROFILE"] as const;
export type AccountAction = (typeof ACCOUNT_ACTIONS)[number];

export const isAccountAction = (value: unknown): value is AccountAction =>
  ACCOUNT_ACTIONS.some((action) => action === value);

export interface AccountActionRequest {
  /** Where to land afterwards: a same-origin path; the server validates it again. */
  callbackUrl?: string;
  /** The active UI locale, passed to the IdP as `ui_locales`. */
  locale?: string;
}

/**
 * The start route's address for `action`: a plain link, so a page can render
 * it as `<a href>` from the server or the client. Following it goes through
 * the IdP even when the browser is signed in, and counts against the start
 * route's cap like any start.
 */
export function accountActionHref(
  action: AccountAction,
  request: AccountActionRequest = {}
): string {
  const params = new URLSearchParams({ [ACCOUNT_ACTION_PARAM]: action });
  if (request.callbackUrl) params.set("callbackUrl", request.callbackUrl);
  if (request.locale) params.set("locale", request.locale);
  return `${AUTH_ROUTES.signIn}?${params.toString()}`;
}
