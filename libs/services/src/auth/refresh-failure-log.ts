/**
 * What an operator needs to know about a failed Keycloak token refresh — and
 * nothing else (MDRS-231).
 *
 * The refresh used to hand whatever it caught to `console.log` whole. What it
 * catches is either an `Error` (an expired refresh token, a network failure) or
 * what Keycloak's token endpoint answered, and a library error or a future
 * change to the call could hang the request body — the refresh token and the
 * client secret — or the raw response off it. So the summary is an allow-list:
 * a field is logged only when it is named below and has the expected type.
 */
export interface RefreshFailureSummary {
  name?: string;
  message?: string;
  status?: number;
  error?: string;
  error_description?: string;
  /** Set instead of everything else when a non-object was thrown. */
  thrown?: string;
}

const STRING_FIELDS = [
  "name",
  "message",
  "error",
  "error_description",
] as const;

export const summarizeRefreshFailure = (
  failure: unknown
): RefreshFailureSummary => {
  if (failure === null) return { thrown: "null" };
  if (typeof failure !== "object") return { thrown: typeof failure };

  const source = failure as Record<string, unknown>;
  const summary: RefreshFailureSummary = {};

  for (const field of STRING_FIELDS) {
    const value = source[field];
    if (typeof value === "string") summary[field] = value;
  }

  const response = source.response as { status?: unknown } | null | undefined;
  const status = source.status ?? response?.status;
  if (typeof status === "number") summary.status = status;

  return summary;
};

/** Logs a failed refresh at error level, as its summary only. */
export const logRefreshFailure = (failure: unknown): void => {
  console.error(
    "Keycloak token refresh failed:",
    summarizeRefreshFailure(failure)
  );
};
