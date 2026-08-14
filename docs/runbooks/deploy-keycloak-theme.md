# Runbook — deploy Keycloak Theme

This one is not like the other six. **No container image is built and nothing is
pushed to GHCR.** The workflow builds a JAR on the runner, copies it onto the
Keycloak host over SSH, swaps it into place, and restarts Keycloak through a
Coolify webhook. Read the rollback section before you deploy — the only rollback
artefact is a timestamped file the workflow leaves on that host.

| | |
|---|---|
| Nx project | `keycloak-theme` |
| Source | `apps/keycloak-theme/` |
| Workflow | `.github/workflows/keycloak-theme-app.yaml` |
| Nx target | `build-keycloak-theme` (there is **no** `build` target — see §1) |
| Build output | `apps/keycloak-theme/dist_keycloak/keycloak-theme-for-kc-all-other-versions.jar` |
| Deployed path | `/opt/keycloak/themes/madrasah-theme.jar` |
| Target server | Keycloak 26.3.2 (`apps/keycloak-theme/package.json` → `run-keycloak`) |
| SSH secrets | `KC_SSH_HOST`, `KC_SSH_USERNAME`, `KC_SSH_PASSWORD`, `KC_SSH_PORT` (optional, defaults 22) — **none set** |
| Restart webhook | `KEYCLOAK_COOLIFY_RESTART_WEBHOOK` (repo secret — **not set**) |
| Deploy token | `COOLIFY_DEPLOY_TOKEN` (org secret — present) |

---

## 1. What the build actually runs

`apps/keycloak-theme/project.json` declares only a `lint` target. Every other
target is inferred by Nx from `package.json` scripts, so there is no
`nx build keycloak-theme`; the real target is:

```bash
pnpm exec nx run keycloak-theme:build-keycloak-theme   # = vite build && keycloakify build
```

`nx show project keycloak-theme` lists it. Running it through Nx (rather than
`cd apps/keycloak-theme && …`) is what builds `@medaris/ui` and `@medaris/icons`
first, via `nx.json` `targetDefaults`.

keycloakify 11.9.16 shells out to Apache Maven (`mvn -B -ntp clean install`
against a pom it generates) to package the theme, so the runner needs both a JDK
and Maven:

* **JDK 21** — `actions/setup-java` with `java-version: '21'`. The JAR is loaded
  by Keycloak 26, and `quay.io/keycloak/keycloak:26.3.2` runs
  `openjdk 21.0.8 2025-07-15 LTS`. The workflow previously asked for Java 11,
  inherited from a pre-Keycloak-25 theme.
* **Maven** — provided by the `ubuntu-24.04` runner image (Maven 3.9.16). The old
  `stCarolas/setup-maven@v5` step is gone: it was an unpinned third-party action
  installing an *older* Maven (3.9.6) than the runner already has. A
  `mvn --version` step remains so a future runner image dropping Maven fails
  there with a clear message instead of inside keycloakify.

keycloakify emits **two** JARs:

```
dist_keycloak/keycloak-theme-for-kc-22-to-25.jar
dist_keycloak/keycloak-theme-for-kc-all-other-versions.jar   <- the one we ship
```

Keycloak 26 needs `…-for-kc-all-other-versions.jar`. Shipping the wrong one
gives a Keycloak that starts but silently falls back to the built-in theme.

---

## 2. Normal deploy

