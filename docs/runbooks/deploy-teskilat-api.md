# Runbook — deploy Teskilat API

| | |
|---|---|
| Nx project | `teskilat` |
| Source | `apps/teskilat/` |
| Dockerfile | `apps/teskilat/Dockerfile` (build context is the repo root) |
| Workflow | `.github/workflows/teskilat-api.yaml` |
| GHCR image | `ghcr.io/amel-tech/medaris-teskilat-api` |
| Container port | `3002` |
| Coolify application | `teskilat-service` — uuid `hswgow0040s8k0wg8oggcos4`, project *Medaris*, environment `development`, server `mdrs2` (`45.147.47.108`), `https://api-teskilat-dev.medaris.net` |
| Coolify webhook secret | `TESKILAT_SERVICE_COOLIFY_WEBHOOK` (repo secret — set 2026-09-15/16) |
| Deploy token | `COOLIFY_DEPLOY_TOKEN` (org secret — present) |

The image name is not hardcoded: the workflow sets
`IMAGE_NAME: ${{ github.repository }}-teskilat-api` and `REGISTRY: ghcr.io`, and
`github.repository` is `amel-tech/medaris`, so the full reference is
`ghcr.io/amel-tech/medaris-teskilat-api`.

---

## 0. Environment the container refuses to start without

`apps/teskilat/Dockerfile` sets `ENV NODE_ENV=production` in the runner stage,
so the deployed container is always in the strict branch of every environment
check.

| Variable | Required because | Symptom when missing |
|---|---|---|
| `ALLOWED_ORIGINS` | MDRS-34. Comma-separated bare origins (`https://nizam.medaris.app`), no trailing slash, no path, no wildcard host. `*` is refused outside a developer machine. | `ALLOWED_ORIGINS is not usable: …` at `applyGlobalMiddleware`, then a restart loop |

`ALLOWED_ORIGINS` is the **only** variable teskilat refuses to start without.
Every other key in `apps/teskilat/src/config/config.ts` has a fallback, and no
fallback is a credential value: MDRS-69 removed the `database` block, whose
`DB_PASSWORD` defaulted to the literal `"password"` — MDRS-35's other half, done
for tedrisat and not here. There are no Keycloak settings to harden either;
teskilat has no auth guard, and nothing under `apps/teskilat/src` reads a
Keycloak variable.

The deploy workflow only pushes the image and fires the webhook, so it stays
green while the service is down; the container log is the only place the failure
appears.

**Set `ALLOWED_ORIGINS` in the Coolify service before deploying a build that
contains MDRS-34.** The repository-root `.env.example` shows the format, as
`API__ALLOWED_ORIGINS` — there is no `apps/teskilat/.env.example`; since MDRS-25
the workspace has one environment template, at the root.

### What teskilat does *not* need

Deliberate absences, so a deployment is not configured for them by analogy with
tedrisat:

