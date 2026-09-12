# MDRS-69 — teskilat stops carrying tedrisat's assumptions

Base: `cb7e9636` (`chore(repo): MDRS-48 integrate twelve reviewed pull requests
into release/260817 (#44)`).

Two things were true of `apps/teskilat` and should not have been: it required a
database password for a service with no database, and it had no production
Swagger guard while sharing tedrisat's `SWAGGER_ENABLED` key. Both are closed
here. The third acceptance criterion — a runbook that documents configuration
that exists — follows from the first.

## 1. teskilat has no database code

**Verified by command, on this tree, before removing anything.**

`apps/teskilat/src` was 8 files, and is 10 on this branch — `config/swagger-env.ts`
and `swagger.ts` are the two additions:

```
$ grep -rn -E 'database|Database' apps/teskilat/src apps/teskilat/test
apps/teskilat/src/config/config.ts:10:  database: {
apps/teskilat/src/config/config.ts:15:    database: process.env.DB_NAME || "teskilat_db",

$ grep -rni -E 'drizzle|typeorm|prisma|\bpg\b|repository|DataSource|migrat' \
    apps/teskilat/src apps/teskilat/test apps/teskilat/package.json
apps/teskilat/src/load-env.ts:1:// MDRS-25: the workspace has one .env, ...
```

The only two hits for `database` are the config block itself; the only hit for
the ORM/driver/migration sweep is the word "migration" inside a comment about
MDRS-25's `.env` loader. Additionally:

* `apps/teskilat/package.json` declares **no** database client — no `pg`, no
  `drizzle-orm`, no ORM of any kind, in `dependencies` or `devDependencies`.
* There is no `DatabaseModule`, no `drizzle.config.ts`, no migrations directory
  under `apps/teskilat`.
* `AppModule` imports exactly `ConfigModule.forRoot` and `LoggerModule.forRoot`.
* `grep -rn 'config.get' apps/teskilat/src` returned three reads, all in
  `main.ts` at the time of the audit: `swagger.enabled`, `swagger.endpoint`,
  `port`. Nothing has ever read `database.*`. (On this branch the first two moved
  into `swagger.ts`; the set of keys read is unchanged.)
* `grep -rniE 'keycloak|authguard|jwt' apps/teskilat/src` returns nothing,
  confirming the runbook's claim about "the Keycloak settings" was also false.

### What was removed

`apps/teskilat/src/config/config.ts` — the whole `database` block, including

```ts
password: process.env.DB_PASSWORD || "password",
```

This is the half of MDRS-35 that was done for tedrisat and not here: a literal
credential default. Unreachable under docker-compose, which required the key
with `:?`, but reachable under `pnpm dev`. It is gone with the block; there is no
`requireDbPassword` equivalent to add in its place, because there is no
connection to guard.

`docker-compose.yml`, `services.teskilat.environment` — `DB_HOST`, `DB_PORT`,
`DB_SSL`, `DB_NAME`, `DB_USERNAME`, `DB_PASSWORD`, `AUTO_MIGRATIONS_ENABLED`,
`AUTO_MIGRATIONS_FOLDER`, and the `depends_on: medaris-db / service_healthy`
block. Counted from `docker compose config` on both trees, with the same `.env`:
the rendered teskilat environment goes from **21 keys to 13** — the eight above,
and nothing else.

### Measured before and after

`TESKILAT__DB_PASSWORD` was `:?`, so a value nothing read was mandatory to
render the file at all. With that key removed from a copy of `.env`:

```
# base cb7e9636
$ docker compose -f <cb7e9636 docker-compose.yml> --env-file <.env minus the key> config --quiet
error while interpolating services.teskilat.environment.DB_PASSWORD:
required variable TESKILAT__DB_PASSWORD is missing a value: set TESKILAT__DB_PASSWORD in .env

# this branch
$ docker compose --env-file <.env minus the key> config --quiet
(no output, exit 0)
```

The 13 that remain, and what reads each:

