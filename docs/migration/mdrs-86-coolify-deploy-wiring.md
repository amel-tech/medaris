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
on the dispatcher — added by the follow-up pull request that also renamed it
from `deploy-affected.yaml` to `cd-development.yaml` ("CD (development)"),
after the 2026-09-20 dry run and six green `main` dispatches; see §4 step 5.

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
dumped to files. Configuration and the running container are recorded
separately, because a `PATCH` changes only what the *next* deploy pulls.

| Application | Coolify configuration | Running container | Rollback value |
| -- | -- | -- | -- |
| `teskilat-service` | `ghcr.io/amel-tech/medaris-teskilat-api:latest`, health check `/health:3002` on | `latest` = `sha-5d52210`, deployment `no2adzkoffgtovymmkaz9k9k` finished 2026-09-20, `running:healthy`, `/health` 200 | `ghcr.io/amel-tech/madrasah-backend-teskilat-api:teskilat-dev` |
| `tedrisat-service` | `ghcr.io/amel-tech/medaris-tedrisat-api:latest`, health check `/health:3001` on, `signoz-net` alias kept | `latest` = `sha-5d52210`, deployment `vp4vf43jbxr2tpp3je247l8r` finished 2026-09-20, `running:healthy`, `/health` 200 | `ghcr.io/amel-tech/madrasah-backend-tedrisat-api:tedrisat-dev` |
| `tedris-web`, `nizam-web`, `nazir-web`, `landing-web` | `ghcr.io/amel-tech/medaris-<app>-web:latest`, health checks off (see below) | `latest` = `sha-5d52210`, each deployed 2026-09-20, `GET /` 200 after redirects; inspected per app below | `ghcr.io/amel-tech/madrasah-frontend-<app>-web:<app>-dev` |

The path there: the two API images were first built from this branch (a run
outside the default branch pushes only `sha-<short>`), so the first verified
deploys used `sha-29f145e`. After the merge (`5d52210`), all six workflows
were dispatched from `main` — the first time the four web images ever built
in CI — and every application was switched to `latest` and redeployed
through the API. Configuration and running container agree from here on.

The six runs, plus the dispatcher's dry run, as GitHub reports them:

```
$ gh run list -R amel-tech/medaris -b main --json databaseId,name,event,conclusion,headSha,createdAt \
    --jq '.[] | select(.event=="workflow_dispatch") | "\(.databaseId)  \(.name)  \(.headSha[:7])  \(.conclusion)  \(.createdAt)"'
35535778107  Deploy Affected  5d52210  success  2026-09-20T20:30:40Z   (dry_run: true, base: 29f145e)
35535864998  Teskilat API     5d52210  success  2026-09-20T20:32:17Z
35535866401  Tedrisat API     5d52210  success  2026-09-20T20:32:19Z
35536077688  Tedris Web       5d52210  success  2026-09-20T20:36:16Z
35536079051  Nizam Web        5d52210  success  2026-09-20T20:36:18Z
35536080527  Nazir Web        5d52210  success  2026-09-20T20:36:20Z
35536081989  Landing Web      5d52210  success  2026-09-20T20:36:22Z
```

What was inspected on the deployed web apps, per app, on 2026-09-20 — and
what was not:

| App | Served page (`GET /`, redirects followed) | JS files the page references | Not inspected |
| -- | -- | -- | -- |
| tedris-web | 200; no `localhost:<port>` string | 1 file fetched, none | server-side chunks inside the image |
| nizam-web | 200; none | 1 file, none | same |
| nazir-web | 200; none | 1 file, none | same |
| landing-web | 200; none | 1 file, none | same |

The server-side chunks are where MDRS-16 originally measured the inlined
`NEXT_PUBLIC_TEDRISAT_API_BASE_URL:"http://localhost:3001"` (tedris, nizam,
nazir) and `NEXT_PUBLIC_TEDRIS_APP_URL=http://localhost:4000` (landing). They
were not re-inspected on the deployed images. The stronger evidence is
upstream of any artifact: `git grep NEXT_PUBLIC -- '*.ts' '*.tsx'` on `main`
matches only comments, so there is no value left for `next build` to inline,
and the local tedris build in §6 shows zero files carrying any of the former
values under `.next/static`.

Web health checks stay off on purpose: Next answers `/` with a locale
redirect (307/308) and Coolify's check expects 200, so enabling it would mark
every deploy failed. A small health route per web app is the follow-up.

