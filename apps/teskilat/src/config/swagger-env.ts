/**
 * Whether Swagger UI may be mounted at all (MDRS-69).
 *
 * teskilat and tedrisat read the SAME source for this flag. `.env.example`
 * ships it once as `API__SWAGGER_ENABLED`, and docker-compose.yml hands both
 * services `SWAGGER_ENABLED: ${<APP>__SWAGGER_ENABLED:-${API__SWAGGER_ENABLED:-false}}`.
 * So the documented way to get docs on tedrisat — set the group key, then set
 * `SWAGGER_ALLOW_IN_PRODUCTION=true` to satisfy MDRS-33's gate — used to
 * publish teskilat's full schema at the same time, through a service that had
 * no gate of its own. PR #44 changed the group default to `false`, which closed
 * the immediate hole; this is the part that does not depend on a default.
 *
 * The rule here is stricter than tedrisat's and deliberately has no opt-in:
 * under `NODE_ENV=production` teskilat never mounts Swagger, whatever
 * `SWAGGER_ENABLED` says. `apps/teskilat/Dockerfile` pins
 * `ENV NODE_ENV=production`, so that covers every environment running the
 * image.
 *
 * WHY THIS RETURNS FALSE INSTEAD OF THROWING, unlike tedrisat's
 * `resolveSwaggerEnabled`. tedrisat throws so that a deploy still carrying
 * `SWAGGER_ENABLED=true` is told which variable to change rather than quietly
 * losing its documentation endpoint — it has an endpoint worth losing, and an
 * opt-in that makes the throw actionable. teskilat has neither. Throwing here
 * would mean that enabling tedrisat's docs through the shared group key takes
 * teskilat down: the throw fires in the config factory, before `listen()`, so
 * the container restart-loops. That turns a documentation switch on one service
 * into an outage on another. Refusing to mount is the whole security
 * requirement; refusing to boot adds nothing to it and couples the two
 * services' availability to a shared key.
 *
 * The suppression is not silent — `swaggerSuppressedByProduction` below is what
 * `main.ts` logs a warning from, so an operator who set the flag and expected
 * docs finds out from the service log instead of from a 404.
 */

/**
 * `true` when the environment asked for Swagger and production is why it will
 * not get it. Distinguishes "suppressed" from "never asked for", so `main.ts`
 * warns only in the case an operator would want to know about.
 */
export function swaggerSuppressedByProduction(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return env.SWAGGER_ENABLED === "true" && env.NODE_ENV === "production";
}

/** The warning `main.ts` emits when the flag was set and production won. */
export const SWAGGER_PRODUCTION_SUPPRESSION_NOTICE =
  "@medaris/teskilat is ignoring SWAGGER_ENABLED=true: under " +
  "NODE_ENV=production this service never mounts Swagger UI, because " +
  "publishing the schema also relaxes CSP and COOP on those pages and " +
  "SWAGGER_ENABLED is a key teskilat shares with tedrisat " +
  "(API__SWAGGER_ENABLED in the repository-root .env.example). There is no " +
  "opt-in. Run a non-production NODE_ENV to read the schema locally.";

export function resolveSwaggerEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (env.SWAGGER_ENABLED !== "true") {
    return false;
  }

  return env.NODE_ENV !== "production";
}
