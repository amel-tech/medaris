# Runbook — deploy Keycloak (theme and version)

Since 2026-10-12 Keycloak ships as an image, like the other six apps:
`ghcr.io/amel-tech/medaris-keycloak`, the pinned Keycloak with the Medaris
theme JAR baked in. It replaced the deploy that copied the JAR onto the
Keycloak host over SSH: `tools/keycloak/deploy-theme.sh` is gone, and nothing
reads the `KC_SSH_*` secrets or the `KC_THEME_DIR` variable any more, so any
of them that was ever set can be deleted from the repository settings. One
image pins both the theme and the Keycloak version, so neither changes on the
server without a release.

**A Keycloak deploy restarts the only Keycloak.** It serves applications
outside Medaris too (the Amel-Tech Auth project) and both Medaris realms, and
sign-in is unavailable everywhere for its start-up time. Deploy in a window
agreed with that project's owner. On 2026-10-13 the start itself took 82 s
(re-augmentation 29.6 s, an 18 s wait for a stopped cluster member); the image
now built with `kc.sh build` and `KC_CACHE=local` started in 14–18 s locally
with `start --optimized` (§0 step 6).

| | |
|---|---|
| Nx project | `keycloak-theme` |
| Source | `apps/keycloak-theme/` |
| Dockerfile | `apps/keycloak-theme/Dockerfile`; the build context is the theme JAR alone, not the repository |
| Keycloak version | `ARG KEYCLOAK_VERSION` in that Dockerfile, the only pin: **26.6.3**, the version production ran on 2026-10-12 (`kc.sh --version` → 26.6.3, JVM 21.0.11) |
| Workflows | `.github/workflows/keycloak-theme-jar.yaml` (JAR build and smoke test: pull requests, and every Keycloak run) and `.github/workflows/keycloak-theme-app.yaml` (**Keycloak**: image, promotion, deploy) |
| GHCR image | `ghcr.io/amel-tech/medaris-keycloak` (`IMAGE_NAME: ${{ github.repository }}-keycloak`) |
| Theme id | `medaris-keycloak-theme` (`apps/keycloak-theme/src/kc.gen.tsx`; the realms ask for it in `config/keycloak/realms/_base.json`) |
| In the image | `/opt/keycloak/providers/medaris-keycloak-theme.jar`, owned by `keycloak:root` like the rest of `/opt/keycloak` |
| Coolify | the Keycloak service of the Amel-Tech Auth project; pulls `ghcr.io/amel-tech/medaris-keycloak:stable` once §0 is done |
| Deploy webhook | `KEYCLOAK_COOLIFY_RESTART_WEBHOOK` (repo secret, exists): Coolify's **restart** of that service, not a deploy (on 2026-10-13 it answered "Service restarting request queued.") |
| Deploy token | `COOLIFY_DEPLOY_TOKEN` (org secret, exists) |

---

## 0. One-time Coolify change

Until this is done the service still runs `quay.io/keycloak/keycloak:latest`
with the old JAR mounted, and a Keycloak release would redeploy exactly that.
Do it once, before the first `keycloak-theme` release after this change.

1. **An image exists.** The merge of this change touches `apps/keycloak-theme`,
   so its push to `main` normally runs **CD (development)** with
   `keycloak-theme` affected, which builds and pushes `sha-<short>` and
   `latest`. `stable` appears with the first full release
   (step 5). Check:

   ```bash
   docker buildx imagetools inspect ghcr.io/amel-tech/medaris-keycloak:latest
   ```

2. **The Keycloak server can pull it.** The package is public: on
   2026-10-13 an anonymous pull of `latest` and `sha-3acd2c3` answered 200.
3. **Coolify → the Keycloak service** (done on 2026-10-13):
   * image `quay.io/keycloak/keycloak:latest` → `ghcr.io/amel-tech/medaris-keycloak:stable`;
   * the `madrasah-theme.jar` mounts from the host directory
     `/opt/keycloak/themes/` into `/opt/keycloak/providers/` removed (Keycloak
     loads every `*.jar` in `providers/`, so they would load an old copy of the
     theme next to the one baked into the image);
   * `mem_limit: 2g`;
   * command `start` and the environment unchanged.

   Saved without redeploying: `stable` did not exist yet.