Keys added by hand before those deploys: `ALLOWED_ORIGINS` on teskilat;
`ALLOWED_ORIGINS`, `KEYCLOAK_ISSUER`, `KEYCLOAK_AUDIENCE`,
`KEYCLOAK_ALLOWED_CLIENTS`, `SWAGGER_ALLOW_IN_PRODUCTION` on tedrisat. The
six `<APP>_COOLIFY_WEBHOOK` repository secrets were also entered by hand
(this session's permission policy refused those writes).

Still open on both APIs: the Coolify variable `NODE_ENV=development`
overrides the image's `production`, which the health response confirms
(`"environment":"development"`); it should be removed so the strict checks
apply.

## 3. What this pull request carries

| File | Change |
| -- | -- |
| `apps/{tedris,nizam,nazir,landing}/env.ts`, `.env.example`, `apps/*/project.json` | every `NEXT_PUBLIC_*` key removed — see *One image for every environment* below |
| `apps/tedris/{lib/image-hosts.ts,features/user-avatar.tsx,components/header/*}` | the avatar host check takes the issuer as a prop from the server component instead of `env.NEXT_PUBLIC_KEYCLOAK_ISSUER` |
| `apps/{tedris,nizam}/lib/keycloak-sign-out-config.ts` (new), `apps/{tedris,nizam}/lib/keycloak-logout.ts` | MDRS-28 (#72, merged meanwhile) made sign-out reach Keycloak's end-session endpoint through `createKeycloakSignOut` from `@medaris/services/auth-client`, fed by three `NEXT_PUBLIC_*` values. They now come from a `"use server"` action, `getKeycloakSignOutConfig`, that returns `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_ISSUER` and `NEXTAUTH_URL` at request time; the call sites are unchanged |
| `tools/ci/assert-env-compose-parity.mjs`, `.coderabbit.yaml` | the ten `NEXT_PUBLIC_*` exemptions and the review guidance that described them removed/rewritten |
| `apps/{tedris,nizam,nazir,landing}/Dockerfile` | the "KNOWN LIMITATION" paragraph replaced: nothing from `.env.example` reaches the browser any more |
| `apps/{tedris,nizam,nazir,landing}/project.json` | `build.dependsOn: ["^build", "^typecheck"]` — see *The web images never built* below |
| `.github/workflows/{tedrisat-api,teskilat-api,tedris,nizam,nazir,landing-web}.yaml` | a pinned `docker/setup-buildx-action` step — see *The first real run* below |
| `.dockerignore` | `.claude` excluded — a git-ignored worktree under `.claude/worktrees/` made every local `docker build` fail with Nx's duplicate-project error |
| `docker-compose.yml` | the comment that pointed at "MDRS-16's build-arg item" now says what closed it and that compose deliberately passes no build args |
| `docs/runbooks/deploy-*.md` (6) | Coolify application row in the header; §3.2 and §4 TODOs replaced with what was read; a §0 on the web runbooks for the repository variables |

### The first real run of a deploy workflow

Teskilat API was dispatched on `main` on 2026-09-15 (run `35003840022`) —
the first time any of the six image workflows ran in this repository. It
failed in *Build and push Docker image* before building anything:

```
ERROR: failed to build: Cache export is not supported for the docker driver.
Switch to a different driver, or turn on the containerd image store, and try again.
```

MDRS-16 added `cache-from`/`cache-to: type=gha` to all six build steps but no
`docker/setup-buildx-action`, so `build-push-action` used the runner's default
`docker` driver, which cannot export to the Actions cache. The same step
(`v4.4.0`, pinned to `594f3bf4285d9ea8dc53c9a0c9c4092420091003`) is now in all
six workflows, before the registry login.

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

### One image for every environment

The first draft of this pull request passed `NEXT_PUBLIC_*` values as Docker
build args from repository variables, one set per environment — which meant
two builds of the same commit and a GitHub variable set to maintain. Reading
the code showed that was solving a problem the apps barely had:

| Key | Read in client code by |
| -- | -- |
| `NEXT_PUBLIC_KEYCLOAK_ISSUER` | tedris `lib/image-hosts.ts` (avatar host check); the two `logout.tsx` files |
| `NEXT_PUBLIC_KEYCLOAK_CLIENT_ID`, `NEXT_PUBLIC_NEXTAUTH_URL` | the two `logout.tsx` files only |
| `NEXT_PUBLIC_TEDRISAT_API_BASE_URL`, `NEXT_PUBLIC_API_MOCKING` | nothing — declared in `env.ts`, read nowhere (`git grep`) |
| `NEXT_PUBLIC_TEDRIS_APP_URL` (landing) | nothing |

And neither `logout.tsx` was rendered at the time: `git grep KeycloakLogout`
found no import, both apps signed out through `signOut()` in their header
menus. MDRS-28 (#72) then landed on `main` while this branch was open,
deleted those two files itself and replaced them with a real Keycloak
end-session sign-out (`lib/keycloak-logout.ts` in both apps, built on
`createKeycloakSignOut` from `@medaris/services/auth-client`) — which read the
same three `NEXT_PUBLIC_*` values, so at merge time the browser-side consumers
were that sign-out and the avatar host check. The avatar check now receives
`KEYCLOAK_ISSUER` as a prop from the server component that already owns the
session (`components/header/header.tsx` → `UserHeaderMenu` → `UserAvatar`);
the sign-out obtains its three values from a server action,
`getKeycloakSignOutConfig`, at call time (the call sites in the header menus
are untouched, and the config fetch precedes `signOut()`, so the single-step
navigation MDRS-28 relies on is preserved). The `client` blocks are gone from
all four `env.ts` files, and the nine `NEXT_PUBLIC_*` lines are gone from
`.env.example` together with their exemptions in
`tools/ci/assert-env-compose-parity.mjs`. Nothing environment-specific
is inlined, the image is the same bytes for `development` and `production`, and
the values live where the APIs' already live: in the Coolify application.

The old repositories worked the same way in practice, which is why the
placeholders never hurt: `@next/env` never overrides a key already in
`process.env` (`processEnv()` in `@next/env/dist/index.js` assigns a parsed key
only when `initialEnv[key]` is undefined), so the server-side
`TEDRISAT_API_BASE_URL` always came from Coolify at runtime, and the inlined
`NEXT_PUBLIC_*` copies were either unread or coincidentally equal to the
development values.

One build-time remnant stays: tedris's `images.remotePatterns` is computed in
`next.config.js` at `next build` from `KEYCLOAK_ISSUER`, i.e. from the host in
`.env.example`. That host is the one shared Keycloak for every environment;
only the realm differs and the realm is not part of the host.

### Measured on a local image

Built `apps/tedris/Dockerfile` to the `build` stage with no build args and
searched `apps/tedris/.next/static` for every value that used to be inlined;
the counts are in §6.

## 4. What remains manual

In the order that keeps each step reversible:

1. Repository secrets: the six `<APP>_COOLIFY_WEBHOOK` values are
   `https://coolify.medaris.net/api/v1/deploy?uuid=<uuid>&force=false` with the
   uuids from §1; `COOLIFY_DEPLOY_TOKEN` is an org secret already visible to
   this repository (`GET /repos/amel-tech/medaris/actions/organization-secrets`
   lists it). `KC_SSH_*` and `RELEASE_PLEASE_TOKEN` are credentials and must be
   entered by a person.
2. Coolify keys per app from the *refuses to boot* column in §1.
3. Per app: dispatch its workflow on `main`, confirm the digest in the job
   summary is the one Coolify runs, then re-point the next app.
4. Push the 43 tags (MDRS-9 §7 step 2) before merging any release-please pull
   request.
5. `push: main` on the dispatcher — done: `.github/workflows/cd-development.yaml`
   (renamed from `deploy-affected.yaml`, name "CD (development)") runs on every
   push to `main`; keycloak-theme is excluded from that fan-out because its
   workflow restarts the shared Keycloak. The dispatcher's own first real
   fan-out is the first push after the merge and must be watched; seed its
   nx-set-shas anchor first with one `dry_run: true`, `base: 5d52210` dispatch.

## 5. Not verified

- Whether Coolify's deploy webhook re-pulls the tag for a `dockerimage`
  application or reuses a cached image. Documented as a deploy in the runbooks,
  with the remaining `TODO(verify against Coolify)` narrowed to that one check.
- The current *values* of any Coolify variable.
- Anything about the *Amel-Tech Auth* project beyond its service being
  `running:healthy` on mdrs1.

## 6. Gate

Measured on this branch, local Docker, `apps/tedris/Dockerfile` to the `build`
stage with **no build args** (exit 0), counting files under
`apps/tedris/.next/static` with `grep -rl` for each value that used to be
inlined:

| Value searched for | Files in `.next/static` |
| -- | -- |
| `localhost:4000` (was `NEXT_PUBLIC_NEXTAUTH_URL`) | 0 |
| `localhost:3001` (was `NEXT_PUBLIC_TEDRISAT_API_BASE_URL`) | 0 |
| `tedris-dev` (was `NEXT_PUBLIC_KEYCLOAK_CLIENT_ID`) | 0 |
| `auth.medaris.app` (was `NEXT_PUBLIC_KEYCLOAK_ISSUER`) | 0 |
| `NEXT_PUBLIC_` | 0 |

Nothing environment-specific reaches the browser bundle. Before the
`project.json` change the same build failed at `next build` with `TS6305` (§3).

`pnpm exec nx run-many -t lint typecheck test build module-boundaries -p
tedris-web,nizam-web,nazir-web,landing-web --skip-nx-cache`: `Successfully ran
targets lint, typecheck, test, build, module-boundaries for 4 projects and 8
tasks they depend on`. `node tools/ci/assert-release-config.mjs`: `✔ release config: 7
components, one config, one manifest, chain intact.` The six edited workflow
files parse as YAML.
