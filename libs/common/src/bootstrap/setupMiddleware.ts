// packages/shared/src/bootstrap/setup-middleware.ts

import { INestApplication, LoggerService } from "@nestjs/common";
import compression from "compression";
import helmet from "helmet";
import { buildCorsConfig, resolveTrustProxyHops } from "../config";
import { GlobalExceptionFilter } from "../error/filters/global-exception.filter";
import { MedarisValidationPipe } from "../pipes";

export function applyGlobalMiddleware(
  app: INestApplication,
  logger: LoggerService
) {
  // MDRS-31: makes req.ip (what ThrottlerGuard's default tracker keys on)
  // the real client address instead of the reverse-proxy's, in whatever
  // deployment sits in front. See trust-proxy.config.ts for why this
  // defaults to 0 rather than to a nonzero hop count or `true`.
  app
    .getHttpAdapter()
    .getInstance()
    .set("trust proxy", resolveTrustProxyHops());

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