4. **The realms name the theme** (§5).
5. **Release.** Merge release-please's release PR while it lists
   `keycloak-theme`; it ships every component it lists (or create a release
   `keycloak-theme-v<semver>` by hand) in the agreed window. The
   release promotes the image `main` built to `<semver>` and `stable` and calls
   the restart webhook (§2). Then §4. Done on 2026-10-13 with 2.0.0; see §6
   for what went wrong.
6. **The optimized start, in two releases.** The image is built with
   `kc.sh build` since the change after 2.0.0 (`KC_DB=postgres`,
   `KC_HEALTH_ENABLED=true`, `KC_CACHE=local`). Production gets the fast start
   only with the command `start --optimized`, and that command must never meet
   an image that was not built: the 2.0.0 image under `start --optimized`
   exited at once with code 2 ("The '--optimized' flag was used for first ever
   server start", measured locally on 2026-10-13), which is a full outage.
   1. **Before the next `keycloak-theme` release:** add `pull_policy: always`
      to the `keycloak` service and save without redeploying. The webhook is a
      restart; without it the restart may keep the `stable` the server already
      pulled. Leave the command at `start`: with the new image it re-augments
      (45 s locally) but no longer waits for a cluster, because the image sets
      `KC_CACHE=local`.
   2. **After that release runs**, check that the server runs it (§4), then
      change the command to `start --optimized`, save and restart the service
      once in the window. Expect the realm back within about 20 s.

   Rolling back to an image built before this change (2.0.0 or older) needs
   the command back at `start` first (§3).

   If production must move before a release exists, create `stable` by hand
   from the image `main` built and redeploy the service from Coolify:

   ```bash
   IMAGE=ghcr.io/amel-tech/medaris-keycloak
   good=$(docker buildx imagetools inspect "$IMAGE:latest" --format '{{.Manifest.Digest}}')
   docker buildx imagetools create --tag "$IMAGE:stable" "$IMAGE@$good"
   ```

The pin replaces `latest`, which also means Keycloak no longer upgrades itself
whenever the service is redeployed. An upgrade is now a one-line change of
`ARG KEYCLOAK_VERSION` (the smoke test boots the new version on the pull
request) followed by a release. Never pin below the version production runs:
Keycloak migrates its database on start, and an older Keycloak against a
migrated database is not supported. `apps/keycloak-theme/test/deploy.spec.ts`
fails on a pin below 26.6.3.

---

## 1. What the build runs

`.github/workflows/keycloak-theme-jar.yaml` builds the JAR on every pull
request that touches `apps/keycloak-theme/**` (the Dockerfile included),
`libs/ui`, `libs/icons`, `libs/tokens`, the lockfile or the smoke script, and
keeps it as the artifact `keycloak-theme-jar-<sha>` (90 days). On `main` it
runs only as part of the Keycloak workflow, which calls it for its build, so
the JAR in the image is the one that passed the smoke test, built once.

```bash
pnpm exec nx run keycloak-theme:build-keycloak-theme   # = vite build && keycloakify build
```

There is no `build` target; this one is inferred from `package.json`, and
running it through Nx builds `@medaris/ui` and `@medaris/icons` first.
keycloakify shells out to Maven, so the runner needs a JDK (21, Keycloak 26's
JVM) and Maven (from the `ubuntu-24.04` image; a `mvn --version` step fails
early if a future image drops it). It emits two JARs; Keycloak 26 needs
`dist_keycloak/keycloak-theme-for-kc-all-other-versions.jar`, the one the
Dockerfile copies. The other one gives a Keycloak that starts and silently
serves the built-in theme.

`tools/keycloak/smoke-theme-jar.sh` then builds `apps/keycloak-theme/Dockerfile`
with that JAR as its only input, so it runs the pinned Keycloak with the JAR
where the image puts it, boots it with `start-dev`, and fails unless
`/admin/serverinfo` lists `medaris-keycloak-theme` as a login and an e-mail
theme and a realm using it renders its login and registration pages through
the theme (keycloakify's `kcContext` with `pageId` `login` / `register`). It
boots `start-dev`, which re-augments, so it does not exercise the build
options the image persists. `start --optimized` against Postgres was checked
by hand on 2026-10-13 (ready in 14–18 s; `/admin/serverinfo` listed
`medaris-keycloak-theme` as a login and an e-mail theme); CI does not run it.

---

## 2. Normal deploy

| Trigger | What happens | Image tags | Restarts Keycloak |
|---|---|---|---|
| Push to `main` that `nx affected` maps to `keycloak-theme` (CD (development)) | JAR build and smoke test, image build and push | `sha-<short>`, `latest` | no; there is no development Keycloak |
| Full release `keycloak-theme-v<semver>` | promotes `sha-<short>` of the release commit, by digest | `<semver>`, `stable` | yes |
| Pre-release `keycloak-theme-v<semver>-rc.1` | JAR build, image build and push | `sha-<short>`, `<semver>-rc.1` | no |
| *Run workflow* on **Keycloak** | JAR build, image build and push | `sha-<short>` | no |

A full release works like the other six apps' (their runbooks, §1.1). The
*promote* job (`tools/ci/promote-image.sh`) looks for
`ghcr.io/amel-tech/medaris-keycloak:sha-<short>` of the release commit, waits
while a `cd-development.yaml` run for that commit is queued or running
(polling every 20 s, up to 20 minutes), and points `<semver>` and `stable` at
that exact digest. When the image never appears (no CD run for the commit, or
one that was cancelled, failed or did not build the theme) the *jar* and
*image* jobs build it from the tag, push `sha-<short>`, `<semver>` and
`stable`, and warn that production gets an image development never ran. The
*restart* job then calls the restart webhook once with `COOLIFY_DEPLOY_TOKEN`;
a non-2xx fails the run. It then watches
`https://auth.medaris.app/realms/medaris/.well-known/openid-configuration`:
- the realm must stop answering 200 within 3 minutes, or the run fails
  (Coolify never ran the restart; the previous image still serves);
- it must answer 200 again within 4 minutes;
- if it does not, the job calls the service's `…/start` (the webhook's URL
  with `/restart` replaced) once and waits 5 more minutes;
- still nothing fails the run. Then start the service in Coolify by hand and
  read its log.

The promote job's summary records which path ran, the digest and the tags:
**that is the rollback record**.

A release of another app starts this workflow too and skips every job; it
queues in a group of its own, so it cannot replace a pending Keycloak release.
Production and everything else queue apart for the same reason.

---

## 3. Rollback

`stable` is what the service pulls, and every full release leaves an
immutable `<semver>` on the digest it shipped. Rolling back is pointing
`stable` at an earlier `<semver>` and calling the deploy webhook. Nothing is
rebuilt.

**First check the Keycloak version of the target.** The image carries the
theme and the Keycloak version together. Rolling back to an image with an older
`KEYCLOAK_VERSION` downgrades Keycloak against a database it has already
migrated: do not. Roll forward with a fix instead, or agree a database restore
with the Amel-Tech Auth project.

**Then check the command.** A target built before the optimized image (2.0.0
or older) was never built and does not start under `--optimized`: set the
service's command back to `start` before restarting it on that image (§0
step 6).

