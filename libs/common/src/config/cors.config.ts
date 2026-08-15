import type { CorsOptions } from "@nestjs/common/interfaces/external/cors-options.interface";

/**
 * The wildcard, as the `cors` package understands it.
 *
 * It must be handed over as a bare string. Inside an array — which is what
 * `"*".split(",")` produced before this task — the `cors` package compares it
 * to the request `Origin` as an exact string, no origin ever equals `"*"`, so
 * the response carried no `Access-Control-Allow-Origin` header at all.
 * Measured against a booted tedrisat, see docs/migration/mdrs-34-cors-origin-validation.md.
 */
const WILDCARD = "*";

/**
 * Methods allowed when `ALLOWED_METHODS` is unset.
 *
 * `OPTIONS` is part of the list because a preflight advertises the methods it
 * would permit, and a client that inspects `Access-Control-Allow-Methods`
 * should see the verb it just used to ask.
 */
const DEFAULT_METHODS = "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS";

/**
 * Headers a browser may send on a cross-origin request.
 *
 * The clients authenticate with a Bearer header (libs/services/src/tedrisat/api-factory.ts),
 * so `Authorization` and `Content-Type` are the whole surface; anything else
 * has to be added deliberately.
 */
const ALLOWED_HEADERS = ["Authorization", "Content-Type"];

/** Split a comma-separated variable, trimming entries and dropping empties. */
export function parseCsv(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }

  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function fail(message: string): never {
  throw new Error(
    `ALLOWED_ORIGINS is not usable: ${message}. ` +
      "Set it to a comma-separated list of absolute origins, " +
      "for example ALLOWED_ORIGINS=https://tedris.medaris.app,https://nizam.medaris.app. " +
      "See apps/tedrisat/.env.example."
  );
}

/**
 * Resolve `ALLOWED_ORIGINS` into a value `cors` actually understands.
 *
 * Outside production an unset or wildcard list yields the bare string `"*"`,
 * which is what a developer running the web apps on localhost wants. In
 * production both are refused: a deployment that forgets the variable used to
 * boot with `["*"]` and answer every browser call without an
 * `Access-Control-Allow-Origin` header, which looks like a CORS misconfiguration
 * at the edge rather than a missing environment variable.
 */
export function resolveAllowedOrigins(
  env: NodeJS.ProcessEnv = process.env
): string | string[] {
  const origins = parseCsv(env.ALLOWED_ORIGINS);
  const isProduction = env.NODE_ENV === "production";
  const hasWildcard = origins.includes(WILDCARD);

  if (isProduction) {
    if (origins.length === 0) {
      fail("it is unset or empty and NODE_ENV is production");
    }

    if (hasWildcard) {
      fail(`it contains "${WILDCARD}" and NODE_ENV is production`);
    }

    return origins;
  }

  if (origins.length === 0 || hasWildcard) {
    return WILDCARD;
  }

  return origins;
}

/** Resolve `ALLOWED_METHODS`, always leaving `OPTIONS` in the list. */
export function resolveAllowedMethods(
  env: NodeJS.ProcessEnv = process.env
): string[] {
  // A list of nothing but separators is as good as unset; falling through with
  // it would leave `methods` holding only OPTIONS, and every real request
  // would be refused.
  const configured = parseCsv(env.ALLOWED_METHODS);
  const source = configured.length > 0 ? configured : parseCsv(DEFAULT_METHODS);
  const methods = [...new Set(source.map((method) => method.toUpperCase()))];

  if (!methods.includes("OPTIONS")) {
    methods.push("OPTIONS");
  }

  return methods;
}

/**
 * Build the options handed to `app.enableCors`.
 *
 * This is a function rather than the module-level constant it replaced: the
 * constant was evaluated the moment `@medaris/common` was imported, which is
 * before `ConfigModule` runs dotenv, so `ALLOWED_ORIGINS` in an `.env` file
 * never reached it — only a variable already exported into the process did.
 * Called from applyGlobalMiddleware, it now reads the environment after the
 * Nest container has been created.
 */
export function buildCorsConfig(
  env: NodeJS.ProcessEnv = process.env
): CorsOptions {
  return {
    origin: resolveAllowedOrigins(env),
    methods: resolveAllowedMethods(env),
    allowedHeaders: ALLOWED_HEADERS,
    credentials: false,
  };
}
