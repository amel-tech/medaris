import type { AuthenticatedActionResult } from "~/lib/authenticated-action";
import { sendToSignIn } from "~/lib/send-to-sign-in";

/**
 * A server action answers `{ success: false }` when the API refuses, but when
 * the request never reaches the server (the network dropped, "Failed to
 * fetch") the call itself rejects. A screen that awaits it bare is left in its
 * busy state with no toast (tedris/26 check, round 1), so every deck write goes
 * through here: a rejection is a failure like any other, and the screen undoes
 * what it drew and says so.
 *
 * A session that is over is not such a failure (E2): the user goes to sign in
 * and comes back to this page, and the promise never settles, so the screen
 * stays busy until the browser leaves instead of drawing "could not be saved".
 */
export const attempt = async <T>(
  run: () => Promise<AuthenticatedActionResult<T>>
): Promise<AuthenticatedActionResult<T>> => {
  let result: AuthenticatedActionResult<T>;
  try {
    result = await run();
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Request failed",
    };
  }
  if (sendToSignIn(result)) return new Promise(() => {});
  return result;
};
