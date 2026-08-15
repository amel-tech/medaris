import { shouldRelaxSwaggerHeaders } from "../../src/config/swagger-csp";

const ENDPOINT = "/docs";

/**
 * Express supplies both fields; `path` is the parsed pathname and `url` is the
 * raw request target, query string included. The two are built together here so
 * that a predicate reading `url` instead of `path` fails the query-string
 * cases — which is what the original `req.url.includes("oauth2-redirect.html")`
 * did.
 */
function request(target: string) {
  return { url: target, path: target.split("?")[0] };
}

describe("shouldRelaxSwaggerHeaders", () => {
  describe("paths that serve Swagger UI HTML", () => {
    it("matches the Swagger endpoint itself", () => {
      expect(shouldRelaxSwaggerHeaders(request("/docs"), ENDPOINT)).toBe(true);
    });

    it("matches the OAuth2 redirect page under the endpoint", () => {
      expect(
        shouldRelaxSwaggerHeaders(
          request("/docs/oauth2-redirect.html"),
          ENDPOINT
        )
      ).toBe(true);
    });

    it("matches index.html, Swagger's third HTML route", () => {
      // SwaggerModule.setup binds serveSwaggerHtml to `<endpoint>`,
      // `<endpoint>/` and `<endpoint>/index.html`. Missing the last one leaves
      // COOP on a live Swagger page, which breaks the OAuth2 popup handshake.
      expect(
        shouldRelaxSwaggerHeaders(request("/docs/index.html"), ENDPOINT)
      ).toBe(true);
    });

    it("tolerates a trailing slash on either side", () => {
      expect(shouldRelaxSwaggerHeaders(request("/docs/"), ENDPOINT)).toBe(true);
      expect(shouldRelaxSwaggerHeaders(request("/docs"), "/docs/")).toBe(true);
    });

    it("adds the leading slash Nest's validatePath would add", () => {
      // SWAGGER_PATH=docs is served at /docs; comparing it raw would exempt
      // nothing at all.
      expect(shouldRelaxSwaggerHeaders(request("/docs"), "docs")).toBe(true);
      expect(
        shouldRelaxSwaggerHeaders(request("/docs/oauth2-redirect.html"), "docs")
      ).toBe(true);
    });

    it("handles a root endpoint without doubling the slash", () => {
      expect(shouldRelaxSwaggerHeaders(request("/"), "/")).toBe(true);
      expect(
        shouldRelaxSwaggerHeaders(request("/oauth2-redirect.html"), "/")
      ).toBe(true);
    });

    it("honours a non-default SWAGGER_PATH", () => {
      expect(shouldRelaxSwaggerHeaders(request("/swagger"), "/swagger")).toBe(
        true
      );
      expect(
        shouldRelaxSwaggerHeaders(
          request("/swagger/oauth2-redirect.html"),
          "/swagger"
        )
      ).toBe(true);
    });
  });

  describe("everything else keeps its security headers", () => {
    it("does not match an unrelated route", () => {
      expect(shouldRelaxSwaggerHeaders(request("/kosks"), ENDPOINT)).toBe(
        false
      );
    });

    it("does not match a route whose query string names the redirect file", () => {
      // The regression this task fixes: `req.url.includes(...)` stripped CSP
      // and COOP from any response whose URL carried this query string.
      expect(
        shouldRelaxSwaggerHeaders(
          request("/health?x=oauth2-redirect.html"),
          ENDPOINT
        )
      ).toBe(false);
    });

    it("strips the query string even without Express's parsed path", () => {
      expect(
        shouldRelaxSwaggerHeaders(
          { url: "/health?x=oauth2-redirect.html" },
          ENDPOINT
        )
      ).toBe(false);
    });

    it("does not match a route the endpoint merely prefixes", () => {
      // `/docs-json` is a real route — SwaggerModule serves the raw schema
      // there — and `req.url.startsWith("/docs")` stripped its headers too.
      expect(shouldRelaxSwaggerHeaders(request("/docs-json"), ENDPOINT)).toBe(
        false
      );
      expect(
        shouldRelaxSwaggerHeaders(request("/docs-internal"), ENDPOINT)
      ).toBe(false);
    });

    it("does not match the redirect file outside the Swagger endpoint", () => {
      expect(
        shouldRelaxSwaggerHeaders(request("/oauth2-redirect.html"), ENDPOINT)
      ).toBe(false);
      expect(
        shouldRelaxSwaggerHeaders(
          request("/kosks/oauth2-redirect.html"),
          ENDPOINT
        )
      ).toBe(false);
    });

    it("does not match Swagger's static assets, which need no exemption", () => {
      expect(
        shouldRelaxSwaggerHeaders(
          request("/docs/swagger-ui-bundle.js"),
          ENDPOINT
        )
      ).toBe(false);
    });
  });
});
