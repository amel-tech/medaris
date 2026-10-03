import { ErrorContext } from "../../types";
import { MedarisError } from "./medaris.error";

export class InternalServerError extends MedarisError {
  protected constructor(
    code: string = "INTERNAL_SERVER_ERROR",
    message?: string,
    context?: ErrorContext,
    options?: ErrorOptions
  ) {
    super(code, 500, message, context, options);
  }
}
