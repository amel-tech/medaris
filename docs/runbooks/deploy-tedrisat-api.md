# Runbook — deploy Tedrisat API

| | |
|---|---|
| Nx project | `tedrisat` |
| Source | `apps/tedrisat/` |
| Dockerfile | `apps/tedrisat/Dockerfile` (build context is the repo root) |
| Workflow | `.github/workflows/tedrisat-api.yaml` |
| GHCR image | `ghcr.io/amel-tech/medaris-tedrisat-api` |
| Container port | `3001` |
| Coolify application | `tedrisat-service` — uuid `uk08w4w8gkkgwossks8wgock`, project *Medaris*, environment `development`, server `mdrs2` (`45.147.47.108`), `https://api-tedrisat-dev.medaris.net` |
| Coolify webhook secret | `TEDRISAT_SERVICE_COOLIFY_WEBHOOK` (repo secret — set 2026-09-15/16) |
| Deploy token | `COOLIFY_DEPLOY_TOKEN` (org secret — present) |

The image name is not hardcoded: the workflow sets
`IMAGE_NAME: ${{ github.repository }}-tedrisat-api` and `REGISTRY: ghcr.io`, and
`github.repository` is `amel-tech/medaris`, so the full reference is
`ghcr.io/amel-tech/medaris-tedrisat-api`.

---

## 0. Environment the container refuses to start without

`apps/tedrisat/Dockerfile` sets `ENV NODE_ENV=production` in the runner stage,
so the deployed container is always in the strict branch of every environment
check. These variables have **no fallback** — the process throws during
bootstrap and the container restart-loops if any of them is missing. The deploy
workflow only pushes the image and fires the webhook, so it stays green while
the service is down; the container log is the only place the failure appears.

| Variable | Required because | Symptom when missing |
|---|---|---|
| `ALLOWED_ORIGINS` | MDRS-34. Comma-separated bare origins (`https://tedris.medaris.app`), no trailing slash, no path, no wildcard host. `*` is refused outside a developer machine. | `ALLOWED_ORIGINS is not usable: …` at `applyGlobalMiddleware` |
| `DB_PASSWORD` | MDRS-35 removed the fallback to the password `docker/init-db.sql` hardcoded. Operator-chosen everywhere, including local compose since MDRS-68: `docker/init-db.sh` now creates the role with whatever this says. | `@medaris/tedrisat cannot start, the environment is incomplete: DB_PASSWORD …` |
| `KEYCLOAK_JWKS_URL` | MDRS-35 removed the `"test-url"` fallback | same message, naming `KEYCLOAK_JWKS_URL` |
| `KEYCLOAK_ISSUER` | MDRS-30. The expected `iss`, checked on every token. Validated as `z.string().url()`, so a value that is not an absolute URL fails exactly as an absent one does. | same message, naming `KEYCLOAK_ISSUER` |
| `KEYCLOAK_AUDIENCE` | MDRS-30. The expected `aud`. Without it the API verifies the signature only, and accepts any token the realm signed — an ID token, or one minted for a different client. | same message, naming `KEYCLOAK_AUDIENCE` |

The last four rows are a single `zod` object in
`apps/tedrisat/src/config/security-env.ts`, parsed once by the config factory, so
a deployment missing several of them is told about all of them in one message.
`ALLOWED_ORIGINS` is separate — it is enforced in `libs/common`, and applies to
teskilat as well.

Three more variables can stop the boot, on a condition rather than always. All
three apply to every deployed environment, because `apps/tedrisat/Dockerfile`
pins `NODE_ENV=production`:

| Variable | Required when | Symptom |
|---|---|---|
| `KEYCLOAK_REDIRECT_URL` | `SWAGGER_ENABLED=true`. Swagger UI's `oauth2RedirectUrl` is built on it, and the service refuses to mount the UI rather than serve `undefined/docs/oauth2-redirect.html`. | `@medaris/tedrisat cannot mount Swagger UI: KEYCLOAK_REDIRECT_URL is unset`, at bootstrap |
| `SWAGGER_ALLOW_IN_PRODUCTION` | `SWAGGER_ENABLED=true` under `NODE_ENV=production`. MDRS-33 made publishing the schema in production an explicit decision, because it also relaxes CSP and COOP on those pages. | `… refuses to start on SWAGGER_ENABLED=true …`, in the config factory |
| `KEYCLOAK_ALLOWED_CLIENTS` | `KEYCLOAK_AUDIENCE` is realm-wide — i.e. `account`, which `.env.example` ships until the shared realm carries the audience mappers `tools/keycloak/setup-realm.sh` adds (MDRS-42) and `KEYCLOAK_AUDIENCE` is switched to `tedrisat-api` — in that order, see `docs/migration/mdrs-42-keycloak-clients.md` §Rollout. Then the `azp` allow-list is the only thing binding a token to a client, and `loadJwtClaimPolicy` refuses the pair. With a per-API audience it is an optional narrowing, and empty means "no `azp` restriction", never "checks disabled". | `JwtVerifierService was configured with the realm-wide audience "account" …`, thrown when the DI container builds `JwtVerifierService` — later than the four above, which fail in the config factory |

