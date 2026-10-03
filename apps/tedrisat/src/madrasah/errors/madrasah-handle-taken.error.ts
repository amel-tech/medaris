import { ConflictError, ErrorContext } from "@medaris/common";

export class MadrasahHandleTakenError extends ConflictError {
  static readonly code = "MADRASAH_HANDLE_TAKEN";

  constructor(handle: string, context?: ErrorContext) {
    super(
      MadrasahHandleTakenError.code,
      `A medrese with handle ${handle} already exists`,
      context
    );
  }
}
