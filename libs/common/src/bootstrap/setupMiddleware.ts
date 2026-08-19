// packages/shared/src/bootstrap/setup-middleware.ts

import { INestApplication, LoggerService } from "@nestjs/common";
import compression from "compression";
import helmet from "helmet";
import { buildCorsConfig } from "../config";
import { GlobalExceptionFilter } from "../error/filters/global-exception.filter";
import { MedarisValidationPipe } from "../pipes";

export function applyGlobalMiddleware(
  app: INestApplication,
  logger: LoggerService
) {
  // Enable CORS. Built here rather than at import time so the value reflects
  // the environment ConfigModule has already loaded, and so a production
  // deployment without ALLOWED_ORIGINS fails at boot instead of silently
  // serving no Access-Control-Allow-Origin header.
  app.enableCors(buildCorsConfig());

  // Security Middlewares
  app.use(helmet());

  // Compression
  app.use(compression());

  // Enable shutdown hooks
  app.enableShutdownHooks();

  // Global Validation Pipe
  app.useGlobalPipes(new MedarisValidationPipe());

  // Global Exception Filter
  app.useGlobalFilters(new GlobalExceptionFilter(logger));
}
