import { ErrorContext, NotFoundError } from "@medaris/common";

/** The user being removed is not a nazır of this medrese. */
export class NazirNotFoundError extends NotFoundError {
  static readonly code = "MADRASAH_NAZIR_NOT_FOUND";

  constructor(madrasahId: string, userId: string, context?: ErrorContext) {
    super(
      NazirNotFoundError.code,
      `User ${userId} is not a nazır of medrese ${madrasahId}`,
      context
    );
  }
}
