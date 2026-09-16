# Runbook — deploy Landing Web

| | |
|---|---|
| Nx project | `landing-web` |
| Source | `apps/landing/` |
| Dockerfile | `apps/landing/Dockerfile` (build context is the repo root) |
| Workflow | `.github/workflows/landing-web.yaml` |
| GHCR image | `ghcr.io/amel-tech/medaris-landing-web` |
| Container port | `4003` |
| Coolify application | `landing-web` — uuid `r4s0cscgkcow0s8gg0wco4kw`, project *Medaris*, environment `development`, server `mdrs1` (`193.111.78.115`), `https://medaris.app` |
| Coolify webhook secret | `LANDING_WEB_COOLIFY_WEBHOOK` (repo secret — **not yet set**) |
| Deploy token | `COOLIFY_DEPLOY_TOKEN` (org secret — present) |

The image name is not hardcoded: the workflow sets
`IMAGE_NAME: ${{ github.repository }}-landing-web` and `REGISTRY: ghcr.io`, and
`github.repository` is `amel-tech/medaris`, so the full reference is
`ghcr.io/amel-tech/medaris-landing-web`.

---

## 0. Build inputs the workflow refuses to run without

`NEXT_PUBLIC_*` is inlined into the client bundle at `next build`, so the
values the browser gets are fixed when the image is built, not when Coolify
starts it — a runtime variable on the Coolify service cannot change them.
Since MDRS-86, `.github/workflows/landing-web.yaml` passes them as
Docker build args, read from **repository variables** (Settings → Secrets and
variables → Actions → *Variables*) under this app's prefix:

| Repository variable | | Reaches the build as |
|---|---|---|
| `LANDING_WEB_NEXT_PUBLIC_TEDRIS_APP_URL` | optional — omitted when empty | `NEXT_PUBLIC_TEDRIS_APP_URL` |

The *Resolve NEXT_PUBLIC build args* step fails the run, before any build
minute is spent, when a required one is unset. It also never forwards an empty
optional one: `libs/env/src/root-env.cjs` treats any key already in
`process.env` — even `""` — as authoritative, so an empty build arg would
shadow the `.env.example` placeholder and fail `env.ts` validation with a
message from deep inside `next build`. A `docker build` with no build args at
all still works and ships the placeholders; that is the local-only path.

The server-side keys (`KEYCLOAK_CLIENT_SECRET`, `NEXTAUTH_SECRET`, …) are not
build inputs: they are read at request time from the container's environment,
which is where Coolify's variables do apply.

---

## 1. How a release tag becomes an image tag

`docker/metadata-action` is configured with three tag rules:

```yaml
type=match,pattern=landing-web-v(.+),group=1
type=raw,value=latest,enable=${{ github.event_name == 'release' || github.ref == format('refs/heads/{0}', github.event.repository.default_branch) }}
type=sha
type=raw,value=stable,enable=${{ github.event_name == 'release' }}
```

| Trigger | Tags produced |
|---|---|
| Release created, tag `landing-web-v1.4.0` | `1.4.0`, `latest`, `sha-<short>`, `stable` |
| Release created, tag `landing-web-something-without-v` | `latest`, `sha-<short>`, `stable` — **no version tag** |
| `workflow_dispatch` / `workflow_call` on `main` | `latest`, `sha-<short>` |
| `workflow_dispatch` / `workflow_call` on any other branch | `sha-<short>` only |

`type=match` strips the `landing-web-v` prefix and keeps capture group 1, so the
release tag `landing-web-v1.4.0` produces the image tag **`1.4.0`** — the
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
if: ${{ github.event_name != 'release' || startsWith(github.event.release.tag_name, 'landing-web-') }}
```

Read it as: *on a release, the tag must be ours; on anything else, run.* So a
release tagged `landing-web-something-without-v` **runs the job but produces no
version tag** — only `latest` and `sha-…`. Always tag releases as `landing-web-v<semver>`.

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

Two channels (MDRS-87), told apart by the event that started the run:

| Channel | Coolify application | Pulls | Started by | Webhook secret |
|---|---|---|---|---|
| development | the `development` one in the header | `latest` | *Manual path* or *Fan-out path* below, on `main` | `LANDING_WEB_COOLIFY_WEBHOOK` |
| production | its twin in the `production` environment | `stable` | *Release path* below | `LANDING_WEB_PROD_COOLIFY_WEBHOOK` |

Release-please is not part of the development channel: its release PRs stay
open until someone decides to ship, and merging one is the production trigger.

* **Release path (production)** — merge the release-please PR for `landing-web` (or
  create a GitHub release tagged `landing-web-v<semver>` by hand). The workflow
  builds, pushes `<semver>` + `latest` + `sha-…` + `stable`, and calls the
  **production** webhook. `latest` moving here is harmless: the release commit
  is the head of `main`, so development receives the build it would anyway.
* **Manual path (development)** — Actions → **Landing Web** → *Run workflow* on `main`.
* **Fan-out path (development)** — Actions → **Deploy Affected** → *Run workflow* with
  `dry_run: false`. It calls this workflow only when `nx affected` reports
  `landing-web`, which includes every change to a lib this app depends on.

Each run writes the digest and the exact tag list to its job summary
("Record pushed image"). **That summary is the rollback record** — copy the
digest before you need it.

---

## 3. Rollback

### 3.1 Find the version you want to go back to

```bash
# Every tag ever pushed for this image, newest first.
gh api -H "Accept: application/vnd.github+json" \
  "/orgs/amel-tech/packages/container/medaris-landing-web/versions" \
  --jq '.[] | {id, tags: .metadata.container.tags, created: .created_at}'