| Key | Read by |
|---|---|
| `ALLOWED_ORIGINS`, `ALLOWED_METHODS` | `libs/common/src/config/cors.config.ts`, via `applyGlobalMiddleware` |
| `NODE_ENV`, `PORT`, `SERVICE_NAME`, `LOG_LEVEL` | `apps/teskilat/src/config/config.ts` |
| `SWAGGER_ENABLED`, `SWAGGER_ENDPOINT` | same factory, now through `config/swagger-env.ts` |
| `OTEL_ENABLED`, `OTEL_EXPORTER_OTLP_ENDPOINT` | same factory, consumed by `src/otel.ts` |
| `OTEL_EXPORTER_OTLP_INSECURE`, `_PROTOCOL`, `_COMPRESSION` | the OpenTelemetry SDK's own environment reader, not this factory |

Every remaining key therefore has a reader, which is acceptance criterion 1.

## 2. teskilat's production Swagger refusal

**Decision: under `NODE_ENV=production`, teskilat never mounts Swagger UI,
whatever `SWAGGER_ENABLED` says, and there is no opt-in.**

`apps/teskilat/Dockerfile` pins `ENV NODE_ENV=production`, so this covers every
environment running the image.

MDRS-69's issue offered two options — extend tedrisat's `resolveSwaggerEnabled`
to teskilat, or give teskilat a `TESKILAT__SWAGGER_ENABLED` that does not inherit
the group key. Neither was taken: both leave a `SWAGGER_ENABLED` value that
publishes a production teskilat's schema, and the requirement is that no value of
that flag does.

**Where the boundary actually is.** `NODE_ENV` is the guard's own condition, and
`docker-compose.yml:124` interpolates it as
`${TESKILAT__NODE_ENV:-${API__NODE_ENV:-production}}` — so
`TESKILAT__NODE_ENV=development` plus `TESKILAT__SWAGGER_ENABLED=true` on the
production image *does* serve `/docs`. That is not a hole; it is what "under
production" means, and it is the route the suppression notice itself recommends.
An earlier draft of this record said "no value of any variable" publishes the
schema, which was wrong and is corrected here. The true statement is narrower and
still worth having: no value of `SWAGGER_ENABLED` publishes it, the only way in
is to stop running production, and doing that also moves `ALLOWED_ORIGINS` into
the branch that accepts a `*` origin list — so it is a visible decision rather
than a documentation toggle.

### Why it resolves to `false` instead of throwing

tedrisat throws (MDRS-33) so that a deploy still carrying `SWAGGER_ENABLED=true`
is told which variable to change rather than quietly losing its documentation
endpoint. teskilat deliberately does not, and the reason is the shared key:
`.env.example` ships the flag once as `API__SWAGGER_ENABLED`, and
`docker-compose.yml` hands both services
`SWAGGER_ENABLED: ${<APP>__SWAGGER_ENABLED:-${API__SWAGGER_ENABLED:-false}}`. A
throw in teskilat's config factory fires before `listen()`, so enabling
tedrisat's docs through the group key would put teskilat into a restart loop — a
documentation switch on one service becoming an outage on another. Refusing to
mount is the entire security requirement; refusing to boot adds nothing to it
and couples the two services' availability.

The suppression is not silent: `swaggerSuppressedByProduction` distinguishes
"suppressed" from "never asked for", and `main.ts` logs
`SWAGGER_PRODUCTION_SUPPRESSION_NOTICE` through the app logger in the first case
only, so an operator who set the flag learns it from the log instead of from a
404.

### Proved as behaviour, not as a boolean

`main.ts` self-invokes `bootstrap()` and calls `app.listen`, so a test cannot
import it to ask whether `/docs` is served. The mount decision was extracted to
`apps/teskilat/src/swagger.ts` (`mountSwagger`), which `main.ts` now calls, and
`apps/teskilat/test/e2e/swagger.e2e.spec.ts` drives that function against a real
Nest application:

| Environment | Asserted |
|---|---|
| `NODE_ENV=production`, `SWAGGER_ENABLED=true` | `GET /docs` → **404**, `GET /docs-json` → **404**, `mounted === false` |
| + `SWAGGER_ALLOW_IN_PRODUCTION=true` | `GET /docs` → **404** — tedrisat's opt-in is ignored |
| `NODE_ENV=production`, flag on | exactly one warning logged, naming `SWAGGER_ENABLED=true` |
| `NODE_ENV=production`, flag on | `GET /health` → **200** — the guard does not take the service down |
| `NODE_ENV=development`, `SWAGGER_ENABLED=true` | `GET /docs` → **200**, no warning |
| `NODE_ENV=development`, flag off | `GET /docs` → **404**, no warning |
| config compiled under development (`enabled: true`), live env production | `GET /docs` → **404**, `GET /docs-json` → **404**, one warning |
| config compiled with the flag off, live env permits it | `GET /docs` → **404** |

