import configuration from "../../src/config/config";
import { resolveDatabaseSsl } from "../../src/config/database-ssl";
import { requireDbPassword } from "../../src/config/security-env";
import { resolveSwaggerOauthRedirectOrigin } from "../../src/config/swagger-env";

const VALID_JWKS_URL =
  "https://auth.medaris.app/realms/amel-tech-dev/protocol/openid-connect/certs";
const VALID_ISSUER = "https://auth.medaris.app/realms/amel-tech-dev";
const VALID_AUDIENCE = "tedrisat-api";

/** Everything readSecurityEnv demands, so each test can remove one variable. */
function setCompleteSecurityEnv() {
  process.env.KEYCLOAK_JWKS_URL = VALID_JWKS_URL;
  process.env.KEYCLOAK_ISSUER = VALID_ISSUER;
  process.env.KEYCLOAK_AUDIENCE = VALID_AUDIENCE;
  process.env.DB_PASSWORD = "a-real-password";
}

describe("tedrisat configuration", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("required security variables", () => {
    it("refuses to build a production config without KEYCLOAK_JWKS_URL", () => {
      process.env.NODE_ENV = "production";
      setCompleteSecurityEnv();
      delete process.env.KEYCLOAK_JWKS_URL;

      expect(() => configuration()).toThrow(/KEYCLOAK_JWKS_URL/);
    });

    it("refuses to build a production config without DB_PASSWORD", () => {
      process.env.NODE_ENV = "production";
      setCompleteSecurityEnv();
      delete process.env.DB_PASSWORD;

      expect(() => configuration()).toThrow(/DB_PASSWORD/);
    });

    it("refuses to build a production config without KEYCLOAK_ISSUER", () => {
      // Without it JwtVerifierService would accept any token the realm signed.
      process.env.NODE_ENV = "production";
      setCompleteSecurityEnv();
      delete process.env.KEYCLOAK_ISSUER;

      expect(() => configuration()).toThrow(/KEYCLOAK_ISSUER/);
    });

    it("refuses to build a production config without KEYCLOAK_AUDIENCE", () => {
      process.env.NODE_ENV = "production";
      setCompleteSecurityEnv();
      delete process.env.KEYCLOAK_AUDIENCE;

      expect(() => configuration()).toThrow(/KEYCLOAK_AUDIENCE/);
    });

    it("rejects a KEYCLOAK_JWKS_URL that is not an absolute URL", () => {
      process.env.NODE_ENV = "production";
      setCompleteSecurityEnv();
      process.env.KEYCLOAK_JWKS_URL = "test-url";

      expect(() => configuration()).toThrow(/KEYCLOAK_JWKS_URL/);
    });

    it("rejects a KEYCLOAK_ISSUER that is not an absolute URL", () => {
      // `iss` is compared verbatim, so a realm name alone can never match.
      process.env.NODE_ENV = "production";
      setCompleteSecurityEnv();
      process.env.KEYCLOAK_ISSUER = "amel-tech-dev";

      expect(() => configuration()).toThrow(/KEYCLOAK_ISSUER/);
    });

    it("applies the same requirement in development", () => {
      process.env.NODE_ENV = "development";
      delete process.env.KEYCLOAK_JWKS_URL;
      delete process.env.DB_PASSWORD;

      expect(() => configuration()).toThrow(/KEYCLOAK_JWKS_URL/);
    });

    it("uses the supplied values when all of them are present", () => {
      process.env.NODE_ENV = "production";
      setCompleteSecurityEnv();
      process.env.KEYCLOAK_ALLOWED_CLIENTS = "tedris-web,nizam-web";

      const config = configuration();

      expect(config.keycloak.jwksUrl).toBe(VALID_JWKS_URL);
      expect(config.keycloak.issuer).toBe(VALID_ISSUER);
      expect(config.keycloak.audience).toBe(VALID_AUDIENCE);
      expect(config.keycloak.allowedClients).toBe("tedris-web,nizam-web");
      expect(config.database.password).toBe("a-real-password");
    });

    it("leaves the azp allow-list empty when it is not configured", () => {
      // readSecurityEnv never demands it — whether it is required depends on
      // the audience, and that is JwtVerifierService's call, not this file's.
      process.env.NODE_ENV = "production";
      setCompleteSecurityEnv();
      delete process.env.KEYCLOAK_ALLOWED_CLIENTS;

      expect(configuration().keycloak.allowedClients).toBe("");
    });

    it("still falls back inside a test-runner worker so the suites need no Keycloak", () => {
      process.env.NODE_ENV = "test";
      process.env.JEST_WORKER_ID = "1";
      delete process.env.VITEST_WORKER_ID;
      delete process.env.KEYCLOAK_JWKS_URL;
      delete process.env.KEYCLOAK_ISSUER;
      delete process.env.KEYCLOAK_AUDIENCE;
      delete process.env.DB_PASSWORD;

      expect(() => configuration()).not.toThrow();
    });

    it("does not exempt NODE_ENV=test outside a test-runner worker", () => {
      // A staging container or a CI job reusing a compose file can carry
      // NODE_ENV=test; it must not be handed jwksUrl = "test-url".
      // Both worker variables have to go: this suite itself runs under Vitest,
      // so VITEST_WORKER_ID is set in the ambient environment and deleting only
      // the Jest one would leave the case asserting the opposite of its name.
      process.env.NODE_ENV = "test";
      delete process.env.JEST_WORKER_ID;
      delete process.env.VITEST_WORKER_ID;
      delete process.env.KEYCLOAK_JWKS_URL;
      delete process.env.DB_PASSWORD;

      expect(() => configuration()).toThrow(/KEYCLOAK_JWKS_URL/);
    });
  });

  describe("Swagger in production", () => {
    beforeEach(() => {
      // The security variables are read before the Swagger flag, so they have
      // to be present for these cases to reach it. ISSUER and AUDIENCE joined
      // that set in MDRS-30, after these cases were written.
      process.env.KEYCLOAK_JWKS_URL = VALID_JWKS_URL;
      process.env.KEYCLOAK_ISSUER = VALID_ISSUER;
      process.env.KEYCLOAK_AUDIENCE = VALID_AUDIENCE;
      process.env.DB_PASSWORD = "a-real-password";
      delete process.env.SWAGGER_ALLOW_IN_PRODUCTION;
    });

    it("refuses SWAGGER_ENABLED=true in production without an opt-in", () => {
      process.env.NODE_ENV = "production";
      process.env.SWAGGER_ENABLED = "true";

      expect(() => configuration()).toThrow(/SWAGGER_ALLOW_IN_PRODUCTION/);
    });

    it("allows it in production with the explicit opt-in", () => {
      process.env.NODE_ENV = "production";
      process.env.SWAGGER_ENABLED = "true";
      process.env.SWAGGER_ALLOW_IN_PRODUCTION = "true";

      expect(configuration().swagger.enabled).toBe(true);
    });

    it("leaves production alone when the flag is off", () => {
      process.env.NODE_ENV = "production";
      process.env.SWAGGER_ENABLED = "false";

      expect(configuration().swagger.enabled).toBe(false);
    });

    it("still enables Swagger outside production", () => {
      process.env.NODE_ENV = "development";
      process.env.SWAGGER_ENABLED = "true";

      expect(configuration().swagger.enabled).toBe(true);
    });

    it("treats an unset SWAGGER_ENABLED as off", () => {
      process.env.NODE_ENV = "production";
      delete process.env.SWAGGER_ENABLED;

      expect(configuration().swagger.enabled).toBe(false);
    });
  });

  describe("requireDbPassword — the drizzle migration client", () => {
    it("throws, naming the variable, when DB_PASSWORD is absent", () => {
      expect(() => requireDbPassword({ NODE_ENV: "production" })).toThrow(
        /DB_PASSWORD/
      );
    });

    it("rejects an empty DB_PASSWORD rather than connecting with one", () => {
      expect(() =>
        requireDbPassword({ NODE_ENV: "production", DB_PASSWORD: "" })
      ).toThrow(/DB_PASSWORD/);
    });

    it("returns the password when it is set", () => {
      expect(
        requireDbPassword({ NODE_ENV: "production", DB_PASSWORD: "s3cret" })
      ).toBe("s3cret");
    });
  });

  describe("database TLS", () => {
    it("disables TLS when DB_SSL is not 'true'", () => {
      expect(resolveDatabaseSsl({ DB_SSL: "false" })).toBe(false);
      expect(resolveDatabaseSsl({})).toBe(false);
    });

    it("verifies the server certificate when TLS is enabled", () => {
      expect(resolveDatabaseSsl({ DB_SSL: "true" })).toEqual({
        rejectUnauthorized: true,
      });
    });

    it("passes DB_CA_CERT through as the trust anchor", () => {
      const ca = "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----";

      expect(resolveDatabaseSsl({ DB_SSL: "true", DB_CA_CERT: ca })).toEqual({
        rejectUnauthorized: true,
        ca,
      });
    });

    it("turns literal backslash-n in DB_CA_CERT into real newlines", () => {
      // How docker-compose `environment:` and several CI secret UIs deliver a
      // PEM. Left as-is, tls fails with NO_START_LINE.
      const escaped =
        "-----BEGIN CERTIFICATE-----\\nMIIB\\n-----END CERTIFICATE-----";

      expect(
        resolveDatabaseSsl({ DB_SSL: "true", DB_CA_CERT: escaped })
      ).toEqual({
        rejectUnauthorized: true,
        ca: "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----",
      });
    });

    it("never produces rejectUnauthorized: false", () => {
      const enabled = resolveDatabaseSsl({ DB_SSL: "true" });

      expect(enabled).not.toBe(false);
      expect(
        (enabled as { rejectUnauthorized: boolean }).rejectUnauthorized
      ).toBe(true);
    });
  });
});

