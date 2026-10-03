import { ErrorContext } from "../../types";

/**
 * An error authored for clients: `code`, `message` and `context` are sent as
 * the response body. `options.cause` is not; the exception filter logs it with
 * a correlation id on a 5xx, so a wrapped failure stays server-side (MDRS-220).
 */
export abstract class MedarisError extends Error {
  public readonly code: string;
  public readonly context?: ErrorContext;
  protected _status: number;

  protected constructor(
    code: string,
    status: number,
    message?: string,
    context?: ErrorContext,
    options?: ErrorOptions
  ) {
    super(message || code, options);
    this.code = code;
    this._status = status;
    this.context = context;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  get status(): number {
    return this._status;
  }
}