The `development` → 200 case is there on purpose: without it a broken mount
would read as a passing guard, and every 404 above would be vacuous.

### The guard is authoritative in `mountSwagger`, not only in the factory

The last two rows are a review finding, fixed here. The first version of
`mountSwagger` warned from the live `process.env` and then mounted from the
`swagger.enabled` value the config factory had cached at module-compile time. Its
docstring claimed "no argument to this function can mount the UI there", and that
was false of the function: hand it a `ConfigService` whose factory ran before
`NODE_ENV=production` was set, and it logged
`SWAGGER_PRODUCTION_SUPPRESSION_NOTICE` — "this service never mounts Swagger UI"
— and mounted it on the next line.

In a real container this was never reachable: the image pins
`ENV NODE_ENV=production`, so the factory always resolves `false` there. It was a
false docstring and a guard that did not enforce its own claim, not a live
exposure. It is enforced now — `mountSwagger` takes an `env` parameter, both
halves of the decision read the same snapshot, and the mount requires
`swaggerEnabledUnlessProduction(env)` **and** `config.get("swagger.enabled")`.

**The new test is not vacuous — measured both ways.** With the two-layer guard in
place, `nx run teskilat:test` is 24/24. With the `swaggerEnabledUnlessProduction(env)`
term temporarily removed, leaving the original single-layer body, the same run is
**1 failed | 23 passed**, and the failure is exactly "refuses even when the cached
config says Swagger is enabled". The mirror-image row (live env permits, compiled
config refuses) is there so neither layer is load-bearing alone.

One further thing measured while writing the suite: calling `mountSwagger`
**after** `app.init()` leaves `/docs` a 404 even with the flag on. The suite
therefore mounts before `init()`, which is also main.ts's order —
`NestFactory.create` does not initialise the application, `app.listen()` does.

### Also fixed while in `main.ts`

The `DocumentBuilder` said `setTitle("Tedrisat Service API")` and
`.addTag("tedrisat", "Education management endpoints")` — copied wholesale from
the other service. teskilat's document now names teskilat.

## 3. The runbook

`docs/runbooks/deploy-teskilat-api.md`:

* §0 no longer claims `config.ts` "still defaults `DB_PASSWORD` and the Keycloak
  settings". `DB_PASSWORD` is gone; the Keycloak settings never existed
  (`grep -rniE 'keycloak|authguard|jwt' apps/teskilat/src` → nothing).
* §0 no longer points at `apps/teskilat/.env.example`, which does not exist —
  since MDRS-25 the workspace has one template, at the root.
* §0 gained a "What teskilat does *not* need" table, so a deployment is not
  configured for `DB_*`, `AUTO_MIGRATIONS_*`, `KEYCLOAK_*` or
  `SWAGGER_ALLOW_IN_PRODUCTION` by analogy with tedrisat.
* A new §5 documents the Swagger rule and the tedrisat/teskilat difference in a
  table; "Known blockers" became §6.

`.env.example`: the `TESKILAT__DB_*` comment no longer describes a literal
`"password"` fallback that is gone, and the `API__SWAGGER_ENABLED` comment now
states both services' production behaviour rather than only tedrisat's.

## Interaction with the other open pull requests

None of these were merged when this branch was cut from `cb7e9636`; this branch
does not contain them.

**#53 (MDRS-68) — `docker/init-db.sh`, compose's `medaris-db` block.** #53
replaces `docker/init-db.sql` with an executable `init-db.sh` and hands
`medaris-db` the same `TESKILAT__*` interpolations the app services use, so the
script provisions `teskilat_db` for a `teskilat` role. This branch does not touch
`medaris-db`, `docker/init-db.*`, or the `MEDARIS_POSTGRES_*` keys, and it
deliberately **keeps** `TESKILAT__DB_NAME`, `TESKILAT__DB_USERNAME` and
`TESKILAT__DB_PASSWORD` in `.env.example` — removing them would leave #53's
`${TESKILAT__DB_PASSWORD:?}` on `medaris-db` unrenderable. The two changes
compose without conflict; `teskilat_db` keeps being provisioned, and stops being
handed to a service that never opens it.

