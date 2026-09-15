# MDRS-86 — Wire the Coolify deployments to `medaris`

MDRS-16 rebuilt the seven deploy workflows and MDRS-17 the release config, but
nothing had ever been deployed from this repository. This record holds what was
read from Coolify on 2026-09-15, what that changed about the plan, and what this
pull request carries. Everything below is copied from a command's output or an
API response; where something was *not* verified it says so.

## 1. What Coolify actually runs

Read through the Coolify API (`GET /api/v1/applications/<uuid>`, project
`bo8c4og8c88s0ocw8cos0080`) on 2026-09-15. Coolify version 4.1.1.

| Application | uuid | Server | Image Coolify pulled | Tag | Port | Environment |
| -- | -- | -- | -- | -- | -- | -- |
| `tedrisat-service` | `uk08w4w8gkkgwossks8wgock` | mdrs2 | `ghcr.io/amel-tech/madrasah-backend-tedrisat-api` | `tedrisat-dev` | 3001 | development |
| `teskilat-service` | `hswgow0040s8k0wg8oggcos4` | mdrs2 | `ghcr.io/amel-tech/madrasah-backend-teskilat-api` | `teskilat-dev` | 3002 | development |
| `tedris-web` | `qsws0s8sw0w4cg80g0084ogs` | mdrs1 | `ghcr.io/amel-tech/madrasah-frontend-tedris-web` | `tedris-dev` | 4000 | development |
| `nizam-web` | `fkc4gcgo884wk84sssgc8oso` | mdrs1 | `ghcr.io/amel-tech/madrasah-frontend-nizam-web` | `nizam-dev` | 4001 | development |
| `nazir-web` | `rcwww0wkosws0g8ks8oks4c4` | mdrs1 | `ghcr.io/amel-tech/madrasah-frontend-nazir-web` | `nazir-dev` | 4002 | development |
| `landing-web` | `r4s0cscgkcow0s8gg0wco4kw` | mdrs1 | `ghcr.io/amel-tech/madrasah-frontend-landing-web` | `landing-dev` | 4003 | development |

All six have `build_pack: dockerimage` — Coolify never builds from git, the
GHCR image is exactly what runs. The project's `production` environment holds
nothing. Health checks were disabled on all six. Keycloak is a separate
`keycloak-with-postgres` service in the *Amel-Tech Auth* project, which serves
applications outside Medaris and is **out of scope for any change**.

### The tag nobody moves any more

The workflows MDRS-16 rebuilt push `latest`, `<semver>` and `sha-<short>`.
Coolify pulled none of those. `<app>-dev` was produced by the two old
repositories' `ci-dev.yaml` — build on every push to `main`, push `<app>-dev`,
call the Coolify webhook. MDRS-15 deleted those files as "containing no CI",
which was true; they contained the deploy. Verified against GHCR anonymously
(`/v2/amel-tech/<image>/tags/list`): every old image carries both the semver
tags and one `-dev` tag, and the `-dev` tags were last built 2026-06-17
(`madrasah-backend` at `c885f6d`) and 2026-06-18 (`madrasah-frontend` at
`c0eaf27`). The running fleet is therefore three months behind `main` and
predates MDRS-30/33/34/35, so none of the strict runtime keys are needed by what
runs today and all of them are needed by the first `medaris` image.

**Decision:** `development` pulls `latest`. It is the tag the current workflows
already move on every default-branch run and every release, so no workflow
edit is needed for it; a future `production` pins `<semver>`, which the release
path already produces. What replaces `ci-dev.yaml` is the `push: main` trigger
on `deploy-affected.yaml` — still to be added, after the one watched
`dry_run: false` run its header requires.

### Environment keys, read without values

The token had no `read:sensitive`, so `GET /applications/<uuid>/envs` returned
every key with a null value — keys only, which is all the comparison needs.
Diffed against the `environment:` allowlist of `docker-compose.yml` (the set
each image reads):