```bash
# The Keycloak version a release shipped.
git show keycloak-theme-v<previous semver>:apps/keycloak-theme/Dockerfile | grep '^ARG KEYCLOAK_VERSION='

echo "$GHCR_PAT" | docker login ghcr.io -u <your-github-username> --password-stdin
IMAGE=ghcr.io/amel-tech/medaris-keycloak
good=$(docker buildx imagetools inspect "$IMAGE:<previous semver>" --format '{{.Manifest.Digest}}')
docker buildx imagetools create --tag "$IMAGE:stable" "$IMAGE@$good"
docker buildx imagetools inspect "$IMAGE:stable" --format '{{.Manifest.Digest}}'   # must print $good

curl --fail-with-body --silent --show-error \
     --request GET "$KEYCLOAK_COOLIFY_RESTART_WEBHOOK" \
     --header "Authorization: Bearer $COOLIFY_DEPLOY_TOKEN"
```

Leave the `<semver>` tags where they are; the next full release moves
`stable` again. Every published version is listed by:

```bash
gh api "/orgs/amel-tech/packages/container/medaris-keycloak/versions" \
  --jq '.[] | {tags: .metadata.container.tags, created: .created_at}'
```

Before the first image release there is no earlier `<semver>`. Going back to
the old setup is §0 in reverse (image `quay.io/keycloak/keycloak:<the version
production runs>`, the two JAR mounts restored); never
`quay.io/keycloak/keycloak:latest`, which floats the version again.