**Corrected after review — the tense matters.** The first version of this branch
wrote, in `.env.example`, `docker-compose.yml` and the runbook, that those three
keys are the credentials `docker/init-db.*` uses to provision `teskilat_db`. That
is true only **after** #53 lands. On this tree it is false, and measurably so:

```
$ sed -n '17,19p' docker/init-db.sql
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'teskilat') THEN
    CREATE USER teskilat WITH PASSWORD 'teskilat';
  END IF;

$ grep -n 'TESKILAT__' docker-compose.yml   # none inside services.medaris-db
```

The role's password is hardcoded, and no `TESKILAT__*` key is interpolated by
`medaris-db`. So after this branch **nothing on this tree reads the three keys**:
an operator who followed the old comment and set `TESKILAT__DB_PASSWORD` to a
real secret would still get a `teskilat` role whose password is the literal
`teskilat`. Worse, `.env.example` contradicted itself six lines apart — the
tedrisat block says its password is required "rather than falling back to
docker/init-db.sql's credential". All three files now say what is true today
(read by nothing, kept for #53) and name #53 as the change that makes them live.

**#51 (MDRS-70) — `tools/ci/assert-env-compose-parity.mjs`.** That gate's rule is
"a key whose prefix names a compose service must be interpolated inside that
service's `environment:` block, or be listed with a reason", and `PREFIX_TARGETS`
maps `TESKILAT → ["teskilat"]`. After this branch, `TESKILAT__DB_NAME`,
`TESKILAT__DB_USERNAME` and `TESKILAT__DB_PASSWORD` are no longer interpolated
inside `services.teskilat.environment`, so **the gate will fail on those three
keys once #51 merges** unless it is told about them. The correct entry is not
`UNMAPPED_ON_PURPOSE` — after #53 they are mapped, into `medaris-db`, which is a
service the prefix does not name. See the follow-up below. This branch does not
edit that file: it does not exist on `main`, and #51's own PR is where the shape
of the exemption belongs.

**#50 (MDRS-32) — tedrisat's Swagger surface.** Disjoint. This branch changes no
tedrisat file; `apps/tedrisat/src/config/swagger-env.ts` is read for comparison
and left alone.

**#48, #45, #52, #49, #47, #46.** No overlap with the files touched here beyond
`docker-compose.yml` and `.env.example` as whole files. No conflict was observed;
`git merge-base` was not exercised against each branch — see "not verified".

## Follow-ups — not opened as Linear issues

Per the working rules for this chain, these are recorded here and in the pull
request body rather than filed:

1. **`TESKILAT__DB_*` and the #51 parity gate.** Whoever lands #51 after this
   branch must classify the three keys. They are database-provisioning
   credentials whose prefix names an app; the honest fix is a
   `PROVISIONING_KEYS` category (or extending `PREFIX_TARGETS` so a key may
   legitimately target `medaris-db`), not an `UNMAPPED_ON_PURPOSE` entry, which
   would claim they reach nothing when after #53 they reach the database.
2. **The dead `redis` block in both API config factories.**
   `apps/teskilat/src/config/config.ts` still carries
   `redis: { host, port, password }`, and nothing reads it — there is no Redis
   client in either app's `package.json`, and no `REDIS_*` key in `.env.example`
   or `docker-compose.yml`. It was left in place because
   `apps/tedrisat/src/config/config.ts:24` carries an identical block: removing
   it from one side only would create exactly the asymmetry this task exists to
   close. It should go from both, in one change.
3. **`SWAGGER_ENDPOINT` vs `SWAGGER_PATH`.** teskilat reads `SWAGGER_ENDPOINT`;
   tedrisat reads `SWAGGER_PATH`. #44 papered over it in compose by mapping
   `SWAGGER_ENDPOINT: ${TESKILAT__SWAGGER_PATH:-...}`. Under `pnpm dev` the two
   services still disagree about the name of the same setting, and #51's header
   already notes that its gate cannot see this class of divergence.
4. **`AppService.getHealth`** hardcodes `"development"` as its environment string
   (`apps/teskilat/src/app.service.ts:20`), so a production container reports
   `development` on `/health`. Noticed here, not fixed: it is not configuration
   hygiene and belongs with whatever owns the health payload.
5. **Harvesting a `teskilat.json` spec now needs a non-production run.**
   `libs/services/swagger-docs/` holds only `tedrisat.json` today, and its README
   invites a `teskilat.json` to be added by hand. Whoever adds it must take the
   document from a `NODE_ENV`-not-production run, because a production image
   serves no `/docs-json` at all. This does not affect MDRS-58, which regenerates
   the **tedrisat** spec and client: no tedrisat file is touched here, and no
   teskilat spec or generated client exists to drift.

## Review findings and what they changed

`/code-review` at effort `high` raised four; all four are closed above or below.

| # | Where | Outcome |
|---|---|---|
| 1 | `.env.example`, `docker-compose.yml`, the runbook | **Fixed.** The present-tense provisioning claim was false on this tree. See "Corrected after review" above. |
| 2 | the runbook's §5, this record | **Fixed.** "No variable can publish the schema" was overstated — `TESKILAT__NODE_ENV` can. See "Where the boundary actually is". |
| 3 | `apps/teskilat/src/swagger.ts` | **Fixed.** The guard now enforces itself; `env` is threaded through both halves. Proved non-vacuous by running the suite against the old body. |
| 4 | `apps/teskilat/src/swagger.ts` | **Fixed.** The unreachable `\|\| "/swagger"` fallback — which also named a different path than the documented `/docs` — is replaced by `config.getOrThrow<string>("swagger.endpoint")`, so there is no second default to disagree with the first. |

A fifth finding came from the pull request's own review (the AI multi-lens
gate), after the four above were closed:

