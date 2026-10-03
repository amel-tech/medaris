import { ConflictError, ErrorContext } from "@medaris/common";

export class MadrasahAlreadyHiddenError extends ConflictError {
  static readonly code = "MADRASAH_ALREADY_HIDDEN";

  constructor(madrasahId: string, context?: ErrorContext) {
    super(
      MadrasahAlreadyHiddenError.code,
      `Medrese ${madrasahId} is already hidden`,
      context
    );
  }
}
