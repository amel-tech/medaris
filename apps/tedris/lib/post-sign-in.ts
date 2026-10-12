import { destinationFromCallback } from "@medaris/utils";
import { homePath } from "./auth_pages";

/**
 * Where a sign-in lands (MDRS-101): the page it named, or Ana sayfa
 * (`homePath`) when it named none. There is no first-login step in between
 * any more.
 */

/** The `callbackUrl` the sign-in page passes on to Keycloak. */
export const signInCallbackUrl = (
  callbackUrl: string | null | undefined,
  options: { baseUrl: string; locales: readonly string[]; locale: string }
): string =>
  destinationFromCallback(callbackUrl, options) ?? homePath(options.locale);
