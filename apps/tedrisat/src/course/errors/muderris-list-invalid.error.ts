import { BadRequestError, ErrorContext } from "@medaris/common";

/**
 * A müderris list that cannot be saved (MDRS-176): empty, or its imam is not
 * one of the listed accounts. A course always has at least one müderris, and
 * its imam is one of them.
 */
export class MuderrisListInvalidError extends BadRequestError {
  static readonly code = "MUDERRIS_LIST_INVALID";

  constructor(reason: string, context?: ErrorContext) {
    super(MuderrisListInvalidError.code, reason, context);
  }
}
