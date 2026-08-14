# Runbook — deploy Nazir Web

| | |
|---|---|
| Nx project | `nazir-web` |
| Source | `apps/nazir/` |
| Dockerfile | `apps/nazir/Dockerfile` (build context is the repo root) |
| Workflow | `.github/workflows/nazir-web.yaml` |
| GHCR image | `ghcr.io/amel-tech/medaris-nazir-web` |
| Container port | `4002` |
| Coolify webhook secret | `NAZIR_WEB_COOLIFY_WEBHOOK` (repo secret — **not yet set**) |
| Deploy token | `COOLIFY_DEPLOY_TOKEN` (org secret — present) |

The image name is not hardcoded: the workflow sets
`IMAGE_NAME: ${{ github.repository }}-nazir-web` and `REGISTRY: ghcr.io`, and
`github.repository` is `amel-tech/medaris`, so the full reference is
`ghcr.io/amel-tech/medaris-nazir-web`.

---

## 1. How a release tag becomes an image tag

`docker/metadata-action` is configured with three tag rules:

```yaml
type=match,pattern=nazir-web-v(.+),group=1
type=raw,value=latest,enable=${{ github.event_name == 'release' || github.ref == format('refs/heads/{0}', github.event.repository.default_branch) }}
type=sha
```

| Trigger | Tags produced |
|---|---|
| Release created, tag `nazir-web-v1.4.0` | `1.4.0`, `latest`, `sha-<short>` |
| Release created, tag `nazir-web-something-without-v` | `latest`, `sha-<short>` — **no version tag** |
| `workflow_dispatch` / `workflow_call` on `main` | `latest`, `sha-<short>` |
| `workflow_dispatch` / `workflow_call` on any other branch | `sha-<short>` only |

`type=match` strips the `nazir-web-v` prefix and keeps capture group 1, so the
release tag `nazir-web-v1.4.0` produces the image tag **`1.4.0`** — the
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
if: ${{ github.event_name != 'release' || startsWith(github.event.release.tag_name, 'nazir-web-') }}
```

Read it as: *on a release, the tag must be ours; on anything else, run.* So a
release tagged `nazir-web-something-without-v` **runs the job but produces no
version tag** — only `latest` and `sha-…`. Always tag releases as `nazir-web-v<semver>`.

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

* **Release path** — create a GitHub release tagged `nazir-web-v<semver>`. The
  workflow builds, pushes, and calls the Coolify webhook.
* **Manual path** — Actions → **Nazir Web** → *Run workflow*.
* **Fan-out path** — Actions → **Deploy Affected** → *Run workflow* with
  `dry_run: false`. It calls this workflow only when `nx affected` reports
  `nazir-web`, which includes every change to a lib this app depends on.

Each run writes the digest and the exact tag list to its job summary
("Record pushed image"). **That summary is the rollback record** — copy the
digest before you need it.

---

## 3. Rollback

### 3.1 Find the version you want to go back to

```bash
# Every tag ever pushed for this image, newest first.
gh api -H "Accept: application/vnd.github+json" \
  "/orgs/amel-tech/packages/container/medaris-nazir-web/versions" \
  --jq '.[] | {id, tags: .metadata.container.tags, created: .created_at}'
```

This needs a token with `read:packages`. Without one, read the digest off the
job summary of the run you want to return to
(Actions → **Nazir Web** → the run → "Record pushed image").

You can always address an old build by its immutable digest:
`ghcr.io/amel-tech/medaris-nazir-web@sha256:<digest>`.

### 3.2 Re-point the deployment

Which of the two paths applies depends on how the Coolify service is
configured, and that cannot be read from this repository.

**TODO(verify against Coolify):** determine whether the `Nazir Web` service pulls
`ghcr.io/amel-tech/medaris-nazir-web:latest` or a pinned tag/digest. Record the
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
  --tag ghcr.io/amel-tech/medaris-nazir-web:latest \
  ghcr.io/amel-tech/medaris-nazir-web@sha256:<good-digest>

# Confirm the move landed.
docker buildx imagetools inspect ghcr.io/amel-tech/medaris-nazir-web:latest

# Tell Coolify to pull it. Same request the workflow makes.
curl --fail-with-body --silent --show-error \
     --request GET "$COOLIFY_WEBHOOK" \
     --header "Authorization: Bearer $COOLIFY_DEPLOY_TOKEN"
```

