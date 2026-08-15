# MDRS-33 — Fix the Swagger CSP-stripping middleware

Base: `e7f693c`. Independent of PR #80 — `apps/tedrisat/src/main.ts` is not among
its files.

Every figure below was read off command output on this branch. What could not be
measured is listed under **Not verified** rather than left out.

## The defect

`apps/tedrisat/src/main.ts` mounted an **unpathed** `app.use()` whose guard was

```ts
req.url.startsWith(swaggerEndpoint) || req.url.includes("oauth2-redirect.html")
```

`req.url` is the raw request target, query string included. Appending
`?x=oauth2-redirect.html` to any route therefore removed
`Content-Security-Policy` and `cross-origin-opener-policy` from that response.
The headers come from the single `app.use(helmet())` in
`libs/common/src/bootstrap/setupMiddleware.ts:18`, applied to every route by
`applyGlobalMiddleware` at `main.ts:15` — before this middleware is registered.

`startsWith` was also wrong on its own: `/docs-internal` matched `/docs`.

The blast radius was gated by `swagger.enabled`, but the `.env.example` files
shipped `SWAGGER_ENABLED=true`, so the schema *and* the middleware were on
wherever a template was copied. The issue named the two API templates; review of
this branch turned up a third — the workspace-root one docker-compose reads — and
it is flipped here too.

## What changed

| File | Change |
| --- | --- |
| `apps/tedrisat/src/config/swagger-csp.ts` | New. `shouldRelaxSwaggerHeaders(req, swaggerEndpoint)` — matches full pathnames against exactly the three HTML routes `SwaggerModule.setup` binds (`<endpoint>`, `<endpoint>/`, `<endpoint>/index.html`) plus `<endpoint>/oauth2-redirect.html`. Reads `req.path`, falling back to the part of `req.url` before `?`. Also exports `endpointPrefixOf`. |
| `apps/tedrisat/src/config/swagger-env.ts` | New. `resolveSwaggerEnabled(env)` — throws when `SWAGGER_ENABLED=true` meets `NODE_ENV=production` without `SWAGGER_ALLOW_IN_PRODUCTION=true`. |
| `apps/tedrisat/src/config/config.ts` | `swagger.enabled` comes from `resolveSwaggerEnabled(process.env)` instead of a bare `=== "true"`. |
| `apps/tedrisat/src/main.ts` | The middleware calls the predicate; its three `any` parameters are gone. The endpoint is normalised once through `endpointPrefixOf` and reused for the mount path, the predicate and `oauth2RedirectUrl` — see below. |
| `apps/tedrisat/.env.example` | `SWAGGER_ENABLED=false`, plus the commented `SWAGGER_ALLOW_IN_PRODUCTION` and why it exists. |
| `apps/teskilat/.env.example` | `SWAGGER_ENABLED=false`. |
| `.env.example` (workspace root) | `SWAGGER_ENABLED=false` and the same note. Found in review; docker-compose reads this one, and `.github/workflows/ci.yaml` seeds only `apps/*/.env.example`, so it is a template gap rather than a CI break. |
| `CLAUDE.md`, `README.md` | The stated test baseline moves 106/11 → 128/12. |
| `apps/tedrisat/test/unit/swagger-csp.spec.ts` | New. 17 tests — 13 over the predicate, 4 over the endpoint normaliser. |
| `apps/tedrisat/test/unit/config.spec.ts` | +5 tests over the production guard. |
| `tools/ci/biome-baseline.json` | Warning floor lowered 94 → 91; see below. |

### Why the headers are still removed after the fact

The issue suggests mounting `helmet({ contentSecurityPolicy: false })` on the
Swagger path instead. That does not work here: the global `helmet()` in
`applyGlobalMiddleware` has already set the header for every route by the time
any path-mounted middleware runs, and a second helmet instance does not unset
what the first one wrote. Removing CSP without the after-the-fact deletion would
mean dropping the global helmet and re-mounting it per path — a change to the
shared bootstrap that also affects teskilat, and outside this task. The predicate
is the fix; the removal stays, now correctly scoped.

Swagger UI's static assets (`/docs/swagger-ui-bundle.js`, the stylesheet) are
deliberately *not* exempted. CSP constrains documents, not the subresources they
load, so those responses keep their headers and the UI still renders — confirmed
in a real browser below.

### One endpoint form, three consumers

Review of this branch caught a second-order problem. The predicate deliberately
accepts an unslashed `SWAGGER_PATH=docs`, because Nest's `validatePath` adds the
slash when it mounts — and the workspace-root `.env.example` ships exactly that
form. But bootstrap also concatenated the raw value onto an origin:

