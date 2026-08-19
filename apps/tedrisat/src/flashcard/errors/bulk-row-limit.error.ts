import { MedarisError } from "@medaris/common";
import { HttpStatus } from "@nestjs/common";
import { RowError } from "../dto/flashcard-bulk-response.dto";

/**
 * Carries the same `{ errors: RowError[] }` context as `BulkValidationError`
 * so a client that already renders bulk failures — `ImportErrorsDialog` in
 * nizam — shows this one without a second code path. The row reported is the
 * first one past the cap, in the file's own numbering (1-based + header row).
 */
export class BulkRowLimitExceededError extends MedarisError {
  static readonly code = "BULK_ROW_LIMIT_EXCEEDED";

  constructor(received: number, limit: number) {
    const message = `A bulk request may contain at most ${limit} cards; received ${received}`;
    const errors: RowError[] = [
      {
        row: limit + 2,
        errors: [{ field: "cards", message }],
      },
    ];

    super(
      BulkRowLimitExceededError.code,
      HttpStatus.UNPROCESSABLE_ENTITY,
      message,
      { errors }
    );
  }
}
