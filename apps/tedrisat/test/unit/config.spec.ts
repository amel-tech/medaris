import configuration from "../../src/config/config";
import { resolveDatabaseSsl } from "../../src/config/database-ssl";

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

    it("still falls back under NODE_ENV=test so the suites need no Keycloak", () => {
      process.env.NODE_ENV = "test";
      delete process.env.KEYCLOAK_JWKS_URL;
      delete process.env.DB_PASSWORD;

      expect(() => configuration()).not.toThrow();
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

    it("never produces rejectUnauthorized: false", () => {
      const enabled = resolveDatabaseSsl({ DB_SSL: "true" });

      expect(enabled).not.toBe(false);
      expect(
        (enabled as { rejectUnauthorized: boolean }).rejectUnauthorized
      ).toBe(true);
    });
  });
});
