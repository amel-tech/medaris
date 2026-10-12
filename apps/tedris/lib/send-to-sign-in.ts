import {
  handleUnauthenticated,
  isUnauthenticated,
  type Unauthenticated,
} from "@medaris/auth/client";
import { locales } from "~/lib/i18n/routing";

/**
 * The client half of the one "unauthenticated" path (`@medaris/auth`): a
 * Server Action answered `{ kind: "unauthenticated" }`, so the session is
 * over. Sends the user to sign in, in the language of the page they are on
 * (MDRS-274), and back to exactly where they were (path, query, fragment).
 * `true` tells the caller to draw nothing else: no "could not be saved" or
 * "could not be loaded" for what is only an expired session (E2, A16).
 *
 * ```ts
 * const result = await saveNotes(input);
 * if (sendToSignIn(result)) return;
 * ```
 *
 * For client components only: it reads the browser's address.
 */
export function sendToSignIn(result: unknown): result is Unauthenticated {
  if (!isUnauthenticated(result)) return false;
  const first = window.location.pathname.split("/")[1];
  const locale = locales.find((candidate) => candidate === first);
  return handleUnauthenticated(result, { locale });
}