Do not re-run an old release run to roll back: when its `sha-<short>` image is
gone it rebuilds, and you get *a* build of that commit, not the one that ran.
Retag by digest.

---

## 4. Verify

Locally, with Docker, a JDK and Maven:

```bash
pnpm install --frozen-lockfile
pnpm exec nx run keycloak-theme:build-keycloak-theme
tools/keycloak/smoke-theme-jar.sh              # builds the image, boots it, checks the theme
pnpm exec nx run keycloak-theme:run-keycloak   # the same image on http://127.0.0.1:8080, admin/admin
```

On the server, after a deploy:

```bash
docker ps --format '{{.Names}} {{.Image}}' | grep -i keycloak     # ghcr.io/amel-tech/medaris-keycloak:stable
docker exec <container> /opt/keycloak/bin/kc.sh --version         # the pinned version
docker exec <container> ls -l /opt/keycloak/providers              # only medaris-keycloak-theme.jar; no keycloak-theme.jar, no madrasah-theme.jar
docker exec <container> /opt/keycloak/bin/kc.sh show-config | grep -E 'kc\.(db|cache) '   # postgres, local
```

Then:

1. Admin console → any realm → *Realm settings → Themes*: the *Login theme*
   list offers `medaris-keycloak-theme`.
2. The login pages of the `medaris` and `amel-tech-dev` realms render the
   Medaris theme, not the stock one. A theme that fails to load does **not**
   error: Keycloak serves the built-in theme and logs
   `Failed to find LOGIN theme medaris-keycloak-theme`, in the container log
   only.
3. Hard-reload (theme assets are cached aggressively) and open one more page
   than the login (forgot password, or the account console).

---

## 5. Realms

The theme id is `medaris-keycloak-theme`. `madrasah-keycloak-theme`, the id
before MDRS-10, disappears with the old JAR mounts (§0 step 3), so no realm
may still name it.

* **Production realm `medaris`**: set in `config/keycloak/realms/_base.json`
  (`loginTheme` and `emailTheme`) and applied by
  `config/keycloak/scripts/provision prod`; see `config/keycloak/RUNBOOK.md`.
* **Development realm `amel-tech-dev`**: not managed from `config/keycloak/`
  (it serves other clients too), so set it by hand: admin console → realm
  `amel-tech-dev` → *Realm settings → Themes* → *Login theme*
  `medaris-keycloak-theme` (and *Email theme* likewise) → *Save*.

---

## 6. What the first release showed, and what is not verified

The first release, `keycloak-theme-v2.0.0`, on 2026-10-13 (UTC):

1. **Promotion worked.** The promote job waited for CD (development) to build
   `sha-08490fb` and moved `2.0.0`, `stable` and `latest` to its digest at
   06:06:30.
2. **The restart left Keycloak down.** The webhook answered "Service
   restarting request queued." at 06:06:40. Coolify last saw the Keycloak and
   Postgres containers running at 06:06:53, then reported both as exited and
   did not start them; no deployment was running. The service was started
   through the Coolify API (`GET /services/<uuid>/start`) at about 06:13; the
   Keycloak log begins at 06:14:04 and the realm answered again at 06:15:30,
   after 82 s of Keycloak start-up. Sign-in was down for both realms
   for about 8.5 minutes. The job reported success: it only checked that
   Coolify accepted the request. Since then it waits for the realm (§2).
3. **Why Coolify did not start the service is not known.** Its API does not
   expose the service's restart log; read it in Coolify on the next
   occurrence.

Not verified yet:

1. That the restart pulls a new `stable` once `pull_policy: always` is set
   (§0 step 6). On 2026-10-13 the server had no `stable` before, so the start
   pulled it in any case.
2. The *restart* job's wait and start fallback has not run on GitHub Actions.
3. `start --optimized` on the server (§0 step 6, second release).