**Set all of them in the Coolify service before deploying a build that contains
MDRS-30 or MDRS-34.** The repository-root `.env.example` lists the full set with
comments, under the `API__` prefix. Note that the error messages still say *"See
apps/tedrisat/.env.example"* — MDRS-25 consolidated the workspace onto the single
root file and that path no longer exists.

---

## 1. How a release tag becomes an image tag

`docker/metadata-action` is configured with four tag rules:

```yaml
type=match,pattern=tedrisat-v(.+),group=1
type=raw,value=latest,enable=${{ github.event_name == 'release' || github.ref == format('refs/heads/{0}', github.event.repository.default_branch) }}
type=sha
type=raw,value=stable,enable=${{ github.event_name == 'release' && github.event.release.prerelease == false }}
```

| Trigger | Tags produced |
|---|---|
| Full release published, tag `tedrisat-v0.1.5` | `0.1.5`, `latest`, `sha-<short>`, `stable` |
| Full release published, tag `tedrisat-something-without-v` | `latest`, `sha-<short>`, `stable` — **no version tag** |
| Pre-release created, tag `tedrisat-v<semver>-rc.1` | `<semver>-rc.1`, `latest`, `sha-<short>` — **no `stable`**, so production is untouched and the deploy goes to development |
| `workflow_dispatch` / `workflow_call` on `main` | `latest`, `sha-<short>` |
| `workflow_dispatch` / `workflow_call` on any other branch | `sha-<short>` only |

`type=match` strips the `tedrisat-v` prefix and keeps capture group 1, so the
release tag `tedrisat-v0.1.5` produces the image tag **`0.1.5`** — the
prefix is not part of the image tag.

`latest` deliberately does **not** use metadata-action's `{{is_default_branch}}`
helper. That helper strips `refs/heads/` off the ref and compares what is left
to the default branch; on a `release` the ref is `refs/tags/<tag>`, so the strip
is a no-op and the compare can never match, and its event fallback covers only
create/discussion/issues/schedule — never `release`. Left that way, a release
pushed the version tag and `sha-…` but left `:latest` pointing at the **previous**
image, so a Coolify service configured to pull `:latest` (Path B in §3.2) would
re-pull the old build while the workflow run went green. The explicit expression
above moves `latest` on every release as well as on the default branch.

`type=sha` was added by MDRS-16 and is what guarantees the list is never empty.
Before it, a dispatch from a non-default branch matched neither rule,
metadata-action emitted no tags at all, and the push step failed.

The job's own `if:` gate is separate from — and slightly wider than — the tag
pattern:

```yaml
if: ${{ github.event_name != 'release' || startsWith(github.event.release.tag_name, 'tedrisat-') }}
```

Read it as: *on a release, the tag must be ours; on anything else, run.* So a
release tagged `tedrisat-something-without-v` **runs the job but produces no
version tag** — only `latest` and `sha-…`. Always tag releases as `tedrisat-v<semver>`.

MDRS-16 rewrote this gate. The old form enumerated allowed events
(`== 'workflow_dispatch' || == 'workflow_call' || startsWith(…)`), which is a
trap: inside a reusable workflow the `github` context is the **caller's**, so
`github.event_name` is never `'workflow_call'`. It only worked while the
dispatcher was `workflow_dispatch`-only; since MDRS-86 `cd-development.yaml`
calls this workflow on every push to `main`, so under the old gate
`github.event_name` would be `'push'`, no clause would match, and every deploy
would have been skipped silently and reported success.

> The 43 historical tags MDRS-9 preserved were pushed on 2026-09-22
> (`gh api --paginate repos/amel-tech/medaris/tags --jq '.[].name' | wc -l` →
> `43`), so release-please finally has a release anchor per component. The
> repository still has **no releases** (`gh api repos/amel-tech/medaris/releases
> --jq 'length'` → `0`), so no deploy has yet produced a `<semver>` or `stable`
> tag; every image in GHCR is from a `latest` / `sha-<short>` run.

---

## 2. Normal deploy

Two channels (MDRS-87), told apart by the event that started the run:

| Channel | Coolify application | Pulls | Started by | Webhook secret |
|---|---|---|---|---|
| development | the `development` one in the header | `latest` | any *development* path below | `TEDRISAT_SERVICE_COOLIFY_WEBHOOK` |
| production | its twin in the `production` environment | `stable` | *Release path* below, full releases only | `TEDRISAT_SERVICE_PROD_COOLIFY_WEBHOOK` |

