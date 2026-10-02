import type { AuthenticatedActionResult } from "~/lib/authenticated-action";

/**
 * A server action answers `{ success: false }` when the API refuses, but when
 * the request never reaches the server (the network dropped, "Failed to
 * fetch") the call itself rejects. A screen that awaits it bare is left in its
 * busy state with no toast (tedris/26 check, round 1), so every deck write goes
 * through here: a rejection is a failure like any other, and the screen undoes
 * what it drew and says so.
 */
export const attempt = async <T>(
  run: () => Promise<AuthenticatedActionResult<T>>
): Promise<AuthenticatedActionResult<T>> => {
  try {
    return await run();
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Request failed",
    };
  }
};
