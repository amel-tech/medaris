import {
  buildCorsConfig,
  parseCsv,
  resolveAllowedMethods,
  resolveAllowedOrigins,
} from "@medaris/common";

/**
 * The parser lives in libs/common, which has no test target of its own; the
 * repository convention is to cover it from the app that boots it.
 *
 * Every case passes an explicit env object rather than mutating process.env,
 * so a case cannot leak into the next one.
 */
describe("CORS configuration", () => {
  const PROD = { NODE_ENV: "production" } as NodeJS.ProcessEnv;
  const DEV = { NODE_ENV: "development" } as NodeJS.ProcessEnv;

  describe("parseCsv", () => {
    it("returns an empty list for undefined and for an empty string", () => {
      expect(parseCsv(undefined)).toEqual([]);
      expect(parseCsv("")).toEqual([]);
    });

    it("returns a single entry unchanged", () => {
      expect(parseCsv("http://localhost:4000")).toEqual([
        "http://localhost:4000",
      ]);
    });

    it("trims the spaces around multi-value entries", () => {
      expect(
        parseCsv(" http://localhost:4000 , http://localhost:4001 ")
      ).toEqual(["http://localhost:4000", "http://localhost:4001"]);
    });

    it("drops entries that are empty or whitespace only", () => {
      expect(
        parseCsv("http://localhost:4000,, ,http://localhost:4001")
      ).toEqual(["http://localhost:4000", "http://localhost:4001"]);
    });
  });

  describe("resolveAllowedOrigins outside production", () => {
    it("falls back to the bare wildcard string when the variable is unset", () => {
      expect(resolveAllowedOrigins(DEV)).toBe("*");
    });

    it("falls back to the bare wildcard string when the list is empty", () => {
      expect(resolveAllowedOrigins({ ...DEV, ALLOWED_ORIGINS: " , " })).toBe(
        "*"
      );
    });

    it("returns the bare wildcard string, never a one-element array", () => {
      const origins = resolveAllowedOrigins({ ...DEV, ALLOWED_ORIGINS: "*" });

      expect(origins).toBe("*");
      expect(Array.isArray(origins)).toBe(false);
    });

    it("lets a wildcard anywhere in the list win over the named origins", () => {
      expect(
        resolveAllowedOrigins({
          ...DEV,
          ALLOWED_ORIGINS: "http://localhost:4000,*",
        })
      ).toBe("*");
    });

    it("returns a single configured origin as a one-element array", () => {
      expect(
        resolveAllowedOrigins({
          ...DEV,
          ALLOWED_ORIGINS: "http://localhost:4000",
        })
      ).toEqual(["http://localhost:4000"]);
    });

    it("trims a multi-value list", () => {
      expect(
        resolveAllowedOrigins({
          ...DEV,
          ALLOWED_ORIGINS: " http://localhost:4000 , http://localhost:4001 ",
        })
      ).toEqual(["http://localhost:4000", "http://localhost:4001"]);
    });

    it("treats an unset NODE_ENV as non-production", () => {
      expect(resolveAllowedOrigins({})).toBe("*");
    });
  });

  describe("resolveAllowedOrigins in production", () => {
    it("refuses an unset list with a message naming the variable", () => {
      expect(() => resolveAllowedOrigins(PROD)).toThrow(/ALLOWED_ORIGINS/);
    });

    it("refuses a list that is only separators", () => {
      expect(() =>
        resolveAllowedOrigins({ ...PROD, ALLOWED_ORIGINS: " , " })
      ).toThrow(/ALLOWED_ORIGINS/);
    });

    it("refuses a bare wildcard", () => {
      expect(() =>
        resolveAllowedOrigins({ ...PROD, ALLOWED_ORIGINS: "*" })
      ).toThrow(/ALLOWED_ORIGINS/);
    });

    it("refuses a wildcard hidden among real origins", () => {
      expect(() =>
        resolveAllowedOrigins({
          ...PROD,
          ALLOWED_ORIGINS: "https://tedris.medaris.app, *",
        })
      ).toThrow(/ALLOWED_ORIGINS/);
    });

    it("accepts a concrete list", () => {
      expect(
        resolveAllowedOrigins({
          ...PROD,
          ALLOWED_ORIGINS:
            "https://tedris.medaris.app,https://nizam.medaris.app",
        })
      ).toEqual(["https://tedris.medaris.app", "https://nizam.medaris.app"]);
    });
  });

  describe("resolveAllowedMethods", () => {
    it("includes OPTIONS in the default list", () => {
      expect(resolveAllowedMethods({})).toEqual([
        "GET",
        "HEAD",
        "PUT",
        "PATCH",
        "POST",
        "DELETE",
        "OPTIONS",
      ]);
    });

    it("appends OPTIONS to a configured list that omits it", () => {
      expect(resolveAllowedMethods({ ALLOWED_METHODS: "GET,POST" })).toEqual([
        "GET",
        "POST",
        "OPTIONS",
      ]);
    });

    it("uppercases and de-duplicates entries without adding a second OPTIONS", () => {
      expect(
        resolveAllowedMethods({ ALLOWED_METHODS: " get , GET , options " })
      ).toEqual(["GET", "OPTIONS"]);
    });

    it("falls back to the default list when the variable is empty", () => {
      expect(resolveAllowedMethods({ ALLOWED_METHODS: "" })).toEqual(
        resolveAllowedMethods({})
      );
    });

    it("falls back to the default list rather than allowing OPTIONS alone", () => {
      expect(resolveAllowedMethods({ ALLOWED_METHODS: " , " })).toEqual(
        resolveAllowedMethods({})
      );
    });
  });

  describe("buildCorsConfig", () => {
    it("pins the Bearer header surface and leaves cookies off", () => {
      const config = buildCorsConfig({
        ...DEV,
        ALLOWED_ORIGINS: "http://localhost:4000",
      });

      expect(config).toEqual({
        origin: ["http://localhost:4000"],
        methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
        allowedHeaders: ["Authorization", "Content-Type"],
        credentials: false,
      });
    });

    it("propagates the production refusal instead of returning a config", () => {
      expect(() => buildCorsConfig(PROD)).toThrow(/ALLOWED_ORIGINS/);
    });
  });
});
