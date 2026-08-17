/**
 * Which requests may have their security headers relaxed for Swagger UI.
 *
 * `applyGlobalMiddleware` mounts `helmet()` on every route before bootstrap
 * registers the Swagger middleware (apps/tedrisat/src/main.ts), so the only way
 * to let the UI render is to remove the two headers again on the way out. That
 * removal used to be guarded by
 *
 *     req.url.startsWith(swaggerEndpoint) || req.url.includes("oauth2-redirect.html")
 *
 * and `req.url` carries the query string: appending `?x=oauth2-redirect.html`
 * to *any* route stripped `Content-Security-Policy` and
 * `cross-origin-opener-policy` from that response. The predicate below matches
 * on the pathname only, and against the exact paths that serve HTML — nothing
 * else needs the exemption, because CSP applies to documents rather than to the
 * bundled script and stylesheet Swagger UI also serves.
 *
 * The HTML paths are the ones `SwaggerModule.setup` binds to its
 * `serveSwaggerHtml` handler — `<endpoint>`, `<endpoint>/` and
 * `<endpoint>/index.html` (`@nestjs/swagger/dist/swagger-module.js:197-203`) —
 * plus the OAuth2 redirect page served out of `swagger-ui-dist`.
 */

/** The last path segment Swagger UI uses for its OAuth2 popup callback. */
export const SWAGGER_OAUTH2_REDIRECT_SEGMENT = "oauth2-redirect.html";

/** Swagger UI's third HTML route, alongside `<endpoint>` and `<endpoint>/`. */
export const SWAGGER_INDEX_SEGMENT = "index.html";

/**
 * The part of an Express request this predicate reads.
 *
 * `path` is Express's parsed pathname and is what production always supplies;
 * `url` is the raw request target and is the fallback for a bare `node:http`
 * request. Both are narrowed here so the predicate can be unit tested without
 * a request object.
 */
export interface SwaggerCspRequest {
  readonly path?: string;
  readonly url: string;
}

/** Drops the query string and any trailing slashes. `"/"` survives as `"/"`. */
function pathnameOf(req: SwaggerCspRequest): string {
  const raw =
    typeof req.path === "string" && req.path.length > 0
      ? req.path
      : (req.url.split("?")[0] ?? "");

  return raw.replace(/\/+$/, "") || "/";
}

/**
 * The endpoint as a prefix, normalised the way Nest mounts it.
 *
 * `validatePath` adds the leading slash `SWAGGER_PATH=docs` omits
 * (`@nestjs/swagger/dist/utils/validate-path.util.js`), so the comparison has
 * to add it too or nothing would ever match that configuration. Trailing
 * slashes are dropped, which turns a `SWAGGER_PATH=/` endpoint into `""` —
 * exactly the prefix that makes `/oauth2-redirect.html` the right child path.
 *
 * Exported because bootstrap needs the same value: the mount path handed to
 * `SwaggerModule.setup`, this predicate and the `oauth2RedirectUrl` built in
 * `main.ts` have to agree, and that last one concatenates the endpoint onto an
 * origin — `SWAGGER_PATH=docs` would otherwise produce `https://hostdocs/…`.
 */
export function endpointPrefixOf(swaggerEndpoint: string): string {
  const withLeadingSlash = swaggerEndpoint.startsWith("/")
    ? swaggerEndpoint
    : `/${swaggerEndpoint}`;

  return withLeadingSlash.replace(/\/+$/, "");
}

/**
 * True for exactly Swagger UI's HTML pages and its OAuth2 redirect page.
 *
 * Compares full pathnames, so `/docs-json` and `/health?x=…` are not matches
 * even though one is prefixed by the endpoint and the other mentions the
 * redirect file.
 */
export function shouldRelaxSwaggerHeaders(
  req: SwaggerCspRequest,
  swaggerEndpoint: string
): boolean {
  const prefix = endpointPrefixOf(swaggerEndpoint);
  const pathname = pathnameOf(req);

  return (
    pathname === (prefix || "/") ||
    pathname === `${prefix}/${SWAGGER_INDEX_SEGMENT}` ||
    pathname === `${prefix}/${SWAGGER_OAUTH2_REDIRECT_SEGMENT}`
  );
}
