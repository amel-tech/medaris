/**
 * Whether a service may mount Swagger UI — the one production decision both
 * APIs share (MDRS-85).
 *
 * `SWAGGER_ENABLED=true` publishes the full API schema and, in tedrisat, also
 * relaxes `Content-Security-Policy` and `cross-origin-opener-policy` on the
 * Swagger pages. Every API reads the flag from the SAME source: `.env.example`
 * ships it once as `API__SWAGGER_ENABLED`, and docker-compose.yml hands each
 * service `SWAGGER_ENABLED: ${<APP>__SWAGGER_ENABLED:-${API__SWAGGER_ENABLED:-false}}`.
 *
 * The services used to carry two implementations of this rule in
 * `apps/<api>/src/config/swagger-env.ts`, with opposite production behaviour
 * and — until MDRS-69 renamed one — the same function name at the same path.
 * A third service, or a config factory copied between apps, picked up
 * whichever one it happened to import. The rule now lives once, and the
 * behaviour is a parameter each caller has to name.
 *
 * ## The two policies
 *
 * **`throw-unless-opted-in`** (tedrisat, MDRS-33). Under
 * `NODE_ENV=production` the flag is refused unless `SWAGGER_ALLOW_IN_PRODUCTION`
 * is `"true"`, and the refusal *throws*. A production deploy still carrying
 * `SWAGGER_ENABLED=true` is told which variable to change instead of silently
 * losing a documentation endpoint it may rely on. That only makes sense for a
 * service that has an opt-in to point at.
 *
 * **`refuse-in-production`** (teskilat, MDRS-69). Under `NODE_ENV=production`
 * the flag is ignored, with no opt-in, and nothing throws. Throwing would turn
 * the shared group key into an outage: setting `API__SWAGGER_ENABLED=true` to
 * get tedrisat's docs would restart-loop this service, because the throw fires
 * in the config factory before `listen()`. Refusing to mount is the whole
 * security requirement; refusing to boot adds nothing and couples the
 * services' availability. The refusal is still not silent —
 * `swaggerSuppressedByProduction` is what the caller logs
 * `swaggerProductionSuppressionNotice` from.
 *
 * Both policies key on the exact value `NODE_ENV === "production"`, matching
 * `cors.config.ts` and the `ENV NODE_ENV=production` the API Dockerfiles pin.
 * Both treat any `SWAGGER_ENABLED` other than the string `"true"` as off.
 */

/** Set this to `"true"` to keep Swagger UI under a `throw-unless-opted-in` policy in production. */
export const SWAGGER_PRODUCTION_OPT_IN = "SWAGGER_ALLOW_IN_PRODUCTION";

export type SwaggerProductionPolicy =
  | "throw-unless-opted-in"
  | "refuse-in-production";

export interface SwaggerProductionRule {
  policy: SwaggerProductionPolicy;
  /** The package name used in messages, e.g. `@medaris/tedrisat`. */
  service: string;
}

function isProduction(env: NodeJS.ProcessEnv): boolean {
  return env.NODE_ENV === "production";
}

function isRequested(env: NodeJS.ProcessEnv): boolean {
  return env.SWAGGER_ENABLED === "true";
}

/**
 * Resolves whether Swagger UI may be mounted, applying `rule.policy` in
 * production.
 *
 * @throws under `throw-unless-opted-in`, in production, when the flag is set
 *   and `SWAGGER_ALLOW_IN_PRODUCTION` is not `"true"`.
 */
export function resolveSwaggerEnabled(
  rule: SwaggerProductionRule,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (!isRequested(env)) {
    return false;
  }

  if (!isProduction(env)) {
    return true;
  }

  switch (rule.policy) {
    case "refuse-in-production":
      return false;
    case "throw-unless-opted-in":
      if (env[SWAGGER_PRODUCTION_OPT_IN] === "true") {
        return true;
      }
      throw new Error(
        `${rule.service} refuses to start: SWAGGER_ENABLED=true with ` +
          "NODE_ENV=production publishes the API schema and relaxes the security " +
          `headers on the Swagger pages. Set SWAGGER_ENABLED=false, or set ${SWAGGER_PRODUCTION_OPT_IN}=true ` +
          "to accept that deliberately. Both live in the repository-root .env.example " +
          `as API__SWAGGER_ENABLED and API__${SWAGGER_PRODUCTION_OPT_IN}.`
      );
  }
}

/**
 * `true` when the environment asked for Swagger and a `refuse-in-production`
 * policy is why it will not get it. Distinguishes "suppressed" from "never
 * asked for", so a caller warns only in the case an operator would want to
 * know about. Always `false` under `throw-unless-opted-in`, which either
 * allows the flag or throws — it never suppresses quietly.
 */
export function swaggerSuppressedByProduction(
  rule: SwaggerProductionRule,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return (
    rule.policy === "refuse-in-production" &&
    isRequested(env) &&
    isProduction(env)
  );
}

/** The warning to log when `swaggerSuppressedByProduction` is `true`. */
export function swaggerProductionSuppressionNotice(
  rule: SwaggerProductionRule
): string {
  return (
    `${rule.service} is ignoring SWAGGER_ENABLED=true: under ` +
    "NODE_ENV=production this service never mounts Swagger UI, because that " +
    "would publish its full API schema, and SWAGGER_ENABLED is a key the APIs " +
    "share (API__SWAGGER_ENABLED in the repository-root .env.example). There " +
    "is no opt-in. Run a non-production NODE_ENV to read the schema locally."
  );
}
