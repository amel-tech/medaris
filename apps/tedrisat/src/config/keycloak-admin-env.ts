export interface IKeycloakAdminConfig {
  /** The realm's admin REST root, e.g. https://auth.example/admin/realms/medaris */
  adminUrl: string;
  /** The realm's token endpoint. */
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
}

/**
 * The service-account client tedrisat uses to read the realm's users
 * (MDRS-169): `GET /users/lookup` and `GET /nizam/chief-nazim`.
 *
 * Optional on purpose, like `TEDRIS_WEB_URL`: unset, the two routes answer 503
 * and the rest of the API boots. Only one of the two keys being set is a
 * typo, so that stops the boot. The realm is taken from `KEYCLOAK_ISSUER`
 * (`<origin>/realms/<realm>`), which the service already requires.
 *
 * Set as `TEDRISAT__KEYCLOAK_ADMIN_CLIENT_ID` and
 * `TEDRISAT__KEYCLOAK_ADMIN_CLIENT_SECRET` in the repository-root `.env`.
 */
export function readKeycloakAdminConfig(
  env: NodeJS.ProcessEnv
): IKeycloakAdminConfig | null {
  const clientId = env.KEYCLOAK_ADMIN_CLIENT_ID?.trim();
  const clientSecret = env.KEYCLOAK_ADMIN_CLIENT_SECRET?.trim();
  if (!clientId && !clientSecret) return null;
  if (!clientId || !clientSecret) {
    throw new Error(
      "KEYCLOAK_ADMIN_CLIENT_ID and KEYCLOAK_ADMIN_CLIENT_SECRET must be set together " +
        "(TEDRISAT__KEYCLOAK_ADMIN_CLIENT_ID / TEDRISAT__KEYCLOAK_ADMIN_CLIENT_SECRET in the root .env)."
    );
  }
  const issuer = env.KEYCLOAK_ISSUER?.trim();
  const match = issuer ? /^(.*)\/realms\/([^/]+)\/?$/.exec(issuer) : null;
  if (!match) {
    throw new Error(
      `KEYCLOAK_ADMIN_CLIENT_ID is set but KEYCLOAK_ISSUER "${issuer ?? ""}" is not <origin>/realms/<realm>.`
    );
  }
  const [, origin, realm] = match;
  return {
    adminUrl: `${origin}/admin/realms/${realm}`,
    tokenUrl: `${origin}/realms/${realm}/protocol/openid-connect/token`,
    clientId,
    clientSecret,
  };
}
