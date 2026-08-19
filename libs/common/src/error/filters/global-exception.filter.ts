import { randomUUID } from "node:crypto";
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  LoggerService,
} from "@nestjs/common";
import { MedarisError } from "../errors/base/medaris.error";
import { RawBodyError } from "../errors/base/raw-body.error";
import { ErrorResponse } from "../types/error-response.type";

/**
 * The body returned for anything that is neither a MedarisError nor an
 * HttpException. Those two carry messages authored for clients; everything else
 * is an internal failure whose message may quote a pg constraint, a filesystem
 * path or a submitted value, so it never leaves the process (MDRS-29).
 */
const INTERNAL_ERROR_CODE = "INTERNAL_ERROR";
const INTERNAL_ERROR_MESSAGE = "Internal server error";

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: LoggerService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    let errorResponse: ErrorResponse;

    if (exception instanceof RawBodyError) {
      this.logger.error(`${exception.code}: ${exception.message}`);
      response.status(exception.status).json(exception.body);
      return;
    } else if (exception instanceof MedarisError) {
      errorResponse = {
        type: "APP_ERROR",
        code: exception.code,
        status: exception.status,
        message: exception.message,
        context: exception.context,
        timestamp: new Date().toISOString(),
      };
      this.logger.error(
        `${exception.code}: ${exception.message}`,
        exception.context
      );
    } else if (exception instanceof HttpException) {
      const httpResponse = exception.getResponse();
      const message =
        typeof httpResponse === "string"
          ? httpResponse
          : ((httpResponse as Record<string, unknown>).message as string);
      const status = exception.getStatus();
      errorResponse = {
        type: "HTTP_ERROR",
        code: `HTTP_${status}`,
        status,
        message,
        timestamp: new Date().toISOString(),
      };
      this.logger.error(`HTTP_ERROR-${status}: ${message}`);
    } else {
      // The correlation id is the only bridge between this opaque body and the
      // full error, which stays in the server log.
      const correlationId = randomUUID();
      errorResponse = {
        type: "UNKNOWN_ERROR",
        code: INTERNAL_ERROR_CODE,
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: INTERNAL_ERROR_MESSAGE,
        correlationId,
        timestamp: new Date().toISOString(),
      };
      this.logger.error(`UNEXPECTED_ERROR [${correlationId}]`, exception);
    }

    response.status(errorResponse.status).json(errorResponse);
  }
}
