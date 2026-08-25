import { DocumentBuilder, type OpenAPIObject } from "@nestjs/swagger";

/**
 * The OpenAPI document metadata, in one place (MDRS-58).
 *
 * It used to be inline in main.ts, which meant the only way to obtain the
 * document was to boot the service and read it off the running Swagger UI.
 * `libs/services/swagger-docs/tedrisat.json` was therefore hand-carried, and
 * it drifted: at the time this was extracted the committed spec still
 * described version 0.1.4 and carried neither of the two `flashcard-label`
 * controllers. openapi/export-openapi.ts now builds the same metadata from
 * this factory, so the committed artifact and the served one cannot describe
 * different APIs.
 *
 * The two OAuth2 URLs are derived from the JWKS URL the same way main.ts
 * derived them before, so the shape of the emitted `bearer` scheme is
 * unchanged.
 */
export const TEDRISAT_OPENAPI_TITLE = "Tedrisat Service API";
export const TEDRISAT_OPENAPI_DESCRIPTION =
  "Education management service for Madrasah platform";
export const TEDRISAT_OPENAPI_TAG = "tedrisat";
export const TEDRISAT_OPENAPI_TAG_DESCRIPTION =
  "Education management endpoints";

export interface TedrisatOpenApiOptions {
  /** `info.version`. The service's package version at runtime. */
  version: string;
  /**
   * `KEYCLOAK_JWKS_URL`. Absent leaves both OAuth2 URLs `undefined`, which is
   * what the inline builder did — Swagger UI then cannot start a login, but the
   * document is still valid and still describes the security requirement.
   */
  jwksUrl?: string;
}

/** `/certs` is the JWKS endpoint; its two siblings carry the same prefix. */
function keycloakEndpoint(
  jwksUrl: string | undefined,
  segment: "auth" | "token"
): string | undefined {
  return jwksUrl?.replace("/certs", `/${segment}`);
}

export function buildTedrisatOpenApiConfig({
  version,
  jwksUrl,
}: TedrisatOpenApiOptions): Omit<OpenAPIObject, "paths"> {
  return (
    new DocumentBuilder()
      .addBearerAuth()
      // Registered under the same name as addBearerAuth above, deliberately:
      // the OAuth2 scheme replaces the plain bearer one so that Swagger UI
      // offers the Keycloak implicit flow. Reordering these two would silently
      // change the emitted `components.securitySchemes.bearer`.
      .addOAuth2(
        {
          type: "oauth2",
          flows: {
            implicit: {
              authorizationUrl: keycloakEndpoint(jwksUrl, "auth"),
              tokenUrl: keycloakEndpoint(jwksUrl, "token"),
              scopes: {},
            },
          },
        },
        "bearer"
      )
      .setTitle(TEDRISAT_OPENAPI_TITLE)
      .setDescription(TEDRISAT_OPENAPI_DESCRIPTION)
      .setVersion(version)
      .addTag(TEDRISAT_OPENAPI_TAG, TEDRISAT_OPENAPI_TAG_DESCRIPTION)
      .build()
  );
}