```

This needs a token with `read:packages`. Without one, read the digest off the
job summary of the run you want to return to
(Actions → **Landing Web** → the run → "Record pushed image").

You can always address an old build by its immutable digest:
`ghcr.io/amel-tech/medaris-landing-web@sha256:<digest>`.

### 3.2 Re-point the deployment

Read from Coolify through its API on 2026-09-15 (MDRS-86), not assumed: the
`landing-web` application has build pack `dockerimage`, so Coolify never builds
from git and the GHCR image is exactly what runs. As of 2026-09-15 it still pulls **`ghcr.io/amel-tech/madrasah-frontend-landing-web:landing-dev`** — the old repository's image, on the tag that repository's `ci-dev.yaml` moved on every push to `main`. MDRS-86 re-points it to **`ghcr.io/amel-tech/medaris-landing-web:latest`**
(rollback value if that re-point has to be undone: `ghcr.io/amel-tech/madrasah-frontend-landing-web:landing-dev`).

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
`docker_registry_image_tag` on `PATCH /api/v1/applications/r4s0cscgkcow0s8gg0wco4kw`.

**Path B — the application pulls a moving tag (`latest` for development, `stable` for production).**
The commands below say `latest`; for production substitute `stable` and the
production webhook secret.
Move `latest` back to the old digest, then fire the same webhook the workflow
uses. No rebuild, so the bytes are provably the ones that worked:

```bash
echo "$GHCR_PAT" | docker login ghcr.io -u <your-github-username> --password-stdin

# Re-point :latest at a known-good digest (no rebuild, no re-push of layers).
docker buildx imagetools create \
  --tag ghcr.io/amel-tech/medaris-landing-web:latest \
  ghcr.io/amel-tech/medaris-landing-web@sha256:<good-digest>

# Confirm the move landed.
docker buildx imagetools inspect ghcr.io/amel-tech/medaris-landing-web:latest

# Tell Coolify to pull it. Same request the workflow makes.
curl --fail-with-body --silent --show-error \
     --request GET "$COOLIFY_WEBHOOK" \
     --header "Authorization: Bearer $COOLIFY_DEPLOY_TOKEN"
```

`$COOLIFY_WEBHOOK` is the value of the `LANDING_WEB_COOLIFY_WEBHOOK` repo secret.
Its value is Coolify's deploy endpoint for this application,
`https://coolify.medaris.net/api/v1/deploy?uuid=r4s0cscgkcow0s8gg0wco4kw&force=false` — a
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
docker run --rm -p 4003:4003 ghcr.io/amel-tech/medaris-landing-web:<tag>
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4003/
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
  few minutes. The service answers at `https://medaris.app`; its logs are on
  the application's *Logs* tab in Coolify, and in `docker logs` on `mdrs1`.
* The running container reports the digest you intended:

```bash
docker buildx imagetools inspect ghcr.io/amel-tech/medaris-landing-web:latest \
  --format '{{.Manifest.Digest}}'
```

---

## 5. Known blockers

1. **`LANDING_WEB_COOLIFY_WEBHOOK` is not set.** The repository has zero repo secrets; only the org
   secret `COOLIFY_DEPLOY_TOKEN` exists. Until the webhook secret is added, the
   deploy step fails fast with an explicit error (MDRS-16 added that guard —
   previously the `curl` swallowed every failure and the job went green while
   nothing deployed). The value lives in Coolify and must be copied by someone
   with access.
2. **Image build.** `apps/landing/Dockerfile` was rewritten from the old
   npm + `turbo.json` form to a staged pnpm-workspace build under a separate
   issue, and lands alongside this runbook. The workflow's `context: .` +
   `file: ./apps/landing/Dockerfile` pair is unchanged and correct — verified
   by running exactly that pair locally
   (`docker build -f apps/landing/Dockerfile .` from the repo root). Still
   confirm a green run of `.github/workflows/landing-web.yaml` before relying on the
   push/deploy half, which cannot be exercised locally.

3. **`NEXT_PUBLIC_TEDRIS_APP_URL` is baked in as `http://localhost:4000`.** The
   Dockerfile copies `.env.example` to `.env` before `next build` because
   `apps/landing/env.ts` validates at build time, and Next inlines every
   `NEXT_PUBLIC_*` value into the client bundle as a literal — no runtime
   variable overrides it. Unlike the three authenticated frontends, every field
   in `apps/landing/env.ts` is `.optional()`, so this image still boots with the
   `.env` removed; the only consequence is that links to the Tedris app point at
   `localhost:4000`. The same follow-up fixes it: `ARG` -> `ENV` before
   `nx build` -> `build-args:` in the workflow.
