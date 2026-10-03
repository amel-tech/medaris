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
        "See the repository-root .env.example, as API__KEYCLOAK_REDIRECT_URL."
    );
  }

  try {
    new URL(raw);
  } catch {
    throw new Error(
      `@medaris/tedrisat cannot mount Swagger UI: KEYCLOAK_REDIRECT_URL ("${raw}") ` +
        "is not an absolute URL, so Swagger's oauth2RedirectUrl would not " +
        "resolve. See the repository-root .env.example, as " +
        "API__KEYCLOAK_REDIRECT_URL."
    );
  }

  return raw.replace(/\/+$/, "");
}
