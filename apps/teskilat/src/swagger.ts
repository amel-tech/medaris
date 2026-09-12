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
  swaggerEnabledUnlessProduction,
  swaggerSuppressedByProduction,
} from "./config/swagger-env";

/**
 * Mounts Swagger UI if — and only if — **both** the live environment and the
 * configuration allow it.
 *
 * Two independent layers, because one of them is not enough:
 *
 *   1. `swaggerEnabledUnlessProduction(env)` reads the environment as it is **now**.
 *   2. `config.get("swagger.enabled")` is the value the config factory resolved
 *      when the module was compiled.
 *
 * Layer 2 alone was the bug this signature used to have. A `ConfigService`
 * whose factory ran before `NODE_ENV=production` was set carries
 * `swagger.enabled: true`, so the old body logged
 * `SWAGGER_PRODUCTION_SUPPRESSION_NOTICE` — "this service never mounts Swagger
 * UI" — and then mounted it on the next line. In a real container the factory
 * runs after the image's `ENV NODE_ENV=production`, so the guard held in
 * practice; the docstring's claim that no argument could mount the UI in
 * production was nevertheless false of this function. It is true now: layer 1
 * refuses regardless of what the caller hands in.
 *
 * @param env the environment to judge; defaults to `process.env`. Passed
 *   explicitly so both halves of the decision read the same snapshot.
 * @returns whether the UI was mounted, so a caller can log or assert on it.
 */
export function mountSwagger(
  app: INestApplication,
  config: ConfigService,
  logger?: Pick<ILogger, "warn">,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (swaggerSuppressedByProduction(env)) {
    // Not silent: an operator who set the flag and expected docs learns it
    // from the service log rather than from a 404 on /docs.
    if (logger) {
      logger.warn(SWAGGER_PRODUCTION_SUPPRESSION_NOTICE);
    } else {
      console.warn(SWAGGER_PRODUCTION_SUPPRESSION_NOTICE);
    }
  }

  if (
    !swaggerEnabledUnlessProduction(env) ||
    !config.get<boolean>("swagger.enabled")
  ) {
    return false;
  }

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Teskilat Service API")
    .setDescription("Organisation management service for the Medaris platform")
    .setVersion("1.0.0")
    .addTag("teskilat", "Organisation management endpoints")
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  // `getOrThrow`, not `get(...) || "/swagger"`: config/config.ts always
  // supplies this key and already defaults it to `/docs`, so the old fallback
  // was unreachable *and* named a different path than the documented default.
  const swaggerEndpoint = config.getOrThrow<string>("swagger.endpoint");
  SwaggerModule.setup(swaggerEndpoint, app, document);

  return true;
}
