import { BadRequestError, ErrorContext } from "@medaris/common";

export class InvalidScheduleWindowError extends BadRequestError {
  static readonly code = "INVALID_SCHEDULE_WINDOW";

  constructor(message: string, context?: ErrorContext) {
    super(InvalidScheduleWindowError.code, message, context);
  }
}
