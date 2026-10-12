import {
  handleUnauthenticated,
  isUnauthenticated,
  type Unauthenticated,
} from "@medaris/auth/client";
import { localeOfPath } from "~/lib/i18n/routing";

/**
 * The client half of the one "session over" answer (auth Phase 1). A Server
 * Action answered `{ kind: "unauthenticated" }`: the session ended, or
 * tedrisat refused its token. `@medaris/auth`'s `handleUnauthenticated` sends
 * the visitor to sign in and back to this page (path, query and fragment),
 * with Keycloak in the page's language (MDRS-274), and this tells the caller
 * to draw nothing else: no "could not be saved" toast, no "could not be read"
 * panel, no "izniniz yok" for what is only an expired session.
 *
 * ```ts
 * const result = await saveSomething(input);
 * if (redirectIfUnauthenticated(result)) return;
 * ```
 */
export function redirectIfUnauthenticated(
  result: unknown
): result is Unauthenticated {
  if (!isUnauthenticated(result)) return false;
  return handleUnauthenticated(result, {
    locale: localeOfPath(window.location.pathname),
  });
}
