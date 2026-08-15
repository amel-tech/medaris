# MDRS-34 — Parse and validate the CORS origin config

Base: `origin/main` at `7210c91`.

`libs/common/src/config/cors.config.ts` computed `origin: (process.env.ALLOWED_ORIGINS || "*").split(",")`
in a module-level constant. Two defects followed from that single line, and both
were measured against a booted tedrisat before anything was changed.

## What the old code actually did

A postgres container was started on port 5439 from `docker/init-db.sql`, and
`apps/tedrisat` was booted with `ALLOWED_ORIGINS` unset.

```
$ curl -i -X OPTIONS http://localhost:3001/kosks \
    -H 'Origin: http://localhost:4000' -H 'Access-Control-Request-Method: GET'
HTTP/1.1 204 No Content
X-Powered-By: Express
Vary: Origin, Access-Control-Request-Headers
Access-Control-Allow-Methods: GET,HEAD,PUT,PATCH,POST,DELETE
Content-Length: 0
```

**It failed closed.** No `Access-Control-Allow-Origin` header at all. The issue
reasoned this from the `cors` package's documented semantics; it is now
observed. `"*".split(",")` yields `["*"]`, and the `cors` package compares each
array entry to the request `Origin` as an exact string — no origin is ever the
literal `*`, so no header is emitted and every browser call is rejected. The
list also carried no `OPTIONS`, and neither `Access-Control-Allow-Headers` nor a
`credentials` setting was present.

The second defect is one the issue did not name. The constant was evaluated the
moment `@medaris/common` was imported, which is before `ConfigModule` runs
dotenv, so a value in `apps/tedrisat/.env` never reached it. Measured on the
same unmodified code, with `apps/tedrisat/.env` containing
`ALLOWED_ORIGINS=http://localhost:4002` and nothing in the shell environment:

```
$ curl -i -X OPTIONS http://localhost:3001/kosks \
    -H 'Origin: http://localhost:4002' -H 'Access-Control-Request-Method: GET'
HTTP/1.1 204 No Content
Vary: Origin, Access-Control-Request-Headers
Access-Control-Allow-Methods: GET,HEAD,PUT,PATCH,POST,DELETE
```

Still no `Access-Control-Allow-Origin`. Only a variable already exported into
the process could ever have configured CORS.

## What changed

- `libs/common/src/config/cors.config.ts` is now a set of pure functions —
  exported: `resolveAllowedOrigins`, `resolveAllowedMethods`,
  `buildCorsConfig`; internal: `parseCsv`, `allowsWildcard`, `assertBareOrigin`,
  `parseOrigin`, `fail` — each environment-reading one taking an explicit
  `NodeJS.ProcessEnv` that defaults to `process.env`. The exported constant
  `corsConfig` is gone; nothing outside `setupMiddleware.ts` referenced it.
  - A wildcard is passed as the bare string `"*"`, never inside an array.
  - The wildcard fallback is allowed in exactly two places: `NODE_ENV=development`,
    and a Jest worker (`NODE_ENV=test` **and** `JEST_WORKER_ID` set). Anywhere
    else — production, staging, an unset `NODE_ENV` — an unset, empty or
    wildcard-containing list throws at boot with a message naming
    `ALLOWED_ORIGINS` and quoting the offending `NODE_ENV`.

    This is deliberately not `NODE_ENV !== "production"`.
    `apps/tedrisat/src/config/security-env.ts:19-31` refuses to trust `NODE_ENV`
    for the same reason: a staging container or a CI job reusing a compose file
    carries whatever the deployment set. Under a `!== "production"` test such a
    deployment would be handed `origin: "*"` and boot green — the open door this
    task exists to close.
  - Every kept entry must be a bare origin. `new URL(value).origin === value`,
    plus a wildcard-host check because `new URL` accepts `https://*.medaris.app`
    and hands it back unchanged. A trailing slash, a path, a scheme-less host
    and a wildcard host are all refused, in every environment — the `cors`
    package would match none of them, so they reproduce the very "no
    `Access-Control-Allow-Origin`" symptom this task removed, but silently.
  - `OPTIONS` is appended to whatever `ALLOWED_METHODS` lists; entries are
    trimmed, uppercased and de-duplicated. A value that parses to nothing —
    unset, empty, or only separators — falls back to the default list rather
    than leaving `OPTIONS` alone in it.
  - `allowedHeaders: ["Authorization", "Content-Type"]` and
    `credentials: false` — the clients authenticate with a Bearer header
    (`libs/services/src/tedrisat/api-factory.ts:68-76`), not with cookies.
  - `exposedHeaders: ["Content-Disposition"]`. `ExcelService` returns
    `attachment; filename=…` on the flashcard template and export endpoints
    (`libs/common/src/excel/excel.service.ts:71,130`), and `Content-Disposition`
    is not CORS-safelisted, so a cross-origin `fetch` could download the bytes
    without being able to read the file name. Pinning the header surface is what
    made this worth fixing here rather than leaving it latent.
