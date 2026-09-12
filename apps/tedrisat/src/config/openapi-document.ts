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
  /**
   * How a `jwksUrl` that does not end in `/certs` is handled. The exporter
   * sets `true`: there a wrong URL becomes bytes in a committed artifact, so
   * it throws. The running service leaves it `false`: the same value is
   * otherwise perfectly valid — `security-env.ts` only asks for a URL, and its
   * real job is JWT verification — and both OAuth2 URLs only feed Swagger UI's
   * Authorize button, so the document is built with them `undefined` (the
   * shape an absent JWKS URL already produces) and a warning is logged, rather
   * than the whole API refusing to boot over two documentation URLs.
   */
  strictJwksUrl?: boolean;
}

/**
 * Swap Keycloak's `/certs` endpoint for one of its two siblings.
 *
 * Anchored to the end of the path, and loud when it does not match. The
 * previous form — `jwksUrl.replace("/certs", ...)` with a string pattern —
 * rewrote only the FIRST occurrence and silently returned the input unchanged
 * when there was none, so a realm path that itself contains `/certs` produced
 * `https://host/auth/realms/x/protocol/openid-connect/certs`, and any
 * non-Keycloak JWKS URL produced `authorizationUrl === tokenUrl ===` the JWKS
 * endpoint itself. Both are plausible-looking URLs that boot fine and only fail
 * when somebody clicks Authorize — and since MDRS-58 they also decide bytes in
 * a committed artifact, so a wrong one is published rather than merely served.
 */
const JWKS_CERTS_SUFFIX = /\/certs$/;

function keycloakEndpoint(
  jwksUrl: string | undefined,
  segment: "auth" | "token",
  strict: boolean
): string | undefined {
  if (jwksUrl === undefined) return undefined;

  if (!JWKS_CERTS_SUFFIX.test(jwksUrl)) {
    const problem =
      `KEYCLOAK_JWKS_URL ("${jwksUrl}") does not end in /certs, so Swagger's ` +
      "OAuth2 authorization and token URLs cannot be derived from it. Point it " +
      "at the realm's JWKS endpoint (.../protocol/openid-connect/certs).";
    if (strict) {
      throw new Error(
        `@medaris/tedrisat cannot build the OpenAPI document: ${problem}`
      );
    }
    console.warn(
      `@medaris/tedrisat: ${problem} Swagger UI's Authorize button will not ` +
        "start a login; the service is running normally."
    );
    return undefined;
  }

  return jwksUrl.replace(JWKS_CERTS_SUFFIX, `/${segment}`);
}

export function buildTedrisatOpenApiConfig({
  version,
  jwksUrl,
  strictJwksUrl = false,
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
              authorizationUrl: keycloakEndpoint(
                jwksUrl,
                "auth",
                strictJwksUrl
              ),
              tokenUrl: keycloakEndpoint(jwksUrl, "token", strictJwksUrl),
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
