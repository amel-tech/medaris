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

/**
 * Response headers a cross-origin caller is allowed to read.
 *
 * Only the CORS-safelisted response headers are readable by default, and
 * `Content-Disposition` is not among them. ExcelService returns
 * `attachment; filename=…` on the flashcard template and export endpoints
 * (libs/common/src/excel/excel.service.ts:71,130), so without this a browser
 * `fetch` would download the bytes and not be able to read the file name.
 */
const EXPOSED_HEADERS = ["Content-Disposition"];

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
 * Whether this process may fall back to serving every origin.
 *
 * Deliberately an allowlist of two, not `NODE_ENV !== "production"`. The
 * sibling check in apps/tedrisat/src/config/security-env.ts refuses to trust
 * `NODE_ENV` for exactly this reason: a staging container, or a CI job reusing
 * a compose file, carries whatever value the deployment happened to set. Under
 * a `!== "production"` test such a deployment would silently be handed
 * `origin: "*"` — the open door this task exists to close — and would boot
 * green. Anything that is not a developer's machine or a Jest worker has to
 * name its origins.
 */
function allowsWildcard(env: NodeJS.ProcessEnv): boolean {
  if (env.NODE_ENV === "development") {
    return true;
  }

  // `JEST_WORKER_ID` is set in every worker and by nothing else, which is what
  // makes this narrower than `NODE_ENV === "test"` on its own.
  return env.NODE_ENV === "test" && env.JEST_WORKER_ID !== undefined;
}

function parseOrigin(candidate: string): URL {
  try {
    return new URL(candidate);
  } catch {
    fail(
      `"${candidate}" is not an absolute URL — an origin needs a scheme, as in https://tedris.medaris.app`
    );
  }
}

/**
 * Reject anything that is not a bare scheme+host+port.
 *
 * The `cors` package compares each list entry to the request `Origin` header
 * verbatim, and a browser never sends a path, a trailing slash or a wildcard
 * host in that header. A value like `https://tedris.medaris.app/` therefore
 * matches nothing and the response carries no `Access-Control-Allow-Origin` —
 * the exact symptom this task measured and removed, but silent. Refusing the
 * value at boot is what keeps it from coming back.
 */
function assertBareOrigin(candidate: string): void {
  const parsed = parseOrigin(candidate);

  // `new URL` accepts `*` in a hostname and reports it back unchanged, so the
  // identity check below would let `https://*.medaris.app` through. No browser
  // ever sends such an Origin, and the cors package does not expand patterns.
  if (parsed.hostname.includes(WILDCARD)) {
    fail(
      `"${candidate}" uses a wildcard host, which the cors package does not expand — list each origin in full`
    );
  }

  if (parsed.origin !== candidate) {
    // `origin` is the string "null" for schemes that have no notion of one,
    // and suggesting the caller write "null" would be nonsense.
    const suggestion =
      parsed.origin === "null" ? "" : `; write "${parsed.origin}" instead`;

    fail(
      `"${candidate}" is not a bare origin; the cors package compares entries to the request Origin verbatim, and a browser never sends a path, a trailing slash or a wildcard host.${suggestion}`
    );
  }
}

/**
 * Resolve `ALLOWED_ORIGINS` into a value `cors` actually understands.
 *
 * On a developer's machine and under Jest an unset or wildcard list yields the
 * bare string `"*"`. Everywhere else both are refused: a deployment that
 * forgets the variable used to boot with `["*"]` and answer every browser call
 * without an `Access-Control-Allow-Origin` header, which looks like a CORS
 * misconfiguration at the edge rather than a missing environment variable.
 *
 * Entries that are kept are validated in every environment — a malformed
 * origin fails as silently in development as it does in production.
 */
export function resolveAllowedOrigins(
  env: NodeJS.ProcessEnv = process.env
): string | string[] {
  const origins = parseCsv(env.ALLOWED_ORIGINS);
  const permissive = allowsWildcard(env);
  const nodeEnv = env.NODE_ENV ? `"${env.NODE_ENV}"` : "unset";

  if (origins.length === 0) {
    if (permissive) {
      return WILDCARD;
    }

    fail(`it is unset or empty and NODE_ENV is ${nodeEnv}`);
  }

  if (origins.includes(WILDCARD)) {
    if (permissive) {
      return WILDCARD;
    }

    fail(`it contains "${WILDCARD}" and NODE_ENV is ${nodeEnv}`);
  }

  for (const origin of origins) {
    assertBareOrigin(origin);
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
    exposedHeaders: EXPOSED_HEADERS,
    credentials: false,
  };
}