- `libs/common/src/bootstrap/setupMiddleware.ts` calls `buildCorsConfig()`
  inside `applyGlobalMiddleware`, so the environment is read after the Nest
  container exists and dotenv has run.
- `libs/common/src/index.ts` now re-exports `./config`. It did not before, so
  the parser was unreachable from `@medaris/common` and could not be tested.
  `libs/common` has one entry point and no `exports` map, so this makes the
  three resolvers public API of the package both services depend on. The
  comma splitter is deliberately **not** exported — it is a private string
  helper, covered through the two resolvers instead.
- `apps/tedrisat/.env.example` and `apps/teskilat/.env.example` list the four
  web-app origins (`4000` tedris, `4001` nizam, `4002` nazir, `4003` landing)
  instead of `*`, and add `OPTIONS` to `ALLOWED_METHODS`. The root
  `.env.example` already carried concrete origins and needed no change.
- `docs/runbooks/deploy-tedrisat-api.md` and `docs/runbooks/deploy-teskilat-api.md`
  gain a §0 listing the variables the container refuses to start without. Both
  Dockerfiles set `ENV NODE_ENV=production` in the runner stage
  (`apps/tedrisat/Dockerfile:100`, `apps/teskilat/Dockerfile:100`), so this
  change makes `ALLOWED_ORIGINS` a hard requirement for every deployed
  container — and the deploy workflow only pushes the image and fires the
  webhook, so it stays green while the service restart-loops.
- `apps/tedrisat/test/unit/cors.config.spec.ts` — 34 cases over the parser.
  `libs/common` has no `test` target (only `lint`, in `libs/common/project.json`),
  and MDRS-34 asked for the coverage here rather than adding one. This is the
  only spec in either app that exercises library code — not a precedent. See
  the follow-up below.

## What was verified

Every acceptance criterion was exercised against a booted tedrisat on
`localhost:3001`, backed by a `postgres:17-alpine` container.

| Case | Result |
| --- | --- |
| Baseline, `ALLOWED_ORIGINS` unset | 204, **no** `Access-Control-Allow-Origin` (quoted above) |
| Baseline, value only in `.env` | 204, **no** `Access-Control-Allow-Origin` (quoted above) |
| `ALLOWED_ORIGINS=http://localhost:4000`, `Origin: http://localhost:4000` | 204 · `Access-Control-Allow-Origin: http://localhost:4000` · `Access-Control-Allow-Methods: GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS` · `Access-Control-Allow-Headers: Authorization,Content-Type` |
| same server, `Origin: https://evil.example` | 204, no `Access-Control-Allow-Origin` |
| `NODE_ENV=production`, `ALLOWED_ORIGINS` unset | boot refused: `ALLOWED_ORIGINS is not usable: it is unset or empty and NODE_ENV is "production"…` |
| `NODE_ENV=production`, `ALLOWED_ORIGINS=*` | boot refused: `ALLOWED_ORIGINS is not usable: it contains "*" and NODE_ENV is "production"…` |
| `NODE_ENV=production`, `ALLOWED_ORIGINS=" https://tedris.medaris.app , https://nizam.medaris.app "` | boots; allowed origin echoed, `https://evil.example` gets no header |
| Value supplied only through `apps/tedrisat/.env` (new code) | 204 · `Access-Control-Allow-Origin: http://localhost:4002`; an origin absent from the file gets no header |
| `NODE_ENV=staging`, `ALLOWED_ORIGINS` unset | boot refused: `…it is unset or empty and NODE_ENV is "staging"` |
| `NODE_ENV=staging`, `ALLOWED_ORIGINS=*` | boot refused: `…it contains "*" and NODE_ENV is "staging"` |
| `NODE_ENV=production`, `ALLOWED_ORIGINS=https://tedris.medaris.app/` | boot refused: `…is not a bare origin…; write "https://tedris.medaris.app" instead` |
| `NODE_ENV=production`, valid list, allowed origin | 204 · `Access-Control-Allow-Origin: https://tedris.medaris.app` · `Access-Control-Expose-Headers: Content-Disposition` |
| `NODE_ENV=development`, `ALLOWED_ORIGINS` unset | 204 · `Access-Control-Allow-Origin: *` — the real wildcard, not `["*"]` |