describe("resolveSwaggerOauthRedirectOrigin", () => {
  // Only consulted when Swagger is actually mounted. Left unguarded it
  // stringified an absent variable into `undefined/docs/oauth2-redirect.html`,
  // which boots and only fails at the Authorize click.
  it("throws, naming the variable, when KEYCLOAK_REDIRECT_URL is unset", () => {
    expect(() => resolveSwaggerOauthRedirectOrigin({})).toThrow(
      /KEYCLOAK_REDIRECT_URL/
    );
  });

  it("rejects an empty value rather than building undefined-looking URLs", () => {
    expect(() =>
      resolveSwaggerOauthRedirectOrigin({ KEYCLOAK_REDIRECT_URL: "" })
    ).toThrow(/KEYCLOAK_REDIRECT_URL/);
  });

  it("rejects a value that is not an absolute URL", () => {
    expect(() =>
      resolveSwaggerOauthRedirectOrigin({
        KEYCLOAK_REDIRECT_URL: "api-tedrisat-dev.medaris.net",
      })
    ).toThrow(/KEYCLOAK_REDIRECT_URL/);
  });

  it("returns an absolute origin unchanged", () => {
    expect(
      resolveSwaggerOauthRedirectOrigin({
        KEYCLOAK_REDIRECT_URL: "https://api-tedrisat-dev.medaris.net",
      })
    ).toBe("https://api-tedrisat-dev.medaris.net");
  });

  it("drops a trailing slash, since the endpoint carries its own", () => {
    expect(
      resolveSwaggerOauthRedirectOrigin({
        KEYCLOAK_REDIRECT_URL: "https://api-tedrisat-dev.medaris.net/",
      })
    ).toBe("https://api-tedrisat-dev.medaris.net");
  });
});
