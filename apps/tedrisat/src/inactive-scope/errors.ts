import { type ErrorContext, NotFoundError } from "@medaris/common";

/** No passive köşk, medrese or course with that id (it never was, it is attended again or it is hidden). */
export class InactiveScopeNotFoundError extends NotFoundError {
  static readonly code = "INACTIVE_SCOPE_NOT_FOUND";

  constructor(type: string, id: string, context?: ErrorContext) {
    super(
      InactiveScopeNotFoundError.code,
      `No passive ${type.toLowerCase()} ${id}`,
      context
    );
  }
}
