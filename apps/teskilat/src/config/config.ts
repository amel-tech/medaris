import {
  resolveSwaggerEnabled,
  type SwaggerProductionRule,
} from "@medaris/common";
import * as pkg from "../../package.json";

const version = pkg.version || "0.0.1";

/**
 * teskilat's production rule for `SWAGGER_ENABLED`: refuse, never throw
 * (MDRS-69). Declared once and imported by `src/swagger.ts` and the unit spec,
 * because `mountSwagger` evaluates the same rule a second time at mount and the
 * two evaluations must not be able to drift apart.
 */
export const SWAGGER_RULE: SwaggerProductionRule = {
  policy: "refuse-in-production",
  service: "@medaris/teskilat",
};

/**
 * MDRS-69 removed the `database` block this factory used to carry.
 *
 * teskilat opens no database connection. Measured on this tree: `apps/teskilat`
 * declares no database client (no `pg`, no `drizzle-orm`, no ORM of any kind in
 * its package.json), `apps/teskilat/src` holds no DatabaseModule, no
 * drizzle.config.ts and no migrations directory, and `AppModule` imports
 * exactly `ConfigModule`, `LoggerModule` and `RateLimitModule` — none of which
 * opens a connection. The readers of this factory are `main.ts` (`port`) and
 * `swagger.ts` (`swagger.enabled`, `swagger.endpoint`); `RateLimitModule` reads
 * `THROTTLE_TTL` / `THROTTLE_LIMIT` straight from `process.env` through
 * `buildThrottlerOptions`, not through here — so those two compose keys are
 * live, boot-affecting configuration, not dead ones. Nothing ever read
 * `database.*`.
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
    // Never true under NODE_ENV=production, whatever SWAGGER_ENABLED says, and
    // never throws: the key is shared with tedrisat, so a throw here would take
    // this service down when tedrisat's docs are enabled (MDRS-69). The policy
    // is documented in libs/common's swagger-production.config.ts.
    enabled: resolveSwaggerEnabled(SWAGGER_RULE),
    // SWAGGER_PATH, the same name tedrisat reads and the one the root
    // .env.example ships as API__SWAGGER_PATH. It used to be SWAGGER_ENDPOINT,
    // which no .env key produced, so under `nx run teskilat:dev` the path was
    // always the fallback (MDRS-69 review).
    endpoint: process.env.SWAGGER_PATH || "/docs",
  },
});