| # | Where | Outcome |
|---|---|---|
| 5 | `apps/teskilat/src/config/swagger-env.ts` | **Fixed.** Both services exported a `resolveSwaggerEnabled` from the same relative path with opposite production semantics — tedrisat throws unless `SWAGGER_ALLOW_IN_PRODUCTION=true`, teskilat refuses with no opt-in — so the divergence was invisible at the call site and a config factory could be copied between the apps without the name changing. teskilat's is now `swaggerEnabledUnlessProduction`; the name states the policy wherever it is used. The reviewer's other option — one `libs/common` resolver taking the policy as a parameter, next to `cors.config.ts` — is the right shape if a third service ever needs the rule, and is noted in the follow-ups rather than done here, because it would move tedrisat's MDRS-33 code in a teskilat task. |

Three things the reviewer chased and cleared, recorded so nobody repeats the
work:

* **Swagger UI renders fine under helmet.** `main.ts` runs
  `applyGlobalMiddleware` (helmet) before `mountSwagger`, and teskilat has no
  equivalent of tedrisat's `swagger-csp.ts` relaxation — so a blank page was the
  obvious worry. Measured through main.ts's real pipeline: `/docs` 200, helmet
  sends `script-src 'self'`, and all three of Swagger's script tags are
  same-origin files, so CSP allows them; `swagger-ui-init.js`, `-bundle.js`,
  `.css` and `-json` are all 200. tedrisat needs its relaxation for the OAuth2
  popup (COOP), which teskilat's `DocumentBuilder` does not configure. No action.
* **The `"Teskilat Service API"` title change breaks no generated client** —
  `libs/services` generates only from `tedrisat.json`.
* **CI has no `docker compose config` step**, so dropping the interpolations
  could not have failed a check; the local render is the only evidence, which is
  why it is written out above.

`/security-review` was run a second time over the fixed diff and again found
nothing at or above its threshold. It traced both orderings of the two-layer
guard and confirmed the refusal precedes `SwaggerModule.createDocument`, so no
route is registered; that `mountSwagger` is the only mount site in the app (the
`@ApiTags`/`@ApiOperation` decorators on `app.controller.ts` are reflection
metadata and serve nothing on their own); and that `getOrThrow` cannot change the
outcome, being reachable only after both guards pass and always supplied by the
factory. It noted one deliberate limitation worth writing down: the guard
compares `NODE_ENV` to the exact string `"production"`, so a nonstandard spelling
like `Production` would not trigger it. That is the same convention
`libs/common/src/config/cors.config.ts` and tedrisat already follow, and it is
left consistent with them rather than diverging here.

