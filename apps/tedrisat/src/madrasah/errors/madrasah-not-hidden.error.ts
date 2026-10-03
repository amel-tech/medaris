import { ConflictError, ErrorContext } from "@medaris/common";

export class MadrasahNotHiddenError extends ConflictError {
  static readonly code = "MADRASAH_NOT_HIDDEN";

  constructor(madrasahId: string, context?: ErrorContext) {
    super(
      MadrasahNotHiddenError.code,
      `Medrese ${madrasahId} is not hidden`,
      context
    );
  }
}