Repository gate, all `--skip-nx-cache`: `typecheck` 16 projects, `test`
**140 tests / 12 suites** (tedrisat 138/10, teskilat 2/2 — up from 106/11 by
this task's 34 cases), `build` 8, `lint` 16, `module-boundaries` 16, plus
`tools/ci/biome-ratchet.mjs` at baseline. `CLAUDE.md` and `README.md` carry the
new totals.

## What was not verified

- **teskilat was never booted.** It shares `applyGlobalMiddleware`, so the same
  code path runs, but only tedrisat was exercised with curl.
- **No browser was involved.** The preflight responses were read with curl; a
  real cross-origin `fetch` from one of the web apps was not performed, and no
  client-side call to these APIs exists yet.
- **`credentials: false` was not tested against a cookie-bearing request** — no
  client sends one today.
- **The production refusal was measured with a valid database reachable.** The
  ordering against other boot failures (`NestFactory.create` runs first, so a
  database error would surface before the CORS error) was observed only
  incidentally, not tested deliberately.

## Operational precondition

`ALLOWED_ORIGINS` must exist in the Coolify configuration of both API services
**before** a build containing this change is deployed. Both runner stages set
`ENV NODE_ENV=production`, so without it the container throws in
`applyGlobalMiddleware` and restart-loops, while
`.github/workflows/tedrisat-api.yaml` reports success — it only pushes the image
and fires the webhook. The runbooks now carry this in §0. This was raised in
review and is the one item that cannot be closed from inside the repository.

## Follow-ups

- **`apps/tedrisat/src/otel.ts` imports `configuration()` at module load**, so
  `apps/tedrisat/.env` is not yet loaded when the security variables are read —
  a developer who puts `DB_PASSWORD` only in `.env` gets the MDRS-35 refusal.
  This task moved CORS off that path but did not move `otel.ts`; not filed.
- Once a browser-side call to either API lands, re-run the preflight from a real
  page rather than curl. `NEXT_PUBLIC_TEDRISAT_API_BASE_URL` is declared in
  `apps/tedris/env.ts:25` but still unused.
- **Move this spec into `libs/common` — belongs with MDRS-20.** Review raised
  three consequences of testing library code from `apps/tedrisat/test/unit/`,
  all of them fair: the spec asserts against the built `dist/` rather than
  source (`@medaris/common` resolves through the package `main`; there is no
  source path alias), `apps/tedrisat/jest.config.json` sets
  `collectCoverageFrom` to `src/**` so these cases count toward no coverage
  figure, and teskilat boots the same parser with no coverage of its own.
  Fixing it properly means giving `libs/common` a real `test` target — it has
  only `lint` in `libs/common/project.json`. That is deferred rather than done
  here for two reasons: MDRS-34 explicitly specified this placement, and MDRS-20
  is migrating the repository from Jest to Vitest, so adding a fourth Jest
  project now would enlarge that task's surface. The narrower harm — a private
  helper becoming public API — was fixed instead by un-exporting the splitter.