```ts
config.get("KEYCLOAK_REDIRECT_URL") + swaggerEndpoint + "/oauth2-redirect.html"
```

With `KEYCLOAK_REDIRECT_URL=https://api-tedrisat-dev.medaris.net` and
`SWAGGER_PATH=docs` that builds `https://api-tedrisat-dev.medaris.netdocs/…` — a
different host, so Keycloak would never match the redirect URI and the popup
handshake would not return. The exemption would then be protecting a page the
flow never reaches.

`endpointPrefixOf` is now exported and applied once in `main.ts`, so the mount
path, the predicate and the redirect URL all read the same normalised value. The
concatenation predates this task; making the unslashed form a tested, documented
configuration is what turned it into a live edge.

Measured on a boot with `SWAGGER_PATH=docs` and
`KEYCLOAK_REDIRECT_URL=https://api-tedrisat-dev.medaris.net`:

```
/docs                            status=200 CSP=ABSENT
/docs/oauth2-redirect.html       status=200 CSP=ABSENT
/health?x=oauth2-redirect.html   status=200 CSP=present

GET /docs/swagger-ui-init.js:
  "oauth2RedirectUrl": "https://api-tedrisat-dev.medaris.net/docs/oauth2-redirect.html"
```

— the host is intact and the path is the mounted one.

### Why the production guard throws

AC #4 allows either throwing or resolving to `false`. It throws, so that a
production deploy still carrying `SWAGGER_ENABLED=true` is told which variable to
change rather than silently losing its documentation endpoint. This matches
`security-env.ts`, which MDRS-35 landed on the same fail-loud rule.

**This is the one breaking change on this branch.** Any deployment currently
running `NODE_ENV=production` with `SWAGGER_ENABLED=true` will refuse to boot
until it sets `SWAGGER_ENABLED=false` or `SWAGGER_ALLOW_IN_PRODUCTION=true`. That
is the intent, but see **Not verified** — the deployment environments were not
inspected from here.

## Verified

### Against a real boot

`apps/tedrisat/dist/src/main.js` was run on port **3011** against a throwaway
`postgres:17-alpine` container, with `OTEL_ENABLED=false` and
`AUTO_MIGRATIONS_ENABLED=false`. The AC names port 3001; only the port differs.
Headers read with `curl -sI`:

```
NODE_ENV=development SWAGGER_ENABLED=true
/docs                              status=200 CSP=ABSENT  COOP=ABSENT
/docs/oauth2-redirect.html         status=200 CSP=ABSENT  COOP=ABSENT
/health?x=oauth2-redirect.html     status=200 CSP=present COOP=present   ← AC #1
/kosks                             status=401 CSP=present COOP=present
/health                            status=200 CSP=present COOP=present
```

