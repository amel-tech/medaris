import { ConflictError, ErrorContext } from "@medaris/common";

export class KoskHandleTakenError extends ConflictError {
  static readonly code = "KOSK_HANDLE_TAKEN";

  constructor(handle: string, context?: ErrorContext) {
    super(
      KoskHandleTakenError.code,
      `A köşk with the short name ${handle} already exists`,
      context
    );
  }
}
