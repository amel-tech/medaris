import { ConflictError, ErrorContext } from "@medaris/common";

export class KunyeTakenError extends ConflictError {
  static readonly code = "KUNYE_TAKEN";

  constructor(
    message = "That künye belongs to someone else",
    context?: ErrorContext
  ) {
    super(KunyeTakenError.code, message, context);
  }
}