`GET /docs` returns Swagger's `<!DOCTYPE html>` bundle, so the UI is still served
(AC #2). `/kosks` answers 401 from its auth guard and keeps both headers.

The same boot with the production guard:

```
NODE_ENV=production SWAGGER_ENABLED=true, no opt-in   → process exits before listen:
  Error: @medaris/tedrisat refuses to start: SWAGGER_ENABLED=true with
  NODE_ENV=production publishes the API schema and relaxes the security headers
  on the Swagger pages. Set SWAGGER_ENABLED=false, or set
  SWAGGER_ALLOW_IN_PRODUCTION=true to accept that deliberately.

NODE_ENV=production SWAGGER_ENABLED=true SWAGGER_ALLOW_IN_PRODUCTION=true
  → boots, /docs 200, same header table as above

NODE_ENV=production SWAGGER_ENABLED=false
  → boots, /docs 404, /docs/oauth2-redirect.html 404, all headers intact
```

The throw surfaces from `dist/src/otel.js`, which imports the config factory at
module load — so it is a hard startup failure, not a late one.

### In a browser (AC #2, second half)

Playwright loaded `http://127.0.0.1:3011/docs` against that same instance. The
page rendered fully — title "Swagger UI", the "Tedrisat Service API 0.1.5"
heading, the Authorize button, the `tedrisat` operation group and the Schemas
section — and the console held **0 errors and 0 warnings**, so no CSP violation
was reported while the same-origin bundle and stylesheet loaded under the
still-present headers on those asset responses.

### The specs

`swagger-csp.spec.ts` is 17 tests: the four paths the AC names, Swagger's other
two HTML routes, the near-miss paths, and the endpoint normaliser. Reverting the
predicate body to the `req.url.startsWith(…) || req.url.includes(…)` form and
re-running it gives **7 failed / 10 passed**, with both query-string cases among
the failures; restoring it returns **17 passed**. So the spec is a real
regression test (AC #3).

`config.spec.ts` gained 5 tests over the `configuration()` factory (AC #4): the
throw naming `SWAGGER_ALLOW_IN_PRODUCTION`, the opt-in path, an unset flag, a
false flag, and the non-production path.

### The gate, `--skip-nx-cache` throughout

| Target | Result |
| --- | --- |
| `typecheck` | 16 projects |
| `test` | 12 suites / 128 tests — tedrisat 10/126, teskilat 2/2 |
| `build` | 8 projects |
| `lint` | 16 projects |
| `module-boundaries` | 16 projects |

`CLAUDE.md`'s baseline was 106 tests / 11 suites (tedrisat 104/9, measured again
here before the change). The +22 is the 17 in `swagger-csp.spec.ts` and the 5
added to `config.spec.ts`; both files were counted on their own to confirm the
arithmetic (17 and 20, against 15 in `config.spec.ts` before). `CLAUDE.md` and
`README.md` are updated to 128/12 in this branch. `-t test` ran against a live Docker daemon; tedrisat's four e2e suites
started their Testcontainers `postgres:17-alpine` as usual.

`node tools/ci/biome-ratchet.mjs` reports 538 files, 0 errors, **91 warnings**
(floor was 94), 27 infos. The three that went away are the `any` parameters
removed from the middleware in `main.ts`. `tools/ci/biome-baseline.json` is
lowered to 91 here so the win is locked in.

## Not verified

- **The deployment environments were not inspected.** Whether any live tedrisat
  currently runs `NODE_ENV=production` with `SWAGGER_ENABLED=true` — and would
  therefore fail to boot on this change — is unknown from here. This needs saying
  before a deploy discovers it.
- **The OAuth2 login flow end to end.** `/docs/oauth2-redirect.html` is matched by
  the predicate and served as HTML, but completing an implicit-flow login needs
  the live Keycloak realm named in `KEYCLOAK_JWKS_URL`; no token was obtained.
  The browser check above loaded the page but did not click Authorize. The
  `oauth2RedirectUrl` the server now emits was read off `swagger-ui-init.js` and
  is well-formed, but it was never exchanged with Keycloak, and no client in the
  realm was checked for a matching redirect URI.
- **The guard was never seen firing inside a deployed container** — only in the
  unit suite and in the local `node dist/src/main.js` boot above.
- **Teskilat's runtime.** Only its `.env.example` changed; nothing was booted for
  that service.
- **`teskilat:build` was seen failing once and passing on every rerun**, and Nx
  flagged it as flaky. It reproduces on `common:build` finishing its
  `rimraf dist` while a dependent compiles. Nothing in this branch touches
  `libs/common` or any build config, so it reads as pre-existing, but the failing
  output was not captured before the retry overwrote it.

## Follow-ups

- **`apps/teskilat` keeps the unguarded flag.** `apps/teskilat/src/config/config.ts`
  is still `SWAGGER_ENABLED === "true"` with no production check. Teskilat has no
  `test` target (`apps/teskilat/project.json` declares only `lint`), so a guard
  there cannot be asserted, and its `config.ts` never had the MDRS-35 treatment
  either — `DB_PASSWORD` still falls back to `"password"`. Hardening that file is
  one coherent piece of work and belongs with the teskilat item already listed
  under MDRS-35's follow-ups. Only its `.env.example` was flipped here.
- **`apps/teskilat` reads the wrong variable name.** Its `config.ts` reads
  `SWAGGER_ENDPOINT` while `apps/teskilat/.env.example` ships `SWAGGER_PATH`
  (tedrisat uses `SWAGGER_PATH` in both places), so the template's value is
  ignored and the endpoint always falls back to `/docs`. Pre-existing; not
  touched here.
- **Teskilat has no CSP problem to fix.** Its `main.ts` calls
  `SwaggerModule.setup` without any header-stripping middleware, so Swagger UI
  there renders under the full helmet policy. Worth knowing before someone copies
  this fix across.
- **`libs/common`'s `helmet()` is all-or-nothing.** Any future route that needs a
  different policy will hit the same "remove it afterwards" pattern. A per-route
  helmet configuration in `applyGlobalMiddleware` would remove the need for this
  middleware entirely.
