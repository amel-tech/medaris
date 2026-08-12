import { MedarisError } from "@medaris/common";
import { HttpStatus } from "@nestjs/common";
import type { RowError } from "../dto/flashcard-bulk-response.dto";

export class BulkValidationError extends MedarisError {
  static readonly code = "BULK_VALIDATION_ERROR";

  constructor(errors: RowError[]) {
    super(
      BulkValidationError.code,
      HttpStatus.UNPROCESSABLE_ENTITY,
      "Validation Error",
      {
        errors,
      }
    );
  }
}
