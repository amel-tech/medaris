import {
  resolveSwaggerEnabled,
  type SwaggerProductionRule,
  swaggerProductionSuppressionNotice,
  swaggerSuppressedByProduction,
} from "../../src";

/**
 * MDRS-85 — the shared production-Swagger resolver, with both policies side
 * by side. Each app's own spec still pins the rule it chose through its config
 * factory: tedrisat in `apps/tedrisat/test/unit/config.spec.ts`, teskilat in
 * `apps/teskilat/test/unit/swagger-policy.spec.ts` and its e2e spec.
 */

const TESKILAT: SwaggerProductionRule = {
  policy: "refuse-in-production",
  service: "@medaris/teskilat",
};

const TEDRISAT: SwaggerProductionRule = {
  policy: "throw-unless-opted-in",
  service: "@medaris/tedrisat",
};

describe("swagger production policies, side by side", () => {
  const PRODUCTION_WITH_FLAG = {
    NODE_ENV: "production",
    SWAGGER_ENABLED: "true",
  };

  it("throw-unless-opted-in throws in production without the opt-in, naming it and the service", () => {
    expect(() => resolveSwaggerEnabled(TEDRISAT, PRODUCTION_WITH_FLAG)).toThrow(
      /@medaris\/tedrisat refuses to start.*SWAGGER_ALLOW_IN_PRODUCTION/
    );
  });

  it("throw-unless-opted-in honours the opt-in; refuse-in-production does not", () => {
    const optedIn = {
      ...PRODUCTION_WITH_FLAG,
      SWAGGER_ALLOW_IN_PRODUCTION: "true",
    };
    expect(resolveSwaggerEnabled(TEDRISAT, optedIn)).toBe(true);
    expect(resolveSwaggerEnabled(TESKILAT, optedIn)).toBe(false);
  });

  it("refuse-in-production never throws on the shared key", () => {
    expect(() =>
      resolveSwaggerEnabled(TESKILAT, PRODUCTION_WITH_FLAG)
    ).not.toThrow();
  });

  it("only refuse-in-production reports a suppression to log", () => {
    expect(swaggerSuppressedByProduction(TESKILAT, PRODUCTION_WITH_FLAG)).toBe(
      true
    );
    expect(swaggerSuppressedByProduction(TEDRISAT, PRODUCTION_WITH_FLAG)).toBe(
      false
    );
  });

  it("agree outside production and when the flag is off", () => {
    for (const rule of [TESKILAT, TEDRISAT]) {
      expect(
        resolveSwaggerEnabled(rule, {
          NODE_ENV: "development",
          SWAGGER_ENABLED: "true",
        })
      ).toBe(true);
      expect(resolveSwaggerEnabled(rule, { NODE_ENV: "production" })).toBe(
        false
      );
    }
  });
});

describe("swaggerProductionSuppressionNotice", () => {
  it("names the service, the variable, and that there is no opt-in", () => {
    const notice = swaggerProductionSuppressionNotice(TESKILAT);
    expect(notice).toContain("@medaris/teskilat");
    expect(notice).toContain("SWAGGER_ENABLED");
    expect(notice).toContain("There is no opt-in");
  });
});
