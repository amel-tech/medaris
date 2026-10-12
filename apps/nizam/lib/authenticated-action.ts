import {
  isUnauthenticated,
  isUnauthorizedError,
  type Unauthenticated,
} from "@medaris/auth/server";
import {
  createServerTedrisatAPIs,
  ResponseError,
} from "@medaris/services/tedrisat";
import { getErrorMessage } from "@medaris/services/utils";
import { env } from "~/env";
import { withAccessToken } from "~/lib/auth";
import type { TedrisatApi } from "~/lib/tedrisat-api";

/** What an action that reached tedrisat answers: its data, or the server's error message. */
export type ActionOutcome<T> =
  | { success: true; data: T }
  | { success: false; error: string; errorBody?: unknown };

/**
 * An action's result: its outcome, or `{ kind: "unauthenticated" }` when the
 * session is over (no token, or tedrisat refused it). That used to be the
 * English failure "Unauthorized: No access token found", shown as a generic
 * toast or an empty panel. The client passes every result to
 * `redirectIfUnauthenticated` (`~/lib/unauthenticated`) before it reads
 * `success`, and the visitor goes to sign in and back to the same page.
 */
export type AuthenticatedActionResult<T> = ActionOutcome<T> | Unauthenticated;

/**
 * Wrapper for Server Actions that require authentication.
 * Returns a result object instead of throwing so the client can show server error messages
 * (Next.js omits thrown error messages in production).
 */
export async function authenticatedAction<T>(
  action: (api: TedrisatApi) => Promise<T>
): Promise<AuthenticatedActionResult<T>> {
  return withAccessToken(async (accessToken): Promise<ActionOutcome<T>> => {
    const api = await createServerTedrisatAPIs(
      accessToken,
      env.TEDRISAT_API_BASE_URL
    );

    try {
      const data = await action(api);
      return { success: true, data };
    } catch (error) {
      // A refused token is the end of the session, not this action's
      // failure: `withAccessToken` answers it with `unauthenticated`.
      if (isUnauthorizedError(error)) throw error;
      if (error instanceof ResponseError) {
        try {
          const errorBody = await error.response.json();
          return {
            success: false,
            error: getErrorMessage(errorBody),
            errorBody,
          };
        } catch {
          return {
            success: false,
            error: error.response.statusText || "Request failed",
          };
        }
      }
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred.",
      };
    }
  });
}

/** The action went through: neither a failure nor an ended session. */
export const succeeded = <T>(
  result: AuthenticatedActionResult<T>
): result is { success: true; data: T } =>
  !isUnauthenticated(result) && result.success;
