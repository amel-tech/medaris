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
outside Medaris too (the Amel-Tech Auth project), and sign-in is unavailable
everywhere for its start-up time. Deploy in a window agreed with that project's
owner.

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
| Deploy webhook | `KEYCLOAK_COOLIFY_RESTART_WEBHOOK` (repo secret, exists): Coolify's deploy webhook for that service |
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

2. **The Keycloak server can pull it.** The package is new. Give it the
   visibility the other `medaris-*` packages have (GitHub → *Packages* →
   `medaris-keycloak` → *Package settings*), or make sure the registry login
   of the Coolify server that runs Keycloak covers `ghcr.io/amel-tech`. Not
   verified from here.
3. **Coolify → the Keycloak service:**
   * image `quay.io/keycloak/keycloak:latest` → `ghcr.io/amel-tech/medaris-keycloak:stable`;
   * remove the two file mounts of the host file
     `/opt/keycloak/themes/madrasah-theme.jar`, into
     `/opt/keycloak/providers/keycloak-theme.jar` and into
     `/opt/keycloak/providers/madrasah-theme.jar`. Keycloak loads every
     `*.jar` in `providers/`, so they would load an old copy of the theme next
     to the one baked into the image;
   * the mount of a second product's theme JAR
     (`/opt/keycloak/providers/<name>.jar`): removed by the owner's word on
     2026-10-13;
   * keep the command and the environment as they are. The command must be
     `start` (or `start-dev`), not `start --optimized`: Keycloak picks up the
     baked provider when it re-augments at `start`, and `--optimized` skips
     that.

   Save without redeploying: `stable` does not exist yet.
4. **The realms name the theme** (§5).
5. **Release.** Merge the release-please PR for `keycloak-theme` (or create a
   release `keycloak-theme-v<semver>` by hand) in the agreed window. The
   release promotes the image `main` built to `<semver>` and `stable` and calls
   the deploy webhook (§2), and Coolify starts the new image. Then §4.

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
cannot catch a production command of `start --optimized` (§0 step 3).

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
*restart* job then calls the deploy webhook with `COOLIFY_DEPLOY_TOKEN`; a
non-2xx fails the run. The job summary records which path ran, the digest and
the tags: **that is the rollback record**.

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

## 6. Not verified yet

Written on 2026-10-12 before any of it ran:

1. Nothing of the image flow has run on GitHub Actions: the first push to
   `main` after the merge is the first image build, and the first
   `keycloak-theme` release the first promotion and deploy.
2. §0 is not done, and whether the Keycloak server can pull from GHCR (§0
   step 2) is not known.
3. That `KEYCLOAK_COOLIFY_RESTART_WEBHOOK` re-pulls `stable` (a deploy, not a
   bare restart) is assumed from its being a Coolify deploy webhook, as for the
   other apps; confirm it on the first release with §4.
