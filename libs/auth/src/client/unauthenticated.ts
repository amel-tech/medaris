import {
  isUnauthenticated,
  type Unauthenticated,
} from "../shared/unauthenticated";
import { browserSignInDeps, type SignInDeps, signIn } from "./sign-in";

/**
 * The client half of the one "unauthenticated" path: a Server Action answered
 * `{ kind: "unauthenticated" }`, so the session is over. Sends the visitor to
 * sign in and back to exactly where they were (path, query and fragment),
 * and tells the caller so it draws nothing else, in particular no "could not
 * be saved" or "izniniz yok" for what is only an expired session.
 *
 * A result marked `reauth` (the API refused the token the session holds)
 * asks the start route for new tokens rather than "already signed in, go
 * on", which would only bring the visitor back to the same refusal.
 *
 * ```ts
 * const result = await saveNotes(input);
 * if (handleUnauthenticated(result, { locale })) return;
 * ```
 */
export function handleUnauthenticated(
  result: unknown,
  options: { locale?: string } = {},
  deps: Pick<SignInDeps, "navigate" | "shared" | "local" | "now"> & {
    location?: () => string;
  } = browserSignInDeps()
): result is Unauthenticated {
  if (!isUnauthenticated(result)) return false;
  const here =
    deps.location?.() ??
    `${window.location.pathname}${window.location.search}${window.location.hash}`;
  signIn(
    {
      callbackUrl: here,
      locale: options.locale,
      ...(result.reauth ? { reauth: true } : {}),
    },
    deps
  );
  return true;
}