* **Release path** — create a GitHub release tagged `keycloak-theme-<anything>`.
  The job's gate is:

  ```yaml
  if: ${{ github.event_name != 'release' || startsWith(github.event.release.tag_name, 'keycloak-theme-') }}
  ```

  i.e. *on a release, the tag must be ours; on anything else, run.* (MDRS-16
  rewrote this from an event allow-list, which never matched `workflow_call` —
  inside a reusable workflow `github.event_name` is the **caller's** event.)

  Unlike the six container apps there is **no tag-to-artifact mapping at all
  here**: the release tag never appears in the JAR's name or anywhere on the
  server. Use `keycloak-theme-v<semver>` matching
  `apps/keycloak-theme/package.json#version` (currently `1.4.0`) so a human can
  correlate the release with the deployed theme.
* **Manual path** — Actions → **Keycloak Theme Deploy** → *Run workflow*.
* **Fan-out path** — Actions → **Deploy Affected** with `dry_run: false`. This
  workflow is called whenever `nx affected` reports `keycloak-theme`, which
  includes changes to `libs/ui`, `libs/icons` and `libs/tokens`.

What the deploy does, in order:

1. Builds and verifies the JAR exists.
2. Uploads it as a workflow artifact `keycloak-theme-jar-<sha>` (90-day
   retention). Added by MDRS-16 — see §3.
3. `scp` the JAR to `/opt/keycloak/themes/` (`strip_components: 3` reduces
   `apps/keycloak-theme/dist_keycloak/x.jar` to `x.jar`).
4. Over SSH: if `/opt/keycloak/themes/madrasah-theme.jar` exists, copy it to
   `/opt/keycloak/themes/madrasah-theme.jar.backup.$(date +%Y%m%d_%H%M%S)`, then
   `mv -f` the new JAR over `madrasah-theme.jar`.
5. `GET` the Coolify restart webhook. **This step now fails the job on a non-2xx**
   — previously it swallowed every error, so a 401 or a Coolify 5xx left a new
   JAR on disk, an unrestarted Keycloak, and a green checkmark.

---

## 3. Rollback

There are two independent sources for a known-good JAR. Prefer the first.

### 3.1 Restore the on-host backup (fastest, no rebuild)

Every deploy leaves the JAR it replaced at
`/opt/keycloak/themes/madrasah-theme.jar.backup.<YYYYmmdd_HHMMSS>`.

```bash
ssh <KC_SSH_USERNAME>@<KC_SSH_HOST> -p <KC_SSH_PORT|22>

# Newest backups last. The timestamp is the moment that file was DISPLACED,
# i.e. the deploy that replaced it — not the moment it was built.
ls -lt /opt/keycloak/themes/madrasah-theme.jar.backup.*

# Keep the currently-broken one so you can still inspect it.
cp /opt/keycloak/themes/madrasah-theme.jar \
   /opt/keycloak/themes/madrasah-theme.jar.bad.$(date +%Y%m%d_%H%M%S)

cp /opt/keycloak/themes/madrasah-theme.jar.backup.<TIMESTAMP> \
   /opt/keycloak/themes/madrasah-theme.jar
```

Note `cp`, not `mv` — keep the backup file itself in place so a second rollback
attempt still has something to restore from.

Then restart Keycloak (§3.3).

> **Caveat, and it matters:** nothing prunes these backups and nothing records
> which release each corresponds to. The only ordering signal is the timestamp
> in the filename. If the host has been rebuilt, or the volume holding
> `/opt/keycloak/themes` is not persistent, there may be no backup at all — use
> §3.2. **TODO(verify against Coolify):** confirm `/opt/keycloak/themes` is on a
> persistent volume and record the retention policy here.

### 3.2 Re-upload a JAR from a past workflow run

```bash
# List runs of this workflow, newest first.
gh run list --workflow keycloak-theme-app.yaml --limit 20

# Download the JAR that run produced.
gh run download <RUN_ID> --name keycloak-theme-jar-<SHA> --dir ./rollback

scp -P <KC_SSH_PORT|22> \
    ./rollback/keycloak-theme-for-kc-all-other-versions.jar \
    <KC_SSH_USERNAME>@<KC_SSH_HOST>:/opt/keycloak/themes/

ssh <KC_SSH_USERNAME>@<KC_SSH_HOST> -p <KC_SSH_PORT|22> \
  'cp /opt/keycloak/themes/madrasah-theme.jar /opt/keycloak/themes/madrasah-theme.jar.bad.$(date +%Y%m%d_%H%M%S); \
   mv -f /opt/keycloak/themes/keycloak-theme-for-kc-all-other-versions.jar /opt/keycloak/themes/madrasah-theme.jar'
```

Artifacts only exist for runs **after** MDRS-16 lands, and expire after 90 days.
Older than that, rebuild from the tag:

```bash
git checkout keycloak-theme-v<semver>
pnpm install --frozen-lockfile
pnpm exec nx run keycloak-theme:build-keycloak-theme
# -> apps/keycloak-theme/dist_keycloak/keycloak-theme-for-kc-all-other-versions.jar
```

This is a rebuild, not the original bytes: the pnpm lockfile is pinned, but the
JDK and Maven come from your machine, so treat it as equivalent-not-identical.

### 3.3 Restart Keycloak

```bash
curl --fail-with-body --silent --show-error \
     --request GET "$KEYCLOAK_COOLIFY_RESTART_WEBHOOK" \
     --header "Authorization: Bearer $COOLIFY_DEPLOY_TOKEN"
```

**TODO(verify against Coolify):** confirm this webhook restarts the Keycloak
container rather than redeploying it from a base image, and confirm the restart
does not wipe `/opt/keycloak/themes`. If it redeploys, the JAR must be on a
mounted volume for any of §3.1/§3.2 to survive.

### 3.4 What NOT to do

Do not re-run an old workflow run to roll back. A re-run rebuilds from source —
new `pnpm install` resolution, new Maven run — so you get *a* build of that
commit, not *the* JAR that was working. Restore the file instead.

---

## 4. Verify

Locally, before or independently of a deploy — this is exactly what CI does and
it needs Docker, a JDK and Maven:

```bash
pnpm install --frozen-lockfile
pnpm exec nx run keycloak-theme:build-keycloak-theme
ls -l apps/keycloak-theme/dist_keycloak/
# expect keycloak-theme-for-kc-all-other-versions.jar (~2.9 MB)

# Boot a real Keycloak 26.3.2 with the JAR mounted as a provider.
pnpm exec nx run keycloak-theme:run-keycloak
# -> http://127.0.0.1:8080, admin/admin
```

On the deployed server:

```bash
ssh <KC_SSH_USERNAME>@<KC_SSH_HOST> -p <KC_SSH_PORT|22> \
  'ls -l /opt/keycloak/themes/madrasah-theme.jar; \
   md5sum /opt/keycloak/themes/madrasah-theme.jar'
```

Compare that md5 against the artifact you intended to deploy. Then, in a
browser:

1. Open the Keycloak login page for a realm using the theme and confirm it
   renders the Madrasah theme, not the stock Keycloak one — a JAR that fails to
   load does **not** error, Keycloak silently serves the built-in theme.
2. Hard-reload (theme assets are aggressively cached).
3. Exercise at least one non-login page (account console / forgot password),
   since a partial theme can render the login page and nothing else.

**TODO(verify against Coolify):** the public Keycloak URL, the realm name that
uses `madrasah-theme`, and where to read Keycloak's container logs — a
theme-load failure appears there and nowhere else.

---

## 5. Known blockers

1. **None of this workflow's secrets exist.** The repository has zero repo
   secrets; only the org secret `COOLIFY_DEPLOY_TOKEN` is available. Missing:
   `KC_SSH_HOST`, `KC_SSH_USERNAME`, `KC_SSH_PASSWORD`, optionally
   `KC_SSH_PORT`, and `KEYCLOAK_COOLIFY_RESTART_WEBHOOK`. Their values live in
   Coolify / the host and must be added by someone with that access.
2. **SSH password auth.** The workflow authenticates with `KC_SSH_PASSWORD`, not
   a key. Moving to an SSH key (`key:` instead of `password:` on both
   `appleboy/*-action` steps) is a worthwhile follow-up but is out of scope for
   MDRS-16.
3. **No provenance on the deployed file.** `madrasah-theme.jar` on the host
   carries no record of which commit built it. The workflow artifact
   (`keycloak-theme-jar-<sha>`) is the only commit↔JAR link, and only for 90
   days.