Release-please is not part of the development channel: its release PRs stay
open until someone decides to ship, and merging one is the production trigger.

* **Release path (production)** — merge the release-please PR for `tedrisat` (or
  create a GitHub release tagged `tedrisat-v<semver>` by hand). The workflow
  builds, pushes `<semver>` + `latest` + `sha-…` + `stable`, and calls the
  **production** webhook. A **pre-release** does none of that: `stable` is
  guarded on `github.event.release.prerelease == false`, so an `-rc` build
  goes to development like any other `main` build. `latest` moving on a full
  release is harmless: the release commit
  is the head of `main`, so development receives the build it would anyway.
* **Automatic path (development)** — every push to `main` runs **CD
  (development)** (`.github/workflows/cd-development.yaml`), which calls this
  workflow when `nx affected` lists this app — including for a change to a lib
  it depends on. Nothing to click; the run appears under the dispatcher's name.
* **Manual path (development)** — Actions → **Tedrisat API** → *Run workflow* on `main`.
* **Fan-out path, by hand (development)** — Actions → **CD (development)** → *Run workflow*
  with `dry_run: false` (default `true` only reports). Same dispatcher, same
  affected computation; useful to redeploy after a Coolify-side change with
  no commit.

Each run writes the digest and the exact tag list to its job summary
("Record pushed image"). **That summary is the rollback record** — copy the
digest before you need it.

---

## 3. Rollback

### 3.1 Find the version you want to go back to

```bash
# Every tag ever pushed for this image, newest first.
gh api -H "Accept: application/vnd.github+json" \
  "/orgs/amel-tech/packages/container/medaris-tedrisat-api/versions" \
  --jq '.[] | {id, tags: .metadata.container.tags, created: .created_at}'
```

This needs a token with `read:packages`. Without one, read the digest off the
job summary of the run you want to return to
(Actions → **Tedrisat API** → the run → "Record pushed image").

You can always address an old build by its immutable digest:
`ghcr.io/amel-tech/medaris-tedrisat-api@sha256:<digest>`.

### 3.2 Re-point the deployment

Read from Coolify through its API on 2026-09-15 (MDRS-86), not assumed: the
`tedrisat-service` application has build pack `dockerimage`, so Coolify never builds
from git and the GHCR image is exactly what runs.

Configuration and the running container are two different facts, so both are
recorded here:

| | Value | How it was verified |
|---|---|---|
| Coolify configuration (what the next deploy pulls) | `ghcr.io/amel-tech/medaris-tedrisat-api:latest`, health check `/health:3001` on | `GET /api/v1/applications/<uuid>` after the `PATCH`, 2026-09-20 |
| Running container | `latest` as pushed by the first `main` run (`sha-5d52210`) — deployment `vp4vf43jbxr2tpp3je247l8r` finished, `running:healthy`, `https://api-tedrisat-dev.medaris.net/health` → 200 | Coolify deployment status + the public endpoint, 2026-09-20 |
| Rollback value | `ghcr.io/amel-tech/madrasah-backend-tedrisat-api:tedrisat-dev`; or, to stay on `medaris` images, the previous `sha-<short>` tag (`sha-29f145e` was the first verified one) | — |


`latest` is deliberate: it is the tag every workflow run on the default branch
and every release already moves, so `development` follows `main` without a
tag of its own, and a future `production` environment pins `<semver>` instead.
Path B below is therefore the live path; Path A is what a pinned environment
would use.


**Path A — the service pulls a pinned tag or digest.**
Edit the image reference in the Coolify service configuration to the previous
tag/digest and redeploy from the Coolify UI.
The two fields are **Docker Image** and **Docker Image Tag** on the application's
*General* tab; through the API they are `docker_registry_image_name` and
`docker_registry_image_tag` on `PATCH /api/v1/applications/uk08w4w8gkkgwossks8wgock`.

**Path B — the application pulls a moving tag (`latest` for development, `stable` for production).**
The commands below say `latest`; for production substitute `stable` and the
production webhook secret.
Move `latest` back to the old digest, then fire the same webhook the workflow
uses. No rebuild, so the bytes are provably the ones that worked:

```bash
echo "$GHCR_PAT" | docker login ghcr.io -u <your-github-username> --password-stdin

# Re-point :latest at a known-good digest (no rebuild, no re-push of layers).
docker buildx imagetools create \
  --tag ghcr.io/amel-tech/medaris-tedrisat-api:latest \
  ghcr.io/amel-tech/medaris-tedrisat-api@sha256:<good-digest>

# Confirm the move landed.
docker buildx imagetools inspect ghcr.io/amel-tech/medaris-tedrisat-api:latest

# Tell Coolify to pull it. Same request the workflow makes.
curl --fail-with-body --silent --show-error \
     --request GET "$COOLIFY_WEBHOOK" \
     --header "Authorization: Bearer $COOLIFY_DEPLOY_TOKEN"
```

