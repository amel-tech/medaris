/**
 * MDRS-69 — teskilat's production Swagger refusal, and MDRS-85 — the shared
 * resolver it now goes through.
 *
 * The decision recorded here: under `NODE_ENV=production` teskilat never mounts
 * Swagger UI, whatever `SWAGGER_ENABLED` says, and there is no opt-in. See
 * `libs/common/src/config/swagger-production.config.ts` for why the
 * `refuse-in-production` policy resolves to `false` instead of throwing the way
 * tedrisat's `throw-unless-opted-in` policy does.
 *
 * `test/e2e/swagger.e2e.spec.ts` asserts the same rule as HTTP behaviour, so
 * this file is not the only evidence that the module goes unmounted. How the
 * two policies differ from each other is pinned where the resolver lives, in
 * `libs/common/test/config/swagger-production.config.spec.ts`.
 */
import {
  resolveSwaggerEnabled,
  type SwaggerProductionRule,
  swaggerProductionSuppressionNotice,
  swaggerSuppressedByProduction,
} from "@medaris/common";
import configuration from "../../src/config/config";

/** The rule `src/config/config.ts` and `src/swagger.ts` both name. */
const TESKILAT: SwaggerProductionRule = {
  policy: "refuse-in-production",
  service: "@medaris/teskilat",
};

const swaggerEnabledUnlessProduction = (env: NodeJS.ProcessEnv) =>
  resolveSwaggerEnabled(TESKILAT, env);

describe("resolveSwaggerEnabled — refuse-in-production (teskilat)", () => {
  it("refuses in production even with SWAGGER_ENABLED=true", () => {
    expect(
      swaggerEnabledUnlessProduction({
        NODE_ENV: "production",
        SWAGGER_ENABLED: "true",
      })
    ).toBe(false);
  });

  it("has no opt-in: SWAGGER_ALLOW_IN_PRODUCTION does not unlock it", () => {
    // tedrisat's escape hatch (MDRS-33). teskilat deliberately does not honour
    // it, so setting it changes nothing here.
    expect(
      swaggerEnabledUnlessProduction({
        NODE_ENV: "production",
        SWAGGER_ENABLED: "true",
        SWAGGER_ALLOW_IN_PRODUCTION: "true",
      })
    ).toBe(false);
  });

  it("enables outside production when the flag is set", () => {
    expect(
      swaggerEnabledUnlessProduction({
        NODE_ENV: "development",
        SWAGGER_ENABLED: "true",
      })
    ).toBe(true);
  });

  it("treats an unset NODE_ENV as non-production", () => {
    // The strict branch is keyed on the exact value "production", matching
    // libs/common's cors.config.ts and apps/teskilat/Dockerfile's ENV.
    expect(swaggerEnabledUnlessProduction({ SWAGGER_ENABLED: "true" })).toBe(
      true
    );
  });

  it("is off when the flag is absent", () => {
    expect(swaggerEnabledUnlessProduction({ NODE_ENV: "development" })).toBe(
      false
    );
  });

  it("is off for any value of the flag other than the string 'true'", () => {
    for (const SWAGGER_ENABLED of ["false", "1", "TRUE", "yes", ""]) {
      expect(
        swaggerEnabledUnlessProduction({
          NODE_ENV: "development",
          SWAGGER_ENABLED,
        })
      ).toBe(false);
    }
  });
});

describe("swaggerSuppressedByProduction — refuse-in-production (teskilat)", () => {
  it("is true only when the flag was set and production is the reason", () => {
    expect(
      swaggerSuppressedByProduction(TESKILAT, {
        NODE_ENV: "production",
        SWAGGER_ENABLED: "true",
      })
    ).toBe(true);
  });

  it("is false when nobody asked for Swagger", () => {
    // Otherwise every production container would log the warning on boot.
    expect(
      swaggerSuppressedByProduction(TESKILAT, { NODE_ENV: "production" })
    ).toBe(false);
    expect(
      swaggerSuppressedByProduction(TESKILAT, {
        NODE_ENV: "production",
        SWAGGER_ENABLED: "false",
      })
    ).toBe(false);
  });

  it("is false outside production, where the flag is honoured", () => {
    expect(
      swaggerSuppressedByProduction(TESKILAT, {
        NODE_ENV: "development",
        SWAGGER_ENABLED: "true",
      })
    ).toBe(false);
  });

  it("names the variable and says there is no opt-in", () => {
    const notice = swaggerProductionSuppressionNotice(TESKILAT);
    expect(notice).toContain("SWAGGER_ENABLED");
    expect(notice).toContain("There is no opt-in");
    expect(notice).toContain("@medaris/teskilat");
  });
});

describe("teskilat configuration", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("resolves swagger.enabled to false in production", () => {
    process.env.NODE_ENV = "production";
    process.env.SWAGGER_ENABLED = "true";

    expect(configuration().swagger.enabled).toBe(false);
  });

  it("still resolves swagger.enabled outside production", () => {
    process.env.NODE_ENV = "development";
    process.env.SWAGGER_ENABLED = "true";

    expect(configuration().swagger.enabled).toBe(true);
  });

  it("carries no database configuration at all", () => {
    // MDRS-69: teskilat opens no connection, so the whole block goes. Asserting
    // the absence of the key is what stops it being reintroduced by a copy from
    // tedrisat's config.
    process.env.NODE_ENV = "development";
    delete process.env.DB_PASSWORD;
    delete process.env.DB_NAME;
    delete process.env.DB_USERNAME;

    expect(configuration()).not.toHaveProperty("database");
  });

  it("defaults no configuration value to the literal 'password'", () => {
    // The removed line was `password: process.env.DB_PASSWORD || "password"` —
    // MDRS-35's other half, done for tedrisat and not here. Checking every
    // string the factory produces, rather than the one key it lived under,
    // catches it coming back under a different name.
    process.env.NODE_ENV = "development";
    delete process.env.DB_PASSWORD;
    delete process.env.REDIS_PASSWORD;

    expect(stringValuesOf(configuration())).not.toContain("password");
  });
});

/** Every string leaf of a nested plain object, for the credential check above. */
function stringValuesOf(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (value && typeof value === "object") {
    return Object.values(value).flatMap(stringValuesOf);
  }

  return [];
}
