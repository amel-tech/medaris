/**
 * The one "you are not signed in (any more)" answer (auth Phase 1).
 *
 * An expired session used to surface in as many ways as there were call
 * sites: an empty list, "izniniz yok", "not found", a "could not be read" box
 * whose retry never cleared (A16, #270), or the English text
 * "Unauthorized: No access token found" from `authenticatedAction`. A server
 * action now returns this value instead, and the client sends the user to
 * sign-in keeping the page they were on (`handleUnauthenticated` in
 * `@medaris/auth/client`). Pages redirect on the server
 * (`requireSession`, `requireAccessToken`).
 *
 * `reauth` marks the case where there WAS a token and the API refused it
 * (401): the session this browser holds is the problem, so the sign-in that
 * follows must not go straight back with it (that is a loop between the page
 * and the sign-in page) but fetch new tokens from the IdP, within the sign-in
 * caps.
 *
 * Shared by both entries: the server builds it, the client recognises it.
 */
export interface Unauthenticated {
  readonly kind: "unauthenticated";
  /** The API refused a token this session holds: sign in again, do not go on with it. */
  readonly reauth?: true;
}

export const unauthenticated = (
  options: { reauth?: boolean } = {}
): Unauthenticated =>
  options.reauth
    ? { kind: "unauthenticated", reauth: true }
    : { kind: "unauthenticated" };

export const isUnauthenticated = (value: unknown): value is Unauthenticated =>
  typeof value === "object" &&
  value !== null &&
  (value as { kind?: unknown }).kind === "unauthenticated";

const statusField = (value: unknown): number | undefined => {
  const status = (value as { status?: unknown } | null | undefined)?.status;
  return typeof status === "number" ? status : undefined;
};

/**
 * The HTTP status an error carries, wherever its library put it:
 * `ResponseError.response.status` (the generated tedrisat client),
 * `error.status` (openid-client's `ResponseBodyError` and
 * `WWWAuthenticateChallengeError`), or `error.cause.status` (openid-client's
 * "unexpected HTTP response status code", whose cause is the `Response`).
 */
export const httpStatusOf = (error: unknown): number | undefined => {
  if (typeof error !== "object" || error === null) return undefined;
  const source = error as { response?: unknown; cause?: unknown };
  return (
    statusField(error) ??
    statusField(source.response) ??
    statusField(source.cause)
  );
};

/** Whether an API call failed because the token was refused (401). */
export const isUnauthorizedError = (error: unknown): boolean =>
  httpStatusOf(error) === 401;
