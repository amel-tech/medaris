import { ConflictError, ErrorContext } from "@medaris/common";

/**
 * The person is barred from the medrese or one of its courses. A nazır cannot
 * be barred there (`RUNS_MADRASAH_ROLES`), so seating one would undo the ban.
 */
export class NazirBarredError extends ConflictError {
  static readonly code = "MADRASAH_NAZIR_BARRED";

  constructor(userId: string, madrasahId: string, context?: ErrorContext) {
    super(
      NazirBarredError.code,
      `User ${userId} is barred in medrese ${madrasahId}; they cannot be made its nazır`,
      context
    );
  }
}