| App | Keys | Missing and the image refuses to boot without | Missing, optional (code default) | Present but dead |
| -- | -- | -- | -- | -- |
| tedrisat | 21 | `ALLOWED_ORIGINS`, `KEYCLOAK_ISSUER`, `KEYCLOAK_AUDIENCE`, `KEYCLOAK_ALLOWED_CLIENTS` (while audience is `account`), `SWAGGER_ALLOW_IN_PRODUCTION` (only with `SWAGGER_ENABLED=true`) | `ALLOWED_METHODS`, `THROTTLE_*` ×4, `KEYCLOAK_CACHE_TTL`, `KEYCLOAK_NOT_FOUND_CACHE_TTL`, `DB_CA_CERT`, `AUTO_MIGRATIONS_FOLDER`, `TRUST_PROXY_HOPS` | — |
| teskilat | 17 | `ALLOWED_ORIGINS` | `ALLOWED_METHODS`, `THROTTLE_LIMIT`, `THROTTLE_TTL`, `TRUST_PROXY_HOPS` | `DB_*` ×6 (MDRS-69 removed teskilat's database) |
| tedris, nazir | 12 | — | `API_MOCKING` | `NEXT_PUBLIC_*` ×4 — inlined at build, never read at runtime |
| nizam | 11 | — | `API_MOCKING` | `NEXT_PUBLIC_*` ×3 |
| landing | 0 | — | `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME` | — |

Each key exists twice in Coolify, once for preview deployments; the counts
above are distinct keys. `DB_PASSWORD` and `KEYCLOAK_JWKS_URL` already exist on
tedrisat. Whether existing values are still right cannot be read with this
token and was not verified.

The dead keys are **not deleted**: their values are not readable, so a
deletion could not be reverted. They are inert and can go once someone with UI
access has confirmed nothing else references them.

## 2. Changes made in Coolify (reversible)

Before any write, every application's full configuration and key list was
dumped to files. One application was changed:

| Application | Field | Before | After |
| -- | -- | -- | -- |
| `teskilat-service` | `docker_registry_image_name` | `ghcr.io/amel-tech/madrasah-backend-teskilat-api` | `ghcr.io/amel-tech/medaris-teskilat-api` |
| `teskilat-service` | `docker_registry_image_tag` | `teskilat-dev` | `latest` |
| `teskilat-service` | `health_check_enabled` / path / port | `false` / `/` / — | `true` / `/health` / `3002` |

This is configuration only: the running container is untouched until a deploy
is triggered, and `PATCH` with the *Before* column undoes it. teskilat went
first because `ALLOWED_ORIGINS` is the only key it lacks. The other five stay on
their old image until each has its missing keys.

Not done, because this session's permission policy refused the writes: adding
`ALLOWED_ORIGINS` to teskilat, writing `TESKILAT_SERVICE_COOLIFY_WEBHOOK` to the
repository, and dispatching the Teskilat API workflow. Those three are the next
manual steps; see MDRS-86 for the exact values.

## 3. What this pull request carries

| File | Change |
| -- | -- |
| `apps/{tedris,nizam,nazir,landing}/Dockerfile` | `ARG` per `NEXT_PUBLIC_*` key `env.ts` declares, no defaults; the "KNOWN LIMITATION" paragraph replaced by the mechanism |
| `.github/workflows/{tedris,nizam,nazir,landing}-web.yaml` | a *Resolve NEXT_PUBLIC build args* step that reads `vars.<APP>_WEB_NEXT_PUBLIC_*`, fails on a missing required one, forwards only non-empty ones; `build-args:` on the build step |
| `apps/{tedris,nizam,nazir,landing}/project.json` | `build.dependsOn: ["^build", "^typecheck"]` — see *The web images never built* below |
| `.dockerignore` | `.claude` excluded — a git-ignored worktree under `.claude/worktrees/` made every local `docker build` fail with Nx's duplicate-project error |
| `docker-compose.yml` | the comment that pointed at "MDRS-16's build-arg item" now says what closed it and that compose deliberately passes no build args |
| `docs/runbooks/deploy-*.md` (6) | Coolify application row in the header; §3.2 and §4 TODOs replaced with what was read; a §0 on the web runbooks for the repository variables |

### The web images never built

The first local `docker build -f apps/tedris/Dockerfile --target build .` on
this branch failed inside `next build` with a wall of `TS6305: Output
file '/app/libs/ui/.tsbuild/components/button.d.ts' has not been built from
source file …` errors (plus the `TS2345 … 'never'` cascade they cause in
next-intl typings). The four web `tsconfig.json` files carry TypeScript
project `references` to `libs/{i18n,icons,services,ui,utils}`, which are
`composite` + `emitDeclarationOnly` projects writing to `.tsbuild/`. `next
build` type-checks against those declaration outputs but does not build the
referenced projects itself; only each lib's `typecheck` target (`tsc -b`)
produces them. Locally and in CI that target has always run first, so the
outputs were there. In the image, `.dockerignore` excludes `**/.tsbuild` (it
is a build product) and the Dockerfile ran `nx build <app>` alone — nothing
produced them, and every web image build was broken. MDRS-16's runbook note
"`Ready in 186ms`, then `HTTP 307`" for a locally built landing image could
not be reproduced here; why it passed then was not determined.

The fix is in the graph, not the Dockerfile: `build` on the four web projects
now `dependsOn: ["^build", "^typecheck"]`, so `nx build tedris-web` builds
the libs' declarations first wherever it runs. That also removes a latent
ordering assumption in CI, where `nx affected -t lint typecheck test build`
had no edge forcing a lib's `typecheck` ahead of an app's `build`.

### Why `ARG` without a default, and why the workflow filters empties

`libs/env/src/root-env.cjs` applies the root `.env` with
`if (process.env[key] !== undefined) continue;` — a key already in the
environment wins, and `""` counts as present. Docker puts a build arg into the
environment of the stage's `RUN` steps only when it was passed. So:

- no build arg → the key is absent → the placeholder from `.env.example`
  applies, and a plain `docker build` / `docker compose build` keeps working;
- a build arg with a value → it is present → it beats the placeholder;
- a build arg passed as `""` → present and empty → shadows the placeholder and
  `env.ts` (`min(1)`, `emptyStringAsUndefined: false`) fails the build with a
  message from inside `next build`.

The workflow step exists for the third case: it fails early, naming the
repository variables, and never forwards an empty optional one. Exercised
locally by running the step's script with and without the variables set
(both outcomes as designed).

### Measured on a local image

Built `apps/tedris/Dockerfile` to the `build` stage twice — see the pull
request for the two counts. The check is `grep -rl` over
`apps/tedris/.next/static` for the real host and for the `localhost:3001`
placeholder, with and without
`--build-arg NEXT_PUBLIC_TEDRISAT_API_BASE_URL=https://api-tedrisat-dev.medaris.net`.
The numbers are in §6 below.

## 4. What remains manual

In the order that keeps each step reversible:

1. Repository secrets: the six `<APP>_COOLIFY_WEBHOOK` values are
   `https://coolify.medaris.net/api/v1/deploy?uuid=<uuid>&force=false` with the
   uuids from §1; `COOLIFY_DEPLOY_TOKEN` is an org secret already visible to
   this repository (`GET /repos/amel-tech/medaris/actions/organization-secrets`
   lists it). `KC_SSH_*` and `RELEASE_PLEASE_TOKEN` are credentials and must be
   entered by a person.
2. Repository variables `<APP>_WEB_NEXT_PUBLIC_*` for the four web apps (the
   web runbooks' §0 list them). Without them the web workflows now fail at the
   resolve step rather than shipping placeholders.
3. Coolify keys per app from the *refuses to boot* column in §1.
4. Per app: dispatch its workflow on `main`, confirm the digest in the job
   summary is the one Coolify runs, then re-point the next app.
5. Push the 43 tags (MDRS-9 §7 step 2) before merging any release-please pull
   request.
6. `push: main` on `deploy-affected.yaml`, after one watched real run.

## 5. Not verified

- Whether Coolify's deploy webhook re-pulls the tag for a `dockerimage`
  application or reuses a cached image. Documented as a deploy in the runbooks,
  with the remaining `TODO(verify against Coolify)` narrowed to that one check.
- The current *values* of any Coolify variable.
- Anything about the *Amel-Tech Auth* project beyond its service being
  `running:healthy` on mdrs1.

## 6. Gate

Measured on this branch, local Docker, `apps/tedris/Dockerfile` to the `build`
stage, counting files under `apps/tedris/.next/static` with `grep -rl`:

| Build | `--build-arg NEXT_PUBLIC_TEDRISAT_API_BASE_URL=…api-tedrisat-dev.medaris.net` | files containing the real host | files containing `localhost:3001` |
| -- | -- | -- | -- |
| A | passed | 1 | 0 |
| B | not passed | 0 | 1 |

Both builds exit 0 — B is the "plain `docker build` still works" case, A is
the deploy case. Before the `project.json` change the same build failed at
`next build` with `TS6305` (§3).

`pnpm exec nx run-many -t lint typecheck module-boundaries -p
tedris-web,nizam-web,nazir-web,landing-web --skip-nx-cache`: `Successfully ran
targets lint, typecheck, module-boundaries for 4 projects and 8 tasks they
depend on`. `node tools/ci/assert-release-config.mjs`: `✔ release config: 7
components, one config, one manifest, chain intact.` The four edited workflow
files parse as YAML, and the *Resolve NEXT_PUBLIC build args* script was run
locally with all variables set (four args emitted, the empty optional one
omitted) and with none set (exit 1 naming the four missing variables).
