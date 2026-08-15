/**
 * Whether Swagger UI may be mounted at all.
 *
 * `SWAGGER_ENABLED=true` publishes the full API schema *and* installs the
 * middleware that removes `Content-Security-Policy` and
 * `cross-origin-opener-policy` from the Swagger pages. Both `.env.example`
 * files used to ship `SWAGGER_ENABLED=true`, so any deployment that copied a
 * template got both in production without deciding to.
 *
 * The flag is now refused in production unless the operator opts in
 * explicitly. It throws rather than quietly resolving to `false`, so that a
 * production deploy which still carries `SWAGGER_ENABLED=true` is told which
 * variable to change instead of silently losing its documentation endpoint —
 * the same fail-loud rule the rest of this config directory follows.
 */

/** Set this to `"true"` to keep Swagger UI in a production deployment. */
export const SWAGGER_PRODUCTION_OPT_IN = "SWAGGER_ALLOW_IN_PRODUCTION";

export function resolveSwaggerEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (env.SWAGGER_ENABLED !== "true") {
    return false;
  }

  if (
    env.NODE_ENV !== "production" ||
    env[SWAGGER_PRODUCTION_OPT_IN] === "true"
  ) {
    return true;
  }

  throw new Error(
    "@medaris/tedrisat refuses to start: SWAGGER_ENABLED=true with " +
      "NODE_ENV=production publishes the API schema and relaxes the security " +
      `headers on the Swagger pages. Set SWAGGER_ENABLED=false, or set ${SWAGGER_PRODUCTION_OPT_IN}=true ` +
      "to accept that deliberately. See apps/tedrisat/.env.example."
  );
}

/**
 * The origin Swagger UI's OAuth2 redirect URL is built on.
 *
 * `main.ts` concatenates this with the mounted endpoint. `KEYCLOAK_REDIRECT_URL`
 * is read straight from the environment — it is in no schema — so an absent
 * variable used to stringify into `undefined/docs/oauth2-redirect.html`: a
 * plausible-looking URL that boots fine and only fails when someone clicks
 * Authorize and Keycloak rejects the redirect URI. Same failure shape as the
 * defaults MDRS-35 removed, so it fails the same way instead.
 *
 * Only reached when Swagger is actually mounted; a service with
 * `SWAGGER_ENABLED=false` needs no redirect URL and is not asked for one.
 *
 * The trailing slash is dropped because the endpoint that follows carries its
 * own leading one.
 */
export function resolveSwaggerOauthRedirectOrigin(
  env: NodeJS.ProcessEnv = process.env
): string {
  const raw = env.KEYCLOAK_REDIRECT_URL;

  if (!raw) {
    throw new Error(
      "@medaris/tedrisat cannot mount Swagger UI: KEYCLOAK_REDIRECT_URL is " +
        "unset, and Swagger's oauth2RedirectUrl is built on it. Set it to the " +
        "service's public origin, or set SWAGGER_ENABLED=false. " +
        "See apps/tedrisat/.env.example."
    );
  }

  try {
    new URL(raw);
  } catch {
    throw new Error(
      `@medaris/tedrisat cannot mount Swagger UI: KEYCLOAK_REDIRECT_URL ("${raw}") ` +
        "is not an absolute URL, so Swagger's oauth2RedirectUrl would not " +
        "resolve. See apps/tedrisat/.env.example."
    );
  }

  return raw.replace(/\/+$/, "");
}
