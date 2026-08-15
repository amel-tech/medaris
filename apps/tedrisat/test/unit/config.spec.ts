import configuration from "../../src/config/config";
import { resolveDatabaseSsl } from "../../src/config/database-ssl";
import { requireDbPassword } from "../../src/config/security-env";

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
      // Optional by design: `aud` already binds the token to this API.
      process.env.NODE_ENV = "production";
      setCompleteSecurityEnv();
      delete process.env.KEYCLOAK_ALLOWED_CLIENTS;

      expect(configuration().keycloak.allowedClients).toBe("");
    });

    it("still falls back inside a Jest worker so the suites need no Keycloak", () => {
      process.env.NODE_ENV = "test";
      process.env.JEST_WORKER_ID = "1";
      delete process.env.KEYCLOAK_JWKS_URL;
      delete process.env.KEYCLOAK_ISSUER;
      delete process.env.KEYCLOAK_AUDIENCE;
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
