// packages/shared/src/bootstrap/setup-middleware.ts

import type { INestApplication, LoggerService } from "@nestjs/common";
import compression from "compression";
import helmet from "helmet";
import { corsConfig } from "../config";
import { GlobalExceptionFilter } from "../error/filters/global-exception.filter";
import { MedarisValidationPipe } from "../pipes";

export function applyGlobalMiddleware(
  app: INestApplication,
  logger: LoggerService
) {
  // Enable CORS
  app.enableCors(corsConfig);

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
