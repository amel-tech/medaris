import {
  isUnauthenticated,
  isUnauthorizedError,
  type Unauthenticated,
  unauthenticated,
} from "@medaris/auth/server";
import {
  createServerTedrisatAPIs,
  ResponseError,
} from "@medaris/services/tedrisat";
import { getErrorMessage } from "@medaris/services/utils";
import { env } from "~/env";
import { withAccessToken } from "~/lib/auth";

// Infer the API client type so intellisense recognizes the 'api' parameter.
type ApiClient = Awaited<ReturnType<typeof createServerTedrisatAPIs>>;

/**
 * The session is over: there was no token, or the API refused it (401, marked
 * `reauth`). To the action it is a failure like any other (`success: false`,
 * so its log line names it); `outcomeOf` hands the browser only
 * `{ kind: "unauthenticated" }` (with `reauth` kept), which the page sends to
 * sign-in (`handleUnauthenticated`), never a "kaydedilemedi" (auth Phase 1,
 * A16).
 */
type SessionOver = Unauthenticated & {
  success: false;
  error: string;
  errorBody?: undefined;
};

/** Result type for actions: success with data, or failure with server error message. */
export type AuthenticatedActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; errorBody?: unknown }
  | SessionOver;

/** A failed call as the action sees it: the API's message and body, or the error's. */
async function failureOf(
  error: unknown
): Promise<{ success: false; error: string; errorBody?: unknown }> {
  if (error instanceof ResponseError) {
    try {
      const errorBody = await error.response.json();
      return { success: false, error: getErrorMessage(errorBody), errorBody };
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
      error instanceof Error ? error.message : "An unexpected error occurred.",
  };
}

/**
 * Wrapper for Server Actions that require authentication.
 * Returns a result object instead of throwing so the client can show server error messages
 * (Next.js omits thrown error messages in production).
 *
 * The token comes from `withAccessToken`, which reads the session the proxy
 * has just renewed and never refreshes it itself. No token, or a 401 from the
 * API, is the session being over (`SessionOver`).
 */
export async function authenticatedAction<T>(
  action: (api: ApiClient) => Promise<T>
): Promise<AuthenticatedActionResult<T>> {
  const result = await withAccessToken(async (accessToken) => {
    const api = await createServerTedrisatAPIs(
      accessToken,
      env.TEDRISAT_API_BASE_URL
    );
    try {
      return { success: true as const, data: await action(api) };
    } catch (error) {
      // A refused token is the session ending, not this action failing:
      // `withAccessToken` answers it.
      if (isUnauthorizedError(error)) throw error;
      return failureOf(error);
    }
  });
  return isUnauthenticated(result)
    ? { ...result, success: false, error: "No usable session" }
    : result;
}

/** The API's error code of a failed call ("AUTHZ_FORBIDDEN"), or "" when it sent none. */
export const errorCodeOf = (errorBody: unknown): string =>
  errorBody && typeof errorBody === "object" && "code" in errorBody
    ? String((errorBody as { code: unknown }).code)
    : "";

/**
 * What a server action hands the browser: the data, or only the API's code.
 * The server's message (which can name internals) never reaches the page; the
 * page words a failure itself from the code. A session that is over is
 * `{ kind: "unauthenticated" }`, which the page hands `handleUnauthenticated`
 * before anything else.
 */
export type ActionOutcome<T> =
  | { success: true; data: T }
  | { success: false; code: string }
  | Unauthenticated;

export const outcomeOf = <T>(
  result: AuthenticatedActionResult<T>
): ActionOutcome<T> => {
  // `reauth` stays: a refused token must not go straight back with this session.
  if (isUnauthenticated(result))
    return unauthenticated({ reauth: result.reauth });
  return result.success
    ? result
    : { success: false, code: errorCodeOf(result.errorBody) };
};
