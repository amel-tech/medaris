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
| Coolify webhook secret | `LANDING_WEB_COOLIFY_WEBHOOK` (repo secret — set 2026-09-16) |
| Deploy token | `COOLIFY_DEPLOY_TOKEN` (org secret — present) |

The image name is not hardcoded: the workflow sets
`IMAGE_NAME: ${{ github.repository }}-landing-web` and `REGISTRY: ghcr.io`, and
`github.repository` is `amel-tech/medaris`, so the full reference is
`ghcr.io/amel-tech/medaris-landing-web`.

---

## 0. Build inputs

None. The image is environment-agnostic (MDRS-86): the app declares no
`NEXT_PUBLIC_*` key, so nothing from `.env.example` — which the build stage
copies only to satisfy `env.ts`'s build-time validation — reaches the browser
bundle. Every value the running app uses is read on the server at request time
from the Coolify application's environment, exactly like the two APIs, and the
same image serves `development` and `production`.

The one build-time remnant is in tedris only: `images.remotePatterns` in its
`next.config.js` is derived from `WEB__KEYCLOAK_ISSUER` in `.env.example` at
`next build`, i.e. the host of the one shared Keycloak. A different Keycloak
host would need a rebuild; a different realm does not.

---

## 1. How a release tag becomes an image tag

`docker/metadata-action` is configured with four tag rules:

```yaml
type=match,pattern=landing-web-v(.+),group=1
type=raw,value=latest,enable=${{ github.event_name == 'release' || github.ref == format('refs/heads/{0}', github.event.repository.default_branch) }}
type=sha
type=raw,value=stable,enable=${{ github.event_name == 'release' && github.event.release.prerelease == false }}
```

| Trigger | Tags produced |
|---|---|
| Full release published, tag `landing-web-v1.4.0` | `1.4.0`, `latest`, `sha-<short>`, `stable` |
| Full release published, tag `landing-web-something-without-v` | `latest`, `sha-<short>`, `stable` — **no version tag** |
| Pre-release created, tag `landing-web-v<semver>-rc.1` | `<semver>-rc.1`, `latest`, `sha-<short>` — **no `stable`**, so production is untouched and the deploy goes to development |
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
| development | the `development` one in the header | `latest` | any *development* path below | `LANDING_WEB_COOLIFY_WEBHOOK` |
| production | its twin in the `production` environment | `stable` | *Release path* below, full releases only | `LANDING_WEB_PROD_COOLIFY_WEBHOOK` |

Release-please is not part of the development channel: its release PRs stay
open until someone decides to ship, and merging one is the production trigger.

* **Release path (production)** — merge the release-please PR for `landing-web` (or
  create a GitHub release tagged `landing-web-v<semver>` by hand). The workflow
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
* **Manual path (development)** — Actions → **Landing Web** → *Run workflow* on `main`.
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
from git and the GHCR image is exactly what runs.

Configuration and the running container are two different facts, so both are
recorded here:

| | Value |
|---|---|
| Coolify configuration (what the next deploy pulls) | `ghcr.io/amel-tech/medaris-landing-web:latest` (set 2026-09-20); health check still off — Next answers `/` with a locale redirect (307/308) and Coolify's check expects 200, so a dedicated health route is needed before it can be enabled |
| Running container | `latest` as pushed by the first `main` run (`sha-5d52210`) — deployed 2026-09-20 through the API, `GET https://medaris.app/` → 200 after redirects, and the served page and its chunks carry no `localhost` value |
| Rollback value | `ghcr.io/amel-tech/madrasah-frontend-landing-web:landing-dev` (the pre-MDRS-86 image, last built 2026-06-18); or the previous `sha-<short>` tag once there is more than one |


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

The three items this section carried (webhook secret unset, image build
unverified in CI, `NEXT_PUBLIC_TEDRIS_APP_URL` baked in as `localhost:4000`)
are closed by MDRS-86 and kept here only as history:

1. **Webhook secret** — `LANDING_WEB_COOLIFY_WEBHOOK` was set on 2026-09-16; the
   deploy step's guard no longer fires.
2. **Image build in CI** — run `35536081989` (`.github/workflows/landing-web.yaml`
   on `main` at `5d52210`, 2026-09-20) built, pushed `latest` + `sha-5d52210`
   and called the webhook, all green. Before MDRS-86 this image could not build
   in CI at all (`TS6305`, see the migration record).
3. **`NEXT_PUBLIC_TEDRIS_APP_URL`** — MDRS-16 measured it baked into the built
   image as `http://localhost:4000`. It was declared in `apps/landing/env.ts`
   and read nowhere; MDRS-86 removed it with every other `NEXT_PUBLIC_*` key,
   so there is nothing left to inline (§0). Verified at the source
   (`git grep NEXT_PUBLIC -- '*.ts' '*.tsx'` on `main` matches only comments)
   and on the served page and its referenced JS on 2026-09-20; the server
   chunks of the deployed image were not re-inspected.

**Still open (MDRS-87).** `LANDING_WEB_PROD_COOLIFY_WEBHOOK` is not set, and the Coolify
`production` application it points at does not exist yet. Until both do, a
release pushes `<semver>` + `latest` + `sha-…` + `stable` to GHCR and then the
*Deploy to Coolify* step exits 1 naming that secret: GHCR is updated,
production is untouched, the run is red. It never falls back to the
development webhook.
