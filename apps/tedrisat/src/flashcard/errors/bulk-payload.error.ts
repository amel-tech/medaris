import { BadRequestError, ErrorContext } from "@medaris/common";

/**
 * The bulk endpoints accept a list of cards. A body that is not a list, or an
 * empty one, is a malformed request rather than a row-level validation
 * failure — it never reaches the per-row `RowError` channel.
 */
export class BulkPayloadError extends BadRequestError {
  static readonly code = "BULK_PAYLOAD_INVALID";

  constructor(
    message = "Bulk requests must carry a non-empty array of cards",
    context?: ErrorContext
  ) {
    super(BulkPayloadError.code, message, context);
  }
}
