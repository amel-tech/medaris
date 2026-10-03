# MDRS-129 — `/health` reports the configured environment

Base: `f5a71db`. Two services, two unit specs, one e2e assertion
(`git diff --stat f5a71db 6c970fc -- apps` → `5 files changed`: the two
`app.service.ts`, the two `app.controller.spec.ts`, `app.e2e.spec.ts`). The
`HealthCheckDto` shape is unchanged.

## What was done

- `apps/tedrisat/src/app.service.ts` and `apps/teskilat/src/app.service.ts`
  no longer build the health body from literals. `ConfigService` is injected
  (a value import — see `CLAUDE.md` on `import type` and Nest DI) and
  `getHealth()` reads `serviceName`, `version` and `environment` from each app's
  configuration factory with `getOrThrow`.
- The module-level `const { version } = configuration()` in both services is
  gone with it: `version` now comes through `ConfigService` like the other two
  fields, so importing the service no longer evaluates the configuration factory
  a second time.
- `apps/tedrisat/test/unit/app.controller.spec.ts` and
  `apps/teskilat/test/unit/app.controller.spec.ts` load the **real**
  configuration factory (`ConfigModule.forRoot({ load: [configuration],
  ignoreEnvFile: true })`) and assert:
  - `NODE_ENV=production` → `environment: "production"`;
  - `NODE_ENV` unset → `environment: "development"`;
  - `SERVICE_NAME` set → `service` is that value; unset → the package name.
  The teskilat spec already existed (the issue says it did not); it covered
  `getHello()` only and now covers the health body too.
- `apps/tedrisat/test/e2e/app.e2e.spec.ts` compared `service` against the
  literal `"tedrisat"`. It now compares `service` and `environment` against the
  running app's `ConfigService`.

## Behaviour change an operator will see

`service` follows `SERVICE_NAME`. `.env.example` ships
`TEDRISAT__SERVICE_NAME=tedrisat-service` and
`TESKILAT__SERVICE_NAME=teskilat-service`; where the key is not set, the value
is the package name, `@medaris/tedrisat` / `@medaris/teskilat`. The body used to
say `tedrisat` / `teskilat` whatever the environment held. Within the paths
searched, nothing reads the `service` field other than the two unit specs and
`apps/tedrisat/test/e2e/app.e2e.spec.ts` above: `git grep -n
"\.service\b\|\"service\"" -- .github tools apps/tedrisat/Dockerfile
apps/teskilat/Dockerfile docker-compose.yml` returns one line, a comment in
`docker-compose.yml` naming `jwt-verifier.service.ts`. Other paths were not
searched.

## Verified

- `grep -rn '"development"' apps/*/src/app.service.ts` is empty.
- `pnpm nx affected -t typecheck test build lint module-boundaries
  --base=f5a71db --skip-nx-cache` (with `NODE_ENV` unset): `tedrisat`,
  `teskilat` and the tasks they depend on (`common`, `env`) green.
- `node tools/ci/assert-openapi-spec-fresh.mjs`: 46 paths, identical to what the
  exporter writes — the OpenAPI spec did not change.

## Not verified

- The deployed health endpoints. `api-tedrisat-dev` and `api-teskilat-dev`
  should report `"environment":"production"` after the next development deploy
  (the images pin `ENV NODE_ENV=production`); that measurement needs the deploy
  and is left for a human to record on the issue.

## Follow-up

- Whether the deployed `service` value should be the package name or a
  `SERVICE_NAME` set per Coolify application is a deployment decision, not a code
  one; the code now reports whichever is configured.
