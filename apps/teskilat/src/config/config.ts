import * as pkg from "../../package.json";
import { swaggerEnabledUnlessProduction } from "./swagger-env";

const version = pkg.version || "0.0.1";

/**
 * MDRS-69 removed the `database` block this factory used to carry.
 *
 * teskilat opens no database connection. Measured on this tree: `apps/teskilat`
 * declares no database client (no `pg`, no `drizzle-orm`, no ORM of any kind in
 * its package.json), `apps/teskilat/src` holds no DatabaseModule, no
 * drizzle.config.ts and no migrations directory, and `AppModule` imports
 * exactly `ConfigModule` and `LoggerModule`. The only reader of this factory is
 * `main.ts`, which asks for `swagger.enabled`, `swagger.endpoint` and `port` —
 * nothing ever read `database.*`.
 *
 * The `password: process.env.DB_PASSWORD || "password"` line it removed is the
 * half of MDRS-35 that was done for tedrisat and not here: a literal credential
 * default that let the service resolve a connection string against the wrong
 * password instead of failing. Unreachable under docker-compose, which requires
 * the key with `:?`, but reachable under `pnpm dev`. Removing the block removes
 * the fallback with it; there is no `requireDbPassword` equivalent to add,
 * because there is no connection to guard.
 *
 * The `redis` block below is the same shape of dead configuration, but it is
 * NOT teskilat's alone — `apps/tedrisat/src/config/config.ts:24` carries an
 * identical one and neither app depends on a Redis client. Removing it from one
 * side would create exactly the asymmetry this task exists to close, so it is
 * recorded as a follow-up in docs/migration/mdrs-69-teskilat-config-hygiene.md
 * instead of being half-fixed here.
 */
export default () => ({
  serviceName: process.env.SERVICE_NAME || pkg.name,
  version,
  environment: process.env.NODE_ENV || "development",
  port: process.env.PORT || 3002,
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || "",
  },
  logger: {
    level: process.env.LOG_LEVEL || "info",
    format: process.env.LOG_FORMAT || "json",
  },
  otel: {
    enabled: process.env.OTEL_ENABLED === "true" || false,
    otelEndpoint:
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4317",
    serviceName: process.env.SERVICE_NAME || pkg.name,
    serviceVersion: version,
  },
  swagger: {
    // Never true under NODE_ENV=production, whatever SWAGGER_ENABLED says —
    // see ./swagger-env.ts for why this refuses rather than throwing.
    enabled: swaggerEnabledUnlessProduction(),
    endpoint: process.env.SWAGGER_ENDPOINT || "/docs",
  },
});