| Not set | Why |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_SSL`, `DB_NAME`, `DB_USERNAME`, `DB_PASSWORD` | teskilat opens no database connection. No database client in its `package.json`, no `DatabaseModule`, no `drizzle.config.ts`, no migrations directory; `AppModule` imports exactly `ConfigModule`, `LoggerModule` and `RateLimitModule` (the last reads `THROTTLE_TTL` / `THROTTLE_LIMIT` from the environment — those stay). MDRS-69 removed all six from the config factory and from `docker-compose.yml`, along with `depends_on: medaris-db`. |
| `AUTO_MIGRATIONS_ENABLED`, `AUTO_MIGRATIONS_FOLDER` | Same reason: nothing to migrate. |
| `KEYCLOAK_*` | No auth guard. #44 removed the copied `KEYCLOAK_JWKS_URL`; the rest were never there. |
| `SWAGGER_ALLOW_IN_PRODUCTION` | tedrisat's opt-in. teskilat has none — see §5. |

The root `.env.example` still ships `TESKILAT__DB_NAME`, `TESKILAT__DB_USERNAME`
and `TESKILAT__DB_PASSWORD`. **The database reads them, teskilat does not.**
Since MDRS-68 the `medaris-db` service interpolates all three with `:?` and
`docker/init-db.sh` creates `teskilat_db` and the `teskilat` role from them, so
`TESKILAT__DB_PASSWORD` is that role's real password. They are provisioning
credentials, not app configuration, and they reach no teskilat container.

---

## 1. How a release tag becomes an image tag

`docker/metadata-action` is configured with four tag rules:

```yaml
type=match,pattern=teskilat-v(.+),group=1
type=raw,value=latest,enable=${{ github.event_name == 'release' || github.ref == format('refs/heads/{0}', github.event.repository.default_branch) }}
type=sha
type=raw,value=stable,enable=${{ github.event_name == 'release' && github.event.release.prerelease == false }}
```

| Trigger | Tags produced |
|---|---|
| Full release published, tag `teskilat-v0.1.1` | `0.1.1`, `latest`, `sha-<short>`, `stable` |
| Full release published, tag `teskilat-something-without-v` | `latest`, `sha-<short>`, `stable` — **no version tag** |
| Pre-release created, tag `teskilat-v<semver>-rc.1` | `<semver>-rc.1`, `latest`, `sha-<short>` — **no `stable`**, so production is untouched and the deploy goes to development |
| `workflow_dispatch` / `workflow_call` on `main` | `latest`, `sha-<short>` |
| `workflow_dispatch` / `workflow_call` on any other branch | `sha-<short>` only |

`type=match` strips the `teskilat-v` prefix and keeps capture group 1, so the
release tag `teskilat-v0.1.1` produces the image tag **`0.1.1`** — the
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
if: ${{ github.event_name != 'release' || startsWith(github.event.release.tag_name, 'teskilat-') }}
```

Read it as: *on a release, the tag must be ours; on anything else, run.* So a
release tagged `teskilat-something-without-v` **runs the job but produces no
version tag** — only `latest` and `sha-…`. Always tag releases as `teskilat-v<semver>`.

MDRS-16 rewrote this gate. The old form enumerated allowed events
(`== 'workflow_dispatch' || == 'workflow_call' || startsWith(…)`), which is a
trap: inside a reusable workflow the `github` context is the **caller's**, so
`github.event_name` is never `'workflow_call'`. It only worked while the
dispatcher was `workflow_dispatch`-only; since MDRS-86 `cd-development.yaml`
calls this workflow on every push to `main`, so under the old gate
`github.event_name` would be `'push'`, no clause would match, and every deploy
would have been skipped silently and reported success.

> As of this writing the repository has **no git tags and no releases**
> (`gh api repos/amel-tech/medaris/tags` and `.../releases` are both empty), so
> the only tags any first deploy can produce are `latest` and `sha-<short>`.

---

## 2. Normal deploy

Two channels (MDRS-87), told apart by the event that started the run:

| Channel | Coolify application | Pulls | Started by | Webhook secret |
|---|---|---|---|---|
| development | the `development` one in the header | `latest` | any *development* path below | `TESKILAT_SERVICE_COOLIFY_WEBHOOK` |
| production | its twin in the `production` environment | `stable` | *Release path* below, full releases only | `TESKILAT_SERVICE_PROD_COOLIFY_WEBHOOK` |

Release-please is not part of the development channel: its release PRs stay
open until someone decides to ship, and merging one is the production trigger.

* **Release path (production)** — merge the release-please PR for `teskilat` (or
  create a GitHub release tagged `teskilat-v<semver>` by hand). The workflow
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
* **Manual path (development)** — Actions → **Teskilat API** → *Run workflow* on `main`.
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
  "/orgs/amel-tech/packages/container/medaris-teskilat-api/versions" \
  --jq '.[] | {id, tags: .metadata.container.tags, created: .created_at}'
