import { BadRequestError, ErrorContext } from "@medaris/common";

/** The same account appears twice in one course's müderris list (MDRS-105). */
export class MuderrisDuplicateUserError extends BadRequestError {
  static readonly code = "MUDERRIS_DUPLICATE_USER";

  constructor(userId: string, context?: ErrorContext) {
    super(
      MuderrisDuplicateUserError.code,
      `User ${userId} is listed more than once as müderris`,
      context
    );
  }
}
