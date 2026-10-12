import {
  handleUnauthenticated as sendToSignIn,
  type Unauthenticated,
} from "@medaris/auth/client";
import { LOCALE } from "~/lib/i18n/locale";

type Deps = Parameters<typeof sendToSignIn>[2];

/**
 * The browser half of a server action's `{ kind: "unauthenticated" }`: the
 * session is over. Sends the person to sign in and back to exactly this page
 * (path, query and fragment), with Keycloak's form in Turkish (MDRS-274), and
 * tells the caller to draw nothing else: an expired session is never a
 * "kaydedilemedi" toast, an empty list or "izniniz yok" (auth Phase 1, A16).
 * Client components only; every caller of an action asks this first:
 *
 * ```ts
 * const result = await hideMedrese(madrasahId);
 * if (handleUnauthenticated(result)) return;
 * ```
 *
 * `deps` is for the specs; the browser's own are the default.
 */
export const handleUnauthenticated = (
  result: unknown,
  deps?: Deps
): result is Unauthenticated => sendToSignIn(result, { locale: LOCALE }, deps);
