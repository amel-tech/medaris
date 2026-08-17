# Runbook — deploy Tedrisat API

| | |
|---|---|
| Nx project | `tedrisat` |
| Source | `apps/tedrisat/` |
| Dockerfile | `apps/tedrisat/Dockerfile` (build context is the repo root) |
| Workflow | `.github/workflows/tedrisat-api.yaml` |
| GHCR image | `ghcr.io/amel-tech/medaris-tedrisat-api` |
| Container port | `3001` |
| Coolify webhook secret | `TEDRISAT_SERVICE_COOLIFY_WEBHOOK` (repo secret — **not yet set**) |
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
| `DB_PASSWORD` | MDRS-35 removed the `docker/init-db.sql` fallback | `@medaris/tedrisat cannot start, the environment is incomplete: DB_PASSWORD …` |
| `KEYCLOAK_JWKS_URL` | MDRS-35 removed the `"test-url"` fallback | same message, naming `KEYCLOAK_JWKS_URL` |

**Set all three in the Coolify service before deploying a build that contains
MDRS-34.** `apps/tedrisat/.env.example` lists the full set with comments.

---

## 1. How a release tag becomes an image tag

`docker/metadata-action` is configured with three tag rules:

```yaml
type=match,pattern=tedrisat-v(.+),group=1
type=raw,value=latest,enable=${{ github.event_name == 'release' || github.ref == format('refs/heads/{0}', github.event.repository.default_branch) }}
type=sha
```

| Trigger | Tags produced |
|---|---|
| Release created, tag `tedrisat-v0.1.5` | `0.1.5`, `latest`, `sha-<short>` |
| Release created, tag `tedrisat-something-without-v` | `latest`, `sha-<short>` — **no version tag** |
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
`github.event_name` is never `'workflow_call'`. It only worked because the
dispatcher is `workflow_dispatch`-only today; the moment anything calls this
workflow from a `push`, the old gate would have skipped the deploy silently and
reported success.

> As of this writing the repository has **no git tags and no releases**
> (`gh api repos/amel-tech/medaris/tags` and `.../releases` are both empty), so
> the only tags any first deploy can produce are `latest` and `sha-<short>`.

---

## 2. Normal deploy

Either:

* **Release path** — create a GitHub release tagged `tedrisat-v<semver>`. The
  workflow builds, pushes, and calls the Coolify webhook.
* **Manual path** — Actions → **Tedrisat API** → *Run workflow*.
* **Fan-out path** — Actions → **Deploy Affected** → *Run workflow* with
  `dry_run: false`. It calls this workflow only when `nx affected` reports
  `tedrisat`, which includes every change to a lib this app depends on.

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

Which of the two paths applies depends on how the Coolify service is
configured, and that cannot be read from this repository.

**TODO(verify against Coolify):** determine whether the `Tedrisat API` service pulls
`ghcr.io/amel-tech/medaris-tedrisat-api:latest` or a pinned tag/digest. Record the
answer here. Everything below assumes one or the other.

**Path A — the service pulls a pinned tag or digest.**
Edit the image reference in the Coolify service configuration to the previous
tag/digest and redeploy from the Coolify UI.
**TODO(verify against Coolify):** exact field name and screen.

**Path B — the service pulls `:latest`.**
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
**TODO(verify against Coolify):** whether this webhook forces a fresh pull or
only restarts the existing container. If it only restarts, the rollback also
needs a pull step in Coolify.

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
  few minutes. **TODO(verify against Coolify):** the service's URL and where its
  logs are.
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

1. **`TEDRISAT_SERVICE_COOLIFY_WEBHOOK` is not set.** The repository has zero repo secrets; only the org
   secret `COOLIFY_DEPLOY_TOKEN` exists. Until the webhook secret is added, the
   deploy step fails fast with an explicit error (MDRS-16 added that guard —
   previously the `curl` swallowed every failure and the job went green while
   nothing deployed). The value lives in Coolify and must be copied by someone
   with access.
2. **Image build.** `apps/tedrisat/Dockerfile` was rewritten from the old
   npm + `turbo.json` form to a staged pnpm-workspace build under a separate
   issue, and lands alongside this runbook. The workflow's `context: .` +
   `file: ./apps/tedrisat/Dockerfile` pair is unchanged and correct — verified
   by running exactly that pair locally
   (`docker build -f apps/tedrisat/Dockerfile .` from the repo root). Still
   confirm a green run of `.github/workflows/tedrisat-api.yaml` before relying on the
   push/deploy half, which cannot be exercised locally.