```

This needs a token with `read:packages`. Without one, read the digest off the
job summary of the run you want to return to
(Actions → **Teskilat API** → the run → "Record pushed image").

You can always address an old build by its immutable digest:
`ghcr.io/amel-tech/medaris-teskilat-api@sha256:<digest>`.

### 3.2 Re-point the deployment

Read from Coolify through its API on 2026-09-15 (MDRS-86), not assumed: the
`teskilat-service` application has build pack `dockerimage`, so Coolify never builds
from git and the GHCR image is exactly what runs.

Configuration and the running container are two different facts, so both are
recorded here:

| | Value | How it was verified |
|---|---|---|
| Coolify configuration (what the next deploy pulls) | `ghcr.io/amel-tech/medaris-teskilat-api:latest`, health check `/health:3002` on | `GET /api/v1/applications/<uuid>` after the `PATCH`, 2026-09-20 |
| Running container | `latest` as pushed by the first `main` run (`sha-5d52210`) — deployment `no2adzkoffgtovymmkaz9k9k` finished, `running:healthy`, `https://api-teskilat-dev.medaris.net/health` → 200 | Coolify deployment status + the public endpoint, 2026-09-20 |
| Rollback value | `ghcr.io/amel-tech/madrasah-backend-teskilat-api:teskilat-dev`; or, to stay on `medaris` images, the previous `sha-<short>` tag (`sha-29f145e` was the first verified one) | — |


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
`docker_registry_image_tag` on `PATCH /api/v1/applications/hswgow0040s8k0wg8oggcos4`.

**Path B — the application pulls a moving tag (`latest` for development, `stable` for production).**
The commands below say `latest`; for production substitute `stable` and the
production webhook secret.
Move `latest` back to the old digest, then fire the same webhook the workflow
uses. No rebuild, so the bytes are provably the ones that worked:

```bash
echo "$GHCR_PAT" | docker login ghcr.io -u <your-github-username> --password-stdin

# Re-point :latest at a known-good digest (no rebuild, no re-push of layers).
docker buildx imagetools create \
  --tag ghcr.io/amel-tech/medaris-teskilat-api:latest \
  ghcr.io/amel-tech/medaris-teskilat-api@sha256:<good-digest>

# Confirm the move landed.
docker buildx imagetools inspect ghcr.io/amel-tech/medaris-teskilat-api:latest

# Tell Coolify to pull it. Same request the workflow makes.
curl --fail-with-body --silent --show-error \
     --request GET "$COOLIFY_WEBHOOK" \
     --header "Authorization: Bearer $COOLIFY_DEPLOY_TOKEN"
```

`$COOLIFY_WEBHOOK` is the value of the `TESKILAT_SERVICE_COOLIFY_WEBHOOK` repo secret.
Its value is Coolify's deploy endpoint for this application,
`https://coolify.medaris.net/api/v1/deploy?uuid=hswgow0040s8k0wg8oggcos4&force=false` — a
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
docker run --rm -p 3002:3002 ghcr.io/amel-tech/medaris-teskilat-api:<tag>
curl -fsS http://localhost:3002/health && echo OK
```

The container must survive the first second: the entrypoint is
`node dist/src/main` (see `apps/teskilat/Dockerfile`). If it exits immediately
with `Cannot find module '/app/apps/teskilat/dist/main'`, the image was built
from a Dockerfile whose `CMD` still points at `dist/main` — that path does not
exist, `nest build` emits `dist/src/main.js` here.

Then confirm the deployed service, not just the image:

* Coolify shows the service healthy and the container restarted within the last
  few minutes. The service answers at `https://api-teskilat-dev.medaris.net`; its logs are on
  the application's *Logs* tab in Coolify, and in `docker logs` on `mdrs2`.
* The running container reports the digest you intended:

```bash
docker buildx imagetools inspect ghcr.io/amel-tech/medaris-teskilat-api:latest \
  --format '{{.Manifest.Digest}}'
```

---

## 5. Swagger — off in production, unconditionally

**teskilat never serves Swagger UI under `NODE_ENV=production`, whatever
`SWAGGER_ENABLED` is set to, and there is no opt-in.** `apps/teskilat/Dockerfile`
pins `ENV NODE_ENV=production`, so this covers every environment running the
image, dev and staging included.

This is stricter than tedrisat, whose §5 documents an
`SWAGGER_ALLOW_IN_PRODUCTION` escape hatch (MDRS-33). MDRS-69 decided the
asymmetry rather than leaving it implied by a shared default:

