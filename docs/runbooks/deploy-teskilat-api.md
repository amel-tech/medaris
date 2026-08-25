# Runbook — deploy Teskilat API

| | |
|---|---|
| Nx project | `teskilat` |
| Source | `apps/teskilat/` |
| Dockerfile | `apps/teskilat/Dockerfile` (build context is the repo root) |
| Workflow | `.github/workflows/teskilat-api.yaml` |
| GHCR image | `ghcr.io/amel-tech/medaris-teskilat-api` |
| Container port | `3002` |
| Coolify webhook secret | `TESKILAT_SERVICE_COOLIFY_WEBHOOK` (repo secret — **not yet set**) |
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
| `DB_HOST`, `DB_PORT`, `DB_SSL`, `DB_NAME`, `DB_USERNAME`, `DB_PASSWORD` | teskilat opens no database connection. No database client in its `package.json`, no `DatabaseModule`, no `drizzle.config.ts`, no migrations directory; `AppModule` imports exactly `ConfigModule` and `LoggerModule`. MDRS-69 removed all six from the config factory and from `docker-compose.yml`, along with `depends_on: medaris-db`. |
| `AUTO_MIGRATIONS_ENABLED`, `AUTO_MIGRATIONS_FOLDER` | Same reason: nothing to migrate. |
| `KEYCLOAK_*` | No auth guard. #44 removed the copied `KEYCLOAK_JWKS_URL`; the rest were never there. |
| `SWAGGER_ALLOW_IN_PRODUCTION` | tedrisat's opt-in. teskilat has none — see §5. |

The root `.env.example` still ships `TESKILAT__DB_NAME`, `TESKILAT__DB_USERNAME`
and `TESKILAT__DB_PASSWORD`. **Nothing reads them today** — `docker/init-db.sql`
hardcodes `CREATE USER teskilat WITH PASSWORD 'teskilat'`, and no `TESKILAT__*`
key is interpolated by the `medaris-db` service — so setting
`TESKILAT__DB_PASSWORD` to a real secret does not change the role's password.
They are kept for PR #53 (MDRS-68), which replaces that script with an
`init-db.sh` driven by these three keys. Either way they are provisioning
credentials, not app configuration, and they reach no teskilat container.

---

## 1. How a release tag becomes an image tag

`docker/metadata-action` is configured with three tag rules:

```yaml
type=match,pattern=teskilat-v(.+),group=1
type=raw,value=latest,enable=${{ github.event_name == 'release' || github.ref == format('refs/heads/{0}', github.event.repository.default_branch) }}
type=sha
```

| Trigger | Tags produced |
|---|---|
| Release created, tag `teskilat-v0.1.1` | `0.1.1`, `latest`, `sha-<short>` |
| Release created, tag `teskilat-something-without-v` | `latest`, `sha-<short>` — **no version tag** |
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

* **Release path** — create a GitHub release tagged `teskilat-v<semver>`. The
  workflow builds, pushes, and calls the Coolify webhook.
* **Manual path** — Actions → **Teskilat API** → *Run workflow*.
* **Fan-out path** — Actions → **Deploy Affected** → *Run workflow* with
  `dry_run: false`. It calls this workflow only when `nx affected` reports
  `teskilat`, which includes every change to a lib this app depends on.

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

Which of the two paths applies depends on how the Coolify service is
configured, and that cannot be read from this repository.

**TODO(verify against Coolify):** determine whether the `Teskilat API` service pulls
`ghcr.io/amel-tech/medaris-teskilat-api:latest` or a pinned tag/digest. Record the
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
  few minutes. **TODO(verify against Coolify):** the service's URL and where its
  logs are.
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

Enforced in two independent places — `apps/teskilat/src/config/swagger-env.ts`
via the config factory, and again in `mountSwagger`
(`apps/teskilat/src/swagger.ts`) against the environment as it is at mount time,
so a stale config value cannot mount the UI on its own. Covered by
`apps/teskilat/test/unit/swagger-env.spec.ts` (the resolver) and
`apps/teskilat/test/e2e/swagger.e2e.spec.ts`, which boots the application and
asserts `GET /docs` and `GET /docs-json` → 404 with the flag on — including the
case where the compiled config says `enabled: true` and only the live
environment says production — and → 200 outside production, so the negative
cases are not vacuous.

---

## 6. Known blockers

1. **`TESKILAT_SERVICE_COOLIFY_WEBHOOK` is not set.** The repository has zero repo secrets; only the org
   secret `COOLIFY_DEPLOY_TOKEN` exists. Until the webhook secret is added, the
   deploy step fails fast with an explicit error (MDRS-16 added that guard —
   previously the `curl` swallowed every failure and the job went green while
   nothing deployed). The value lives in Coolify and must be copied by someone
   with access.
2. **Image build.** `apps/teskilat/Dockerfile` was rewritten from the old
   npm + `turbo.json` form to a staged pnpm-workspace build under a separate
   issue, and lands alongside this runbook. The workflow's `context: .` +
   `file: ./apps/teskilat/Dockerfile` pair is unchanged and correct — verified
   by running exactly that pair locally
   (`docker build -f apps/teskilat/Dockerfile .` from the repo root). Still
   confirm a green run of `.github/workflows/teskilat-api.yaml` before relying on the
   push/deploy half, which cannot be exercised locally.
