import { isUnauthenticated, type Unauthenticated } from "@medaris/auth/server";
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
 * The session is over (no token, or tedrisat refused it with 401): the one
 * "unauthenticated" answer of `@medaris/auth`, which the client hands to
 * `sendToSignIn` (`lib/send-to-sign-in.ts`) to go to sign-in and come back to
 * the same page. It is also a failure (`success: false`), so a caller that
 * does not look for it still draws its ordinary error, never a crash.
 */
export type SignedOut = Unauthenticated & {
  success: false;
  error: string;
  status: 401;
};

/** Result type for actions: success with data, or failure with server error message. */
export type AuthenticatedActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; status?: number }
  | SignedOut;

const signedOut: SignedOut = {
  kind: "unauthenticated",
  success: false,
  error: "Unauthenticated",
  status: 401,
};

/**
 * Wrapper for Server Actions that require authentication.
 * Returns a result object instead of throwing so the client can show server error messages
 * (Next.js omits thrown error messages in production).
 *
 * The token comes through `withAccessToken`: without a session, or when
 * tedrisat answers 401, the result is `{ kind: "unauthenticated" }` rather
 * than the English "Unauthorized: No access token found" a toast used to show
 * (E2), and the client sends the user to sign in instead.
 */
export async function authenticatedAction<T>(
  action: (api: ApiClient) => Promise<T>
): Promise<AuthenticatedActionResult<T>> {
  const result = await withAccessToken(
    async (accessToken): Promise<AuthenticatedActionResult<T>> => {
      const api = await createServerTedrisatAPIs(
        accessToken,
        env.TEDRISAT_API_BASE_URL
      );
      try {
        const data = await action(api);
        return { success: true, data };
      } catch (error) {
        if (error instanceof ResponseError) {
          // A refused token is `withAccessToken`'s to answer.
          if (error.response.status === 401) throw error;
          let message: string;
          try {
            const errorBody = await error.response.json();
            message = getErrorMessage(errorBody);
          } catch {
            message = error.response.statusText || "Request failed";
          }
          return {
            success: false,
            error: message,
            status: error.response.status,
          };
        }
        return {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "An unexpected error occurred.",
        };
      }
    }
  );
  return isUnauthenticated(result) ? signedOut : result;
}
