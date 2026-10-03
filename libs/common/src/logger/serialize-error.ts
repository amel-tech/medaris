const MAX_CAUSE_DEPTH = 5;

export interface SerializedError {
  name: string;
  message: string;
  stack?: string;
  code?: unknown;
  context?: unknown;
  cause?: unknown;
}

/**
 * An Error as a plain object a log line can carry. `JSON.stringify` drops an
 * Error's own properties, and `stack` never includes the `cause`, so a wrapped
 * failure (a 5xx MedarisError around a failed SQL query, MDRS-220) would reach
 * the log as its wrapper only. Follows `cause` a few levels deep.
 */
export function serializeError(error: Error, depth = 0): SerializedError {
  const { code, context } = error as Error & {
    code?: unknown;
    context?: unknown;
  };
  const serialized: SerializedError = {
    name: error.name,
    message: error.message,
    stack: error.stack,
    ...(code !== undefined && { code }),
    ...(context !== undefined && { context }),
  };
  if (error.cause !== undefined) {
    serialized.cause =
      error.cause instanceof Error
        ? depth < MAX_CAUSE_DEPTH
          ? serializeError(error.cause, depth + 1)
          : { name: error.cause.name, message: error.cause.message }
        : error.cause;
  }
  return serialized;
}
