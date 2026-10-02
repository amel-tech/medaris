import { ErrorContext, NotFoundError } from "@medaris/common";

export class MadrasahNotFoundError extends NotFoundError {
  static readonly code = "MADRASAH_NOT_FOUND";

  constructor(madrasahId: string, context?: ErrorContext) {
    super(
      MadrasahNotFoundError.code,
      `Medrese with id ${madrasahId} not found`,
      context
    );
  }
}