## Not verified

* **No container was built or run.** The compose evidence above is
  `docker compose config` — interpolation and rendering — not a `docker compose
  up`. That teskilat starts and serves `/health` with the DB variables absent is
  asserted by the Nest e2e suite against a real application instance, not
  against the image.
* **Nothing was deployed.** The runbook's Coolify `TODO(verify against Coolify)`
  markers are untouched and still unanswered.
* **Merge-base checks against the nine other open branches** were not run. The
  interaction analysis above is from reading each pull request's changed-file
  list, not from attempting a merge.
* **`SWAGGER_PRODUCTION_SUPPRESSION_NOTICE` reaching a real container log.** The
  e2e suite asserts `mountSwagger` calls the logger exactly once with that text,
  through an injected `{ warn }`. That `LoggerFactory.create()`'s logger renders
  it at warn level in a running container was not observed.

## Gate — measured on this branch

```
pnpm nx run-many -t typecheck --skip-nx-cache        16 projects  ✅
pnpm nx run-many -t test --skip-nx-cache              3 projects  ✅  248 tests / 19 files
pnpm nx run-many -t build --skip-nx-cache             8 projects  ✅
pnpm nx run-many -t lint --skip-nx-cache             16 projects  ✅
pnpm nx run-many -t module-boundaries --skip-nx-cache 16 projects  ✅
pnpm run lint:root                                               ✅  0 errors / 91 warnings / 27 infos, all at baseline
pnpm run assert:release-config                                   ✅  7 components, chain intact
pnpm nx run teskilat:depcheck                                    ✅  no issue
```

`CLAUDE.md` still says "91 tests / 10 suites"; that is stale. The base
`cb7e9636` measures **226 tests / 17 files** (tedrisat 224/15, teskilat 2/2).
This branch adds 22 tests in 2 files — teskilat goes 2/2 → 24/4 — for **248
tests / 19 files**. (It was 246/19 before the review fixes; the two-layer guard
added two e2e cases.) `tedris-web:test` is a token-processing target and
contributes no vitest suites, which is why `run-many` reports 3 projects and two
vitest summaries.

Neither of the two known flakes (`tedrisat:test` Testcontainers,
`tedrisat:typecheck` racing `common:build`'s `rimraf dist`) fired; every gate
above passed on its first run.

`pnpm run security-check` also passes (`audit-ci`: no advisory outside the
existing allowlist; `depcheck`: no unused dependency in any of the three
projects that have the target). `pnpm run assert:traceability` cannot be run
locally — it reads a `pull_request` event payload and aborts without one; it runs
as the PR's **Traceability** check instead.

## CI on pull request #54

Measured at `4d374b64`:

```
Verify                              pass
Security gates                      pass
Commit hygiene                      pass
Traceability                        pass
CodeQL                              pass
Analyze (javascript-typescript)     pass
Analyze (actions)                   pass
AI Multi-Lens Review Gate           fail  ← not a finding, see below
AI review preflight                 pass
```

The AI gate is red because `PREFLIGHT_MODE=queued`: the run landed at 11:xx UTC,
outside the `16:00-21:00 UTC` review window, and the author is not a repository
admin, so no lens ran. Its own summary says so — "This check is red because
deferred is not reviewed, not because a finding was raised." The nightly drain
runs the lenses when the window opens and the check resolves itself then. No
label was toggled to force a review: that costs $4-15 on a shared subscription
and is an admin decision.

`/security-review` was run locally over this diff and found nothing at or above
its reporting threshold. It independently confirmed there is no second Swagger
mount point anywhere in `apps/` or `libs/`, that teskilat never imports
`swagger-csp.ts` so no CSP/COOP relaxation survives the unmounted UI, and that
`SWAGGER_PRODUCTION_SUPPRESSION_NOTICE` carries variable names and no values.
