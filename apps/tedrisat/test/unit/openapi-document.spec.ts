import {
  buildTedrisatOpenApiConfig,
  TEDRISAT_OPENAPI_DESCRIPTION,
  TEDRISAT_OPENAPI_TAG,
  TEDRISAT_OPENAPI_TITLE,
} from "../../src/config/openapi-document";

const JWKS_URL =
  "https://auth.medaris.app/realms/amel-tech-dev/protocol/openid-connect/certs";

/**
 * These assertions exist because `src/openapi/export-openapi.ts` writes the
 * committed `libs/services/swagger-docs/tedrisat.json` from this factory, and
 * the frontends' typed client is generated from that file. A silent change here
 * is a silent change to the published contract's security scheme.
 */
describe("buildTedrisatOpenApiConfig", () => {
  it("emits `bearer` as the Keycloak OAuth2 scheme, not plain HTTP bearer", () => {
    // The factory calls addBearerAuth() and then addOAuth2(..., "bearer"),
    // which registers over it. Reversing the two would leave an
    // `{ type: "http", scheme: "bearer" }` scheme here, Swagger UI would offer
    // no login, and every route's `security: [{ bearer: [] }]` would keep
    // pointing at it — a document that still validates and no longer describes
    // how to authenticate.
    const { components } = buildTedrisatOpenApiConfig({
      version: "1.2.3",
      jwksUrl: JWKS_URL,
    });

    expect(components?.securitySchemes?.bearer).toEqual({
      type: "oauth2",
      flows: {
        implicit: {
          authorizationUrl:
            "https://auth.medaris.app/realms/amel-tech-dev/protocol/openid-connect/auth",
          tokenUrl:
            "https://auth.medaris.app/realms/amel-tech-dev/protocol/openid-connect/token",
          scopes: {},
        },
      },
    });
  });

  it("leaves both OAuth2 URLs undefined when no JWKS URL is given", () => {
    // main.ts passed `config.get("KEYCLOAK_JWKS_URL")` straight through, so
    // absent meant undefined. Substituting a placeholder instead would put a
    // URL that resolves nowhere into the committed spec.
    const { components } = buildTedrisatOpenApiConfig({ version: "1.2.3" });
    const scheme = components?.securitySchemes?.bearer as {
      flows: { implicit: { authorizationUrl?: string; tokenUrl?: string } };
    };

    expect(scheme.flows.implicit.authorizationUrl).toBeUndefined();
    expect(scheme.flows.implicit.tokenUrl).toBeUndefined();
  });

  it("refuses a JWKS URL that does not end in /certs when strict (the exporter)", () => {
    // The string-pattern `replace` this replaced was silent here: it returned
    // the input unchanged, so both OAuth2 URLs became the JWKS endpoint itself.
    // Strict is the exporter's setting: a wrong URL there is committed bytes.
    expect(() =>
      buildTedrisatOpenApiConfig({
        version: "1.2.3",
        jwksUrl: "https://auth.example.test/realms/x/protocol/openid-connect",
        strictJwksUrl: true,
      })
    ).toThrow(/does not end in \/certs/);
  });

  it("degrades to no OAuth2 URLs, with a warning, when not strict (the running service)", () => {
    // main.ts leaves strictness off: the same value passes security-env's URL
    // check and verifies JWTs fine, and both URLs only feed Swagger UI's
    // Authorize button — not a reason to refuse to boot the whole API.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const config = buildTedrisatOpenApiConfig({
        version: "1.2.3",
        jwksUrl: "https://auth.example.test/realms/x/protocol/openid-connect",
      });
      const scheme = config.components?.securitySchemes?.bearer as {
        flows: { implicit: { authorizationUrl?: string; tokenUrl?: string } };
      };
      expect(scheme.flows.implicit.authorizationUrl).toBeUndefined();
      expect(scheme.flows.implicit.tokenUrl).toBeUndefined();
      expect(warn).toHaveBeenCalled();
      expect(String(warn.mock.calls[0]?.[0])).toMatch(
        /does not end in \/certs/
      );
    } finally {
      warn.mockRestore();
    }
  });

  it("rewrites only the trailing /certs, not an earlier one in the path", () => {
    // A string pattern rewrites the FIRST match, which for this URL produced
    // `https://host/auth/realms/x/protocol/openid-connect/certs`.
    const { components } = buildTedrisatOpenApiConfig({
      version: "1.2.3",
      jwksUrl:
        "https://auth.example.test/certs/realms/x/protocol/openid-connect/certs",
    });
    const scheme = components?.securitySchemes?.bearer as {
      flows: { implicit: { authorizationUrl?: string } };
    };

    expect(scheme.flows.implicit.authorizationUrl).toBe(
      "https://auth.example.test/certs/realms/x/protocol/openid-connect/auth"
    );
  });

  it("carries the title, description, version and tag the spec is keyed on", () => {
    const config = buildTedrisatOpenApiConfig({
      version: "0.1.5",
      jwksUrl: JWKS_URL,
    });

    expect(config.info.title).toBe(TEDRISAT_OPENAPI_TITLE);
    expect(config.info.description).toBe(TEDRISAT_OPENAPI_DESCRIPTION);
    // The generated client stamps this into every file header, so a wrong
    // version churns all 60-odd of them.
    expect(config.info.version).toBe("0.1.5");
    expect(config.tags?.map((tag) => tag.name)).toEqual([TEDRISAT_OPENAPI_TAG]);
  });
});
