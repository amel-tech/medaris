import { z } from "zod";
import * as pkg from "../../package.json";
import { resolveDatabaseSsl } from "./database-ssl";

const version = pkg.version || "0.0.1";

/**
 * Variables that must not fall back to a built-in default.
 *
 * `KEYCLOAK_JWKS_URL` previously defaulted to `"test-url"`, which bypassed the
 * validation in KeycloakPublicKeyProvider.loadConfig: a deployment without a
 * JWKS URL booted, swallowed the fetch error in onModuleInit and then answered
 * 401 to every request. `DB_PASSWORD` previously defaulted to `"tedrisat"` —
 * the credential created in docker/init-db.sql — so a deployment that forgot
 * the variable silently tried a well-known password.
 *
 * NODE_ENV=test is exempt: apps/tedrisat/test/helpers/test-app.helper.ts sets
 * both variables before AppModule is imported, and the unit suites never boot
 * the Nest container.
 */
const requiredSecurityEnv = z.object({
  KEYCLOAK_JWKS_URL: z.string().url(),
  DB_PASSWORD: z.string().min(1),
});

function readSecurityEnv(env: NodeJS.ProcessEnv) {
  if (env.NODE_ENV === "test") {
    return {
      jwksUrl: env.KEYCLOAK_JWKS_URL || "test-url",
      dbPassword: env.DB_PASSWORD || "tedrisat",
    };
  }

  const parsed = requiredSecurityEnv.safeParse(env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")} — ${issue.message}`)
      .join("; ");

    throw new Error(
      `@medaris/tedrisat cannot start, the environment is incomplete: ${details}. ` +
        "See apps/tedrisat/.env.example."
    );
  }

  return {
    jwksUrl: parsed.data.KEYCLOAK_JWKS_URL,
    dbPassword: parsed.data.DB_PASSWORD,
  };
}

export default () => {
  const security = readSecurityEnv(process.env);

  return {
    serviceName: process.env.SERVICE_NAME || pkg.name,
    version,
    environment: process.env.NODE_ENV || "development",
    port: process.env.PORT || 3001,
    database: {
      host: process.env.DB_HOST || "localhost",
      port: process.env.DB_PORT || 5432,
      username: process.env.DB_USERNAME || "tedrisat",
      password: security.dbPassword,
      database: process.env.DB_NAME || "tedrisat_db",
      ssl: resolveDatabaseSsl(),
    },
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
      enabled: process.env.SWAGGER_ENABLED === "true",
      endpoint: process.env.SWAGGER_PATH || "/docs",
    },
    autoMigrations: {
      enabled: process.env.AUTO_MIGRATIONS_ENABLED === "true" || false,
      migrationsFolder:
        process.env.AUTO_MIGRATIONS_FOLDER || "./src/database/migrations",
    },
    keycloak: {
      jwksUrl: security.jwksUrl,
      cacheTtl: process.env.KEYCLOAK_CACHE_TTL || "86400",
      notFoundCacheTtl: process.env.KEYCLOAK_NOT_FOUND_CACHE_TTL || "120",
    },
  };
};