|  | tedrisat | teskilat |
|---|---|---|
| `SWAGGER_ENABLED=true`, production | **Refuses to boot** unless `SWAGGER_ALLOW_IN_PRODUCTION=true` | **Serves normally, Swagger unmounted.** Logs a warning naming the variable |
| Opt-in to publish anyway | `SWAGGER_ALLOW_IN_PRODUCTION=true` | none |
| Reads docs where | Any environment with the opt-in | Non-production `NODE_ENV` only |

Why teskilat refuses to mount instead of refusing to boot: both services read
the **same** flag. `.env.example` ships it once as `API__SWAGGER_ENABLED`, and
`docker-compose.yml` hands each service
`SWAGGER_ENABLED: ${<APP>__SWAGGER_ENABLED:-${API__SWAGGER_ENABLED:-false}}`. A
throw in teskilat's config factory fires before `listen()`, so turning on
tedrisat's documentation through that shared key would put teskilat into a
restart loop — a documentation switch on one service becoming an outage on
another. Not mounting is the whole security requirement; not booting adds
nothing to it.

**Operationally:** nothing to set before a release. `SWAGGER_ENABLED` alone
cannot publish teskilat's schema, which is the point — but be precise about the
boundary: `NODE_ENV` is the guard's own key and `docker-compose.yml` interpolates
it as `${TESKILAT__NODE_ENV:-${API__NODE_ENV:-production}}`, so
`TESKILAT__NODE_ENV=development` on the production image *does* publish `/docs`.
That is not a hole in the guard — it is the guard's condition. A deployment that
sets it is no longer running production, and it also moves `ALLOWED_ORIGINS` into
the branch that accepts a `*` origin list. So: the only way to read the schema is
to run the service outside production, and doing that is a visible,
CORS-affecting decision rather than a documentation toggle.

If someone reports "the docs are 404 on teskilat", the container log carries

```
@medaris/teskilat is ignoring SWAGGER_ENABLED=true: under NODE_ENV=production …
```

and the answer is to read the schema from a non-production run, not to change a
flag.

Enforced in two independent places — the config factory
(`apps/teskilat/src/config/config.ts`, through the shared resolver in
`libs/common/src/config/swagger-production.config.ts`), and again in `mountSwagger`
(`apps/teskilat/src/swagger.ts`) against the environment as it is at mount time,
so a stale config value cannot mount the UI on its own. Covered by
`apps/teskilat/test/unit/swagger-policy.spec.ts` (the resolver) and
`apps/teskilat/test/e2e/swagger.e2e.spec.ts`, which boots the application and
asserts `GET /docs` and `GET /docs-json` → 404 with the flag on — including the
case where the compiled config says `enabled: true` and only the live
environment says production — and → 200 outside production, so the negative
cases are not vacuous.

---

## 6. Known blockers

Both items this section carried are closed by MDRS-86 and kept as history:

1. **Webhook secret** — `TESKILAT_SERVICE_COOLIFY_WEBHOOK` was set by hand (teskilat
   2026-09-15, tedrisat 2026-09-16); the deploy step's guard no longer fires.
2. **Image build in CI** — first real run from a branch on 2026-09-15/16 (image
   `sha-29f145e`, deployed and verified through `/health`), then run
   `35535864998` from `main` at `5d52210` on 2026-09-20 pushed `latest`, and
   the application was switched to it (§3.2). The very first attempt, run
   `35003840022`, failed before building with *Cache export is not supported
   for the docker driver* — the missing `docker/setup-buildx-action` step
   MDRS-86 added to all six image workflows.

**Still open (MDRS-87).** `TESKILAT_SERVICE_PROD_COOLIFY_WEBHOOK` is not set, and the Coolify
`production` application it points at does not exist yet. Until both do, a
release pushes `<semver>` + `latest` + `sha-…` + `stable` to GHCR and then the
*Deploy to Coolify* step exits 1 naming that secret: GHCR is updated,
production is untouched, the run is red. It never falls back to the
development webhook.