`$COOLIFY_WEBHOOK` is the value of the `NAZIR_WEB_COOLIFY_WEBHOOK` repo secret.
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
docker run --rm -p 4002:4002 ghcr.io/amel-tech/medaris-nazir-web:<tag>
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4002/
```

Expect the container log to show `▲ Next.js` and `✓ Ready in …`, and the request
to return **`200` or `307`** — these apps route through next-intl, which
redirects `/` to `/<locale>`, so a 307 is healthy, not a fault. (Measured on a
locally built `apps/landing` image: `Ready in 186ms`, then `HTTP 307`.)

A Next.js app also needs its runtime env; a bare `docker run` without the app's
`.env` can render an error page on a perfectly good image, so treat an
unexpected status as "check env first", not "bad image".

Then confirm the deployed service, not just the image:

* Coolify shows the service healthy and the container restarted within the last
  few minutes. **TODO(verify against Coolify):** the service's URL and where its
  logs are.
* The running container reports the digest you intended:

```bash
docker buildx imagetools inspect ghcr.io/amel-tech/medaris-nazir-web:latest \
  --format '{{.Manifest.Digest}}'
```

---

## 5. Known blockers

1. **`NAZIR_WEB_COOLIFY_WEBHOOK` is not set.** The repository has zero repo secrets; only the org
   secret `COOLIFY_DEPLOY_TOKEN` exists. Until the webhook secret is added, the
   deploy step fails fast with an explicit error (MDRS-16 added that guard —
   previously the `curl` swallowed every failure and the job went green while
   nothing deployed). The value lives in Coolify and must be copied by someone
   with access.
2. **Image build.** `apps/nazir/Dockerfile` was rewritten from the old
   npm + `turbo.json` form to a staged pnpm-workspace build under a separate
   issue, and lands alongside this runbook. The workflow's `context: .` +
   `file: ./apps/nazir/Dockerfile` pair is unchanged and correct — verified
   by running exactly that pair locally
   (`docker build -f apps/nazir/Dockerfile .` from the repo root). Still
   confirm a green run of `.github/workflows/nazir-web.yaml` before relying on the
   push/deploy half, which cannot be exercised locally.

3. **NOT PRODUCTION-DEPLOYABLE YET — `NEXT_PUBLIC_*` placeholders are baked into
   the client bundle.** `apps/nazir/env.ts` validates the environment at build
   time, so the Dockerfile does `cp apps/nazir/.env.example apps/nazir/.env`
   before `next build`. Next inlines every `NEXT_PUBLIC_*` value into the client
   bundle as a string literal at that moment, and **no runtime environment
   variable can override it afterwards**. Verified inside the built image: a
   server chunk under `/app/apps/nazir/.next/server/chunks/` contains
   `NEXT_PUBLIC_TEDRISAT_API_BASE_URL:"http://localhost:3001"`, alongside the
   `amel-tech-dev` realm, the `nazir-dev` client id and a `localhost` NextAuth
   URL. This is pre-existing — the Dockerfile this one replaces did the same
   `cp` — not a regression, but it means a production deploy of this image talks
   to `localhost`. The fix is to declare the `NEXT_PUBLIC_*` values as `ARG`s,
   export them to `ENV` before `nx build`, and pass them from the workflow's
   `build-args:`. That spans `.github/` and `apps/` together and is tracked as a
   follow-up, deliberately outside MDRS-16's scope. **Until it lands, treat this
   image as build-verified but not production-deployable.**
4. **Order of operations: create the repo secrets BEFORE merging.** The runner
   stage does `rm -f ./apps/nazir/.env`, which is the right call — the
   placeholders are literals such as `NEXTAUTH_SECRET=NEXT_AUTH_SECRET` and
   `KEYCLOAK_CLIENT_SECRET=KEYCLOAK_CLIENT_SECRET`, and a predictable
   session-signing key that silently satisfies validation is worse than a crash.
   But `apps/nazir/env.ts` marks `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET`,
   `KEYCLOAK_ISSUER`, `NEXTAUTH_URL` and `NEXTAUTH_SECRET` as required, so with
   the `.env` gone and nothing supplied by Coolify, the environment validation
   fails. Measured, not assumed: `docker run` on the built image with no env
   leaves the container in state **`running`** — it does *not* exit — while
   `instrumentation.js` throws and **every page returns HTTP 500**. That is the
   quieter and more dangerous half of the failure: a container that stays `Up`
   satisfies a naive container-status healthcheck, so Coolify can report the
   service green while it serves nothing. (With the full env supplied the same
   image returns HTTP 200, so the image itself is sound.) Sequence it: populate
   the GitHub repo secrets **and** the Coolify service environment from the
   Coolify values first, then merge and deploy. If that cannot happen in one
   step, land the workflow and Dockerfile changes but hold the deploy trigger —
   otherwise the first run after merge takes this frontend down.