`$COOLIFY_WEBHOOK` is the value of the `TEDRISAT_SERVICE_COOLIFY_WEBHOOK` repo secret.
Its value is Coolify's deploy endpoint for this application,
`https://coolify.medaris.net/api/v1/deploy?uuid=uk08w4w8gkkgwossks8wgock&force=false` — a
*deploy*, not a restart, so for a `dockerimage` application it re-resolves the
tag before starting the container. **TODO(verify against Coolify):** confirm on
the first MDRS-86 deploy that the digest Coolify runs afterwards is the one the
workflow pushed; until then treat "re-pull" as documented, not measured.

### 3.3 What NOT to do

Do not re-run the old workflow run to roll back. A re-run checks out the same
commit but rebuilds from scratch: base images, `pnpm install` and the app build
all re-resolve, so you get *a* build of that commit, not *the* build that was
running. Re-point the tag or the digest instead.

---

## 4. Verify

```bash
# The image is a NestJS service; app.controller.ts exposes GET /health
# with no global prefix.
docker run --rm -p 3001:3001 ghcr.io/amel-tech/medaris-tedrisat-api:<tag>
curl -fsS http://localhost:3001/health && echo OK
```

The container must survive the first second: the entrypoint is
`node dist/src/main` (see `apps/tedrisat/Dockerfile`). If it exits immediately
with `Cannot find module '/app/apps/tedrisat/dist/main'`, the image was built
from a Dockerfile whose `CMD` still points at `dist/main` — that path does not
exist, `nest build` emits `dist/src/main.js` here.

Then confirm the deployed service, not just the image:

* Coolify shows the service healthy and the container restarted within the last
  few minutes. The service answers at `https://api-tedrisat-dev.medaris.net`; its logs are on
  the application's *Logs* tab in Coolify, and in `docker logs` on `mdrs2`.
* The running container reports the digest you intended:

```bash
docker buildx imagetools inspect ghcr.io/amel-tech/medaris-tedrisat-api:latest \
  --format '{{.Manifest.Digest}}'
```

---

## 5. Before the next release — the Swagger guard

MDRS-33 made `SWAGGER_ENABLED=true` under `NODE_ENV=production` a **hard boot
failure** unless `SWAGGER_ALLOW_IN_PRODUCTION=true` is also set: publishing the
API schema also relaxes CSP and COOP on the Swagger pages, so the service refuses
rather than doing it by accident.

`apps/tedrisat/Dockerfile` hardcodes `ENV NODE_ENV=production`, so this applies
to **every** environment running that image — dev and staging included, not just
production. The throw fires in the config factory, before `listen()`, so an
environment still carrying `SWAGGER_ENABLED=true` crash-loops instead of starting
with Swagger off.

Before rolling out a tedrisat release that includes MDRS-33, for each deployed
environment either:

- set `SWAGGER_ENABLED=false` (the new default in every `.env.example`), or
- set `SWAGGER_ALLOW_IN_PRODUCTION=true` if that environment wants the docs
  endpoint. `SWAGGER_ENABLED=true` additionally requires `KEYCLOAK_REDIRECT_URL`
  to be set to the service's public origin — Swagger's `oauth2RedirectUrl` is
  built on it, and an unset value is refused the same way.

Symptom if this is missed: the container exits immediately with
`@medaris/tedrisat refuses to start: SWAGGER_ENABLED=true with NODE_ENV=production …`,
naming the variable to change.

---

## 6. Known blockers

Both items this section carried are closed by MDRS-86 and kept as history:

1. **Webhook secret** — `TEDRISAT_SERVICE_COOLIFY_WEBHOOK` was set by hand (teskilat
   2026-09-15, tedrisat 2026-09-16); the deploy step's guard no longer fires.
2. **Image build in CI** — first real run from a branch on 2026-09-15/16 (image
   `sha-29f145e`, deployed and verified through `/health`), then run
   `35535866401` from `main` at `5d52210` on 2026-09-20 pushed `latest`, and
   the application was switched to it (§3.2). The very first attempt, run
   `35003840022`, failed before building with *Cache export is not supported
   for the docker driver* — the missing `docker/setup-buildx-action` step
   MDRS-86 added to all six image workflows.

**Still open (MDRS-87).** `TEDRISAT_SERVICE_PROD_COOLIFY_WEBHOOK` is not set, and the Coolify
`production` application it points at does not exist yet. Until both do, a
release pushes `<semver>` + `latest` + `sha-…` + `stable` to GHCR and then the
*Deploy to Coolify* step exits 1 naming that secret: GHCR is updated,
production is untouched, the run is red. It never falls back to the
development webhook.
