import configuration from "../../src/config/config";
import { resolveDatabaseSsl } from "../../src/config/database-ssl";
import { requireDbPassword } from "../../src/config/security-env";

const VALID_JWKS_URL =
  "https://auth.medaris.app/realms/amel-tech-dev/protocol/openid-connect/certs";

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
      process.env.DB_PASSWORD = "a-real-password";
      delete process.env.KEYCLOAK_JWKS_URL;

      expect(() => configuration()).toThrow(/KEYCLOAK_JWKS_URL/);
    });

    it("refuses to build a production config without DB_PASSWORD", () => {
      process.env.NODE_ENV = "production";
      process.env.KEYCLOAK_JWKS_URL = VALID_JWKS_URL;
      delete process.env.DB_PASSWORD;

      expect(() => configuration()).toThrow(/DB_PASSWORD/);
    });

    it("rejects a KEYCLOAK_JWKS_URL that is not an absolute URL", () => {
      process.env.NODE_ENV = "production";
      process.env.DB_PASSWORD = "a-real-password";
      process.env.KEYCLOAK_JWKS_URL = "test-url";

      expect(() => configuration()).toThrow(/KEYCLOAK_JWKS_URL/);
    });

    it("applies the same requirement in development", () => {
      process.env.NODE_ENV = "development";
      delete process.env.KEYCLOAK_JWKS_URL;
      delete process.env.DB_PASSWORD;

      expect(() => configuration()).toThrow(/KEYCLOAK_JWKS_URL/);
    });

    it("uses the supplied values when both are present", () => {
      process.env.NODE_ENV = "production";
      process.env.KEYCLOAK_JWKS_URL = VALID_JWKS_URL;
      process.env.DB_PASSWORD = "a-real-password";

      const config = configuration();

      expect(config.keycloak.jwksUrl).toBe(VALID_JWKS_URL);
      expect(config.database.password).toBe("a-real-password");
    });

    it("still falls back inside a Jest worker so the suites need no Keycloak", () => {
      process.env.NODE_ENV = "test";
      process.env.JEST_WORKER_ID = "1";
      delete process.env.KEYCLOAK_JWKS_URL;
      delete process.env.DB_PASSWORD;

      expect(() => configuration()).not.toThrow();
    });

    it("does not exempt NODE_ENV=test outside a Jest worker", () => {
      // A staging container or a CI job reusing a compose file can carry
      // NODE_ENV=test; it must not be handed jwksUrl = "test-url".
      process.env.NODE_ENV = "test";
      delete process.env.JEST_WORKER_ID;
      delete process.env.KEYCLOAK_JWKS_URL;
      delete process.env.DB_PASSWORD;

      expect(() => configuration()).toThrow(/KEYCLOAK_JWKS_URL/);
    });
  });

  describe("Swagger in production", () => {
    beforeEach(() => {
      // The security variables are read before the Swagger flag, so they have
      // to be present for these cases to reach it.
      process.env.KEYCLOAK_JWKS_URL = VALID_JWKS_URL;
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
