import { resolveSwaggerEnabled } from "@medaris/common";
import * as pkg from "../../package.json";
import { resolveMigrationsFolder } from "../database/migrations-folder";
import { readBunnyStreamConfig } from "./bunny-stream-env";
import { resolveDatabaseSsl } from "./database-ssl";
import { readKeycloakAdminConfig } from "./keycloak-admin-env";
import { readSecurityEnv } from "./security-env";
import { readSmtpConfig } from "./smtp-env";
import { readTedrisWebUrl } from "./tedris-web-url";
import { assertBulkThrottleEnv } from "./throttle-env";

const version = pkg.version || "0.0.1";

export default () => {
  const security = readSecurityEnv(process.env);
  // Read once, purely so a malformed THROTTLE_BULK_* stops the boot rather
  // than surfacing as a 500 on the first import (MDRS-31). The shared
  // THROTTLE_TTL/THROTTLE_LIMIT get the same eager-read treatment inside
  // RateLimitModule's own factory.
  assertBulkThrottleEnv(process.env);

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
      // Throws in production unless SWAGGER_ALLOW_IN_PRODUCTION=true (MDRS-33);
      // the policy is documented in libs/common's swagger-production.config.ts.
      enabled: resolveSwaggerEnabled(
        { policy: "throw-unless-opted-in", service: "@medaris/tedrisat" },
        process.env
      ),
      endpoint: process.env.SWAGGER_PATH || "/docs",
    },
    autoMigrations: {
      enabled: process.env.AUTO_MIGRATIONS_ENABLED === "true" || false,
      // Unset means the folder beside the running database module, which
      // exists both in a checkout and in the image (MDRS-219).
      migrationsFolder: resolveMigrationsFolder(
        process.env.AUTO_MIGRATIONS_FOLDER
      ),
    },
    tedrisWeb: {
      // Base of the session-page links in calendar entries (MDRS-117); null
      // when unset, and those routes answer 503.
      url: readTedrisWebUrl(process.env),
    },
    // The Bunny Stream library recordings are uploaded to (MDRS-116); null
    // when unset, and the upload routes answer 503.
    bunnyStream: readBunnyStreamConfig(process.env),
    // The SMTP server lesson invitations go out through (MDRS-121); null when
    // unset, and nothing is e-mailed.
    smtp: readSmtpConfig(process.env),
    keycloak: {
      jwksUrl: security.jwksUrl,
      issuer: security.issuer,
      audience: security.audience,
      allowedClients: security.allowedClients,
      cacheTtl: process.env.KEYCLOAK_CACHE_TTL || "86400",
      notFoundCacheTtl: process.env.KEYCLOAK_NOT_FOUND_CACHE_TTL || "120",
      // Service account that reads the realm's users (MDRS-169); null when
      // unset, and the routes that need it answer 503.
      admin: readKeycloakAdminConfig(process.env),
    },
  };
};
