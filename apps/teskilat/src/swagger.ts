/**
 * Mounting Swagger UI, extracted from `main.ts` so the production refusal is
 * testable as behaviour rather than only as a resolved boolean (MDRS-69).
 *
 * `main.ts` self-invokes `bootstrap()` on import and calls `app.listen`, so a
 * test cannot import it to find out whether `/docs` is served. Everything the
 * mount decision touches lives here instead, and
 * `test/e2e/swagger.e2e.spec.ts` drives this function against a real Nest
 * application and asserts the HTTP status of the documentation path.
 */
import { ILogger } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import {
  SWAGGER_PRODUCTION_SUPPRESSION_NOTICE,
  swaggerSuppressedByProduction,
} from "./config/swagger-env";

/**
 * Mounts Swagger UI if — and only if — the configuration says it may be.
 *
 * The flag comes from `config/config.ts`, which resolves it through
 * `resolveSwaggerEnabled`; under `NODE_ENV=production` that is `false`
 * unconditionally, so no argument to this function can mount the UI there.
 *
 * @returns whether the UI was mounted, so a caller can log or assert on it.
 */
export function mountSwagger(
  app: INestApplication,
  config: ConfigService,
  logger?: Pick<ILogger, "warn">
): boolean {
  if (swaggerSuppressedByProduction()) {
    // Not silent: an operator who set the flag and expected docs learns it
    // from the service log rather than from a 404 on /docs.
    if (logger) {
      logger.warn(SWAGGER_PRODUCTION_SUPPRESSION_NOTICE);
    } else {
      console.warn(SWAGGER_PRODUCTION_SUPPRESSION_NOTICE);
    }
  }

  if (!config.get<boolean>("swagger.enabled")) {
    return false;
  }

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Teskilat Service API")
    .setDescription("Organisation management service for the Medaris platform")
    .setVersion("1.0.0")
    .addTag("teskilat", "Organisation management endpoints")
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  const swaggerEndpoint = config.get<string>("swagger.endpoint") || "/swagger";
  SwaggerModule.setup(swaggerEndpoint, app, document);

  return true;
}
