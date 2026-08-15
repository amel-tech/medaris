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
  // The two environments that motivated not testing `NODE_ENV !== "production"`:
  // a staging container and a process that never set the variable at all.
  const STAGING = { NODE_ENV: "staging" } as NodeJS.ProcessEnv;
  const UNSET_ENV = {} as NodeJS.ProcessEnv;

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

  describe("resolveAllowedOrigins in development", () => {
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

    it("exempts a Jest worker, which is how the suites reach this branch", () => {
      expect(
        resolveAllowedOrigins({ NODE_ENV: "test", JEST_WORKER_ID: "1" })
      ).toBe("*");
    });
  });

  describe("resolveAllowedOrigins where the wildcard is not allowed", () => {
    it("refuses an unset list with a message naming the variable", () => {
      expect(() => resolveAllowedOrigins(PROD)).toThrow(/ALLOWED_ORIGINS/);
    });

    it("refuses an unset NODE_ENV rather than treating it as development", () => {
      expect(() => resolveAllowedOrigins(UNSET_ENV)).toThrow(/ALLOWED_ORIGINS/);
    });

    it("refuses a staging deployment, which NODE_ENV !== production would let through", () => {
      expect(() => resolveAllowedOrigins(STAGING)).toThrow(/ALLOWED_ORIGINS/);
      expect(() =>
        resolveAllowedOrigins({ ...STAGING, ALLOWED_ORIGINS: "*" })
      ).toThrow(/ALLOWED_ORIGINS/);
    });

    it("refuses NODE_ENV=test outside a Jest worker", () => {
      expect(() => resolveAllowedOrigins({ NODE_ENV: "test" })).toThrow(
        /ALLOWED_ORIGINS/
      );
    });

    it("names the offending NODE_ENV in the message", () => {
      expect(() => resolveAllowedOrigins(STAGING)).toThrow(/"staging"/);
      expect(() => resolveAllowedOrigins(UNSET_ENV)).toThrow(/unset/);
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

  describe("origin format validation", () => {
    // Malformed entries are refused everywhere, not only in production: the
    // cors package would match none of them and the response would carry no
    // Access-Control-Allow-Origin, which is silent in any environment.
    const reject = (value: string) => () =>
      resolveAllowedOrigins({ ...DEV, ALLOWED_ORIGINS: value });

    it("refuses a trailing slash and suggests the bare origin", () => {
      expect(reject("https://tedris.medaris.app/")).toThrow(
        /write "https:\/\/tedris\.medaris\.app" instead/
      );
    });

    it("refuses a value carrying a path", () => {
      expect(reject("https://tedris.medaris.app/api")).toThrow(/bare origin/);
    });

    it("refuses a scheme-less host", () => {
      expect(reject("tedris.medaris.app")).toThrow(/not an absolute URL/);
    });

    it("refuses a wildcard subdomain, which cors cannot match", () => {
      expect(reject("https://*.medaris.app")).toThrow(/ALLOWED_ORIGINS/);
    });

    it("accepts a host with an explicit port", () => {
      expect(
        resolveAllowedOrigins({
          ...DEV,
          ALLOWED_ORIGINS: "http://localhost:4000",
        })
      ).toEqual(["http://localhost:4000"]);
    });

    it("validates in production too", () => {
      expect(() =>
        resolveAllowedOrigins({
          ...PROD,
          ALLOWED_ORIGINS: "https://tedris.medaris.app/",
        })
      ).toThrow(/bare origin/);
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
        // ExcelService returns attachment; filename=… and Content-Disposition
        // is not CORS-safelisted, so a browser fetch could not read the name.
        exposedHeaders: ["Content-Disposition"],
        credentials: false,
      });
    });

    it("propagates the production refusal instead of returning a config", () => {
      expect(() => buildCorsConfig(PROD)).toThrow(/ALLOWED_ORIGINS/);
    });
  });
});
