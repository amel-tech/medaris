# Runbook — deploy Keycloak Theme

This one is not like the other six. **No container image is built and nothing is
pushed to GHCR.** The workflow builds a JAR on the runner, copies it onto the
Keycloak host over SSH, swaps it into place, and restarts Keycloak through a
Coolify webhook. Read the rollback section before you deploy.

MDRS-99 changed four things, all described below: the JAR is built and
smoke-tested by its own workflow on every change (§1); SSH uses a deploy key
pinned by host fingerprint instead of a password (§0.2); the file on the host
is `medaris-keycloak-theme.jar`, named after the theme id, and the old
`madrasah-theme.jar` is retired on the first deploy (§2); and the host
directory is no longer hard-coded but read from the `KC_THEME_DIR` repository
variable, which has to be the directory mounted at `/opt/keycloak/providers`
(§0.1).

| | |
|---|---|
| Nx project | `keycloak-theme` |
| Source | `apps/keycloak-theme/` |
| Workflows | `.github/workflows/keycloak-theme-jar.yaml` (build + smoke test, every change) and `.github/workflows/keycloak-theme-app.yaml` (deploy) |
| Nx target | `build-keycloak-theme` (there is **no** `build` target — see §1) |
| Build output | `apps/keycloak-theme/dist_keycloak/keycloak-theme-for-kc-all-other-versions.jar` |
| Theme id | `medaris-keycloak-theme` (`apps/keycloak-theme/src/kc.gen.tsx`; the realms ask for it in `config/keycloak/realms/_base.json`) |
| Deployed path | `$KC_THEME_DIR/medaris-keycloak-theme.jar` — `KC_THEME_DIR` is a repository **variable**, **not set**; **mount not yet verified** (§0.1) |
| Deploy script | `tools/keycloak/deploy-theme.sh`, run on the host by the workflow |
| Target server | Keycloak 26.3.2 (`apps/keycloak-theme/package.json` → `run-keycloak`) |
| SSH secrets | `KC_SSH_HOST`, `KC_SSH_USERNAME`, `KC_SSH_PRIVATE_KEY`, `KC_SSH_HOST_FINGERPRINT`, `KC_SSH_PORT` (optional, defaults 22) — **none set** |
| Restart webhook | `KEYCLOAK_COOLIFY_RESTART_WEBHOOK` (repo secret — **not set**) |
| Deploy token | `COOLIFY_DEPLOY_TOKEN` (org secret — present) |

The deploy job's first step checks the variable and the four required SSH
secrets and fails with the list of what is missing, before anything is copied.

---

## 0. One-time setup

Done once per Keycloak host, by someone with shell access to it and admin
access to the repository settings. Nothing here is automated; each step says
how to check it.

### 0.1 Find and record the providers mount

Keycloak 26 loads theme JARs from `/opt/keycloak/providers` **inside the
container**. The deploy writes to a directory **on the host**, so that
directory has to be bind-mounted there. Before MDRS-99 the workflow wrote to
`/opt/keycloak/themes` on the host, and nobody had confirmed that path was
mounted anywhere — a JAR in an unmounted directory fails nothing, the realm
just falls back to the built-in theme.

1. In Coolify, open the Keycloak service → *Storages* (or its compose file) and
   find the mount whose container path is `/opt/keycloak/providers`. Note the
   host path.
2. On the host, confirm it from the running container:

   ```bash
   docker ps --format '{{.Names}}' | grep -i keycloak
   docker inspect <container> \
     --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{"\n"}}{{end}}' \
     | grep /opt/keycloak/providers
   ```

   No output means there is no such mount: add one in Coolify (host directory
   → `/opt/keycloak/providers`) and redeploy the Keycloak service first.
3. Check the mount is the one the container sees:

   ```bash
   touch <host path>/mdrs-99-probe
   docker exec <container> ls -l /opt/keycloak/providers/mdrs-99-probe
   rm <host path>/mdrs-99-probe
   ```

4. Repository → *Settings → Secrets and variables → Actions → Variables* →
   `KC_THEME_DIR` = that host path.
5. Replace this step's text with the verified path and the date:
   **Verified mount path:** _not yet verified_ (MDRS-99 left this open; the
   repository has no access to the host).

If the Coolify restart webhook (§3.3) recreates the container, the directory
must be a bind mount or a named volume — a path inside the container's own
filesystem is lost on every restart.

Two more things to check while you are there:

* **The start command.** Keycloak 26 only picks up a new provider JAR when it
  re-augments: `start` (and `start-dev`) do that on boot, `start --optimized`
  does **not** — it keeps the build baked into the image, and the theme
  silently stays on the old JAR or the built-in one while the deploy is green.
  If the service runs `start --optimized`, it needs a `kc.sh build` step after
  the JAR changes, or a plain `start`. The smoke test (§1) cannot catch this:
  it uses `start-dev`.
* **The old JAR.** `deploy-theme.sh` retires `madrasah-theme.jar` only inside
  `KC_THEME_DIR`. Every deploy before MDRS-99 wrote it to `/opt/keycloak/themes`
  on the host; if that is a different directory and it **is** mounted into the
  container somewhere Keycloak loads from, remove the old file there by hand
  (`mv madrasah-theme.jar madrasah-theme.jar.retired.<date>`), or the old
  theme id keeps loading.

### 0.2 Deploy key

The workflow authenticates with an SSH key, never a password, and pins the
host key.

1. Generate a key pair used for nothing else, without a passphrase (the
   workflow has no way to type one):

   ```bash
   ssh-keygen -t ed25519 -N '' -C 'github-actions medaris keycloak-theme deploy' \
     -f ./kc-theme-deploy
   ```

2. On the host, add `kc-theme-deploy.pub` to `~/.ssh/authorized_keys` of the
   deploy user. Restrict what the key can do; the deploy needs `scp` and a
   shell for `deploy-theme.sh`, so restrict forwarding rather than the
   command:

   ```text
   no-agent-forwarding,no-port-forwarding,no-X11-forwarding,no-pty ssh-ed25519 AAAA… github-actions medaris keycloak-theme deploy
   ```

   The deploy user needs write access to `KC_THEME_DIR` and to its own home
   (the JAR is staged there), and nothing else.
3. Read the host key fingerprint **on the host** (not through the network you
   are trying to protect against):

   ```bash
   ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub -E sha256 | cut -d' ' -f2
   # SHA256:xxxxxxxx…
   ```

   The secret is that whole field, **including** the `SHA256:` prefix:
   `appleboy/ssh-action` and `scp-action` compare it verbatim against Go's
   `ssh.FingerprintSHA256`, which returns that form. A mismatch fails the job
   with `ssh: host key fingerprint mismatch`.
4. Repository → *Settings → Secrets and variables → Actions → Secrets*:

   | Secret | Value |
   | -- | -- |
   | `KC_SSH_HOST` | Host name or IP of the Keycloak host |
   | `KC_SSH_USERNAME` | The deploy user |
   | `KC_SSH_PRIVATE_KEY` | Contents of `kc-theme-deploy` (the private key, including the `BEGIN`/`END` lines) |
   | `KC_SSH_HOST_FINGERPRINT` | From step 3 |
   | `KC_SSH_PORT` | Only if not 22 |
   | `KEYCLOAK_COOLIFY_RESTART_WEBHOOK` | Coolify → Keycloak service → *Webhooks* → restart/deploy URL |

5. Delete the local key files. Delete `KC_SSH_PASSWORD` if it was ever set,
   and turn off password login for the deploy user.

### 0.3 Point the realms at the theme

The theme id is `medaris-keycloak-theme`. `madrasah-keycloak-theme`, the id
before MDRS-10, stops existing on the first deploy (§2 step 4), so no realm
may still name it.

* **Production realm `medaris`** — set in `config/keycloak/realms/_base.json`
  (`loginTheme` and `emailTheme`) and applied by
  `config/keycloak/scripts/provision prod`; see `config/keycloak/RUNBOOK.md`.
* **Development realm `amel-tech-dev`** — not managed from `config/keycloak/`
  (it serves other clients too), so switch it by hand in the same deployment:
  admin console → realm `amel-tech-dev` → *Realm settings → Themes* → *Login
  theme* `medaris-keycloak-theme` (and *Email theme* likewise) → *Save*.

---

## 1. What the build actually runs

Since MDRS-99 `.github/workflows/keycloak-theme-jar.yaml` builds the JAR on
every pull request and every push to `main` that touches
`apps/keycloak-theme/**`, `libs/ui`, `libs/icons`, `libs/tokens`, the lockfile
or the smoke script, and keeps it as the artifact `keycloak-theme-jar-<sha>`
(90 days). The deploy workflow calls the same workflow for its build, so the
JAR that ships is the one that passed the smoke test below.

After the build, `tools/keycloak/smoke-theme-jar.sh` boots
`quay.io/keycloak/keycloak:26.3.2` with the JAR in `/opt/keycloak/providers`
and fails unless `/admin/serverinfo` lists `medaris-keycloak-theme` as a login
and an e-mail theme, and a realm using it renders both its login and its
registration page through the theme (keycloakify's `kcContext` with
`pageId` `login` / `register`). A JAR that does not load would otherwise pass
unnoticed. Run it locally the same way after a build (needs Docker, `curl`,
`jq`).

`apps/keycloak-theme/project.json` declares only a `lint` target. Every other
target is inferred by Nx from `package.json` scripts, so there is no
`nx build keycloak-theme`; the real target is:

```bash
pnpm exec nx run keycloak-theme:build-keycloak-theme   # = vite build && keycloakify build
```

`nx show project keycloak-theme` lists it. Running it through Nx (rather than
`cd apps/keycloak-theme && …`) is what builds `@medaris/ui` and `@medaris/icons`
first, via `nx.json` `targetDefaults`.

keycloakify (11.16.0 since MDRS-21) shells out to Apache Maven (`mvn -B -ntp clean install`
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
* **Fan-out path** — Actions → **CD (development)** (`cd-development.yaml`) with `dry_run: false`. Never on a push: the dispatcher excludes this app from its `push: main` fan-out because the workflow restarts the shared Keycloak (MDRS-86). This
  workflow is called whenever `nx affected` reports `keycloak-theme`, which
  includes changes to `libs/ui`, `libs/icons` and `libs/tokens`.

What the deploy does, in order:

1. **preflight** job — checks `KC_THEME_DIR` and the SSH secrets are set, and
   fails in seconds with the list of what is missing.
2. **build** job — `keycloak-theme-jar.yaml`: builds the JAR, smoke-tests it in
   Keycloak 26.3.2 (§1), uploads it as `keycloak-theme-jar-<sha>` (90-day
   retention). The **deploy** job downloads that artifact.
3. `scp` (deploy key, pinned host key) the JAR to a staging directory in the
   deploy user's home, `~/.medaris-keycloak-theme-staging/<run id>/` — outside
   the providers directory, so a restart in between cannot load it, and not in
   a world-writable `/tmp`, where another local user could swap it.
4. Over SSH, `tools/keycloak/deploy-theme.sh` with `KC_THEME_DIR` and the
   staged path:
   * refuses a missing directory, an empty file, or a file without a zip
     header (an HTML error page, a truncated upload);
   * copies the current `medaris-keycloak-theme.jar` to
     `medaris-keycloak-theme.jar.backup.<UTC YYYYmmdd_HHMMSS>`;
   * writes the new JAR next to it under a name not ending in `.jar`, then
     renames it over `medaris-keycloak-theme.jar` (atomic on one filesystem);
   * renames `madrasah-theme.jar`, if present, to
     `madrasah-theme.jar.retired.<UTC timestamp>` — Keycloak only loads
     `*.jar`, so the old theme id disappears at the restart and a realm still
     naming it shows up as a fallback rather than quietly working;
   * keeps the newest 5 backups (`KC_THEME_BACKUPS` on the host overrides it)
     and deletes older ones;
   * prints the deployed file's SHA-256 into the run log.
5. `GET` the Coolify restart webhook. **This step fails the job on a non-2xx**
   — a 401 or a Coolify 5xx would otherwise leave a new JAR on disk, an
   unrestarted Keycloak, and a green checkmark.

---

## 3. Rollback

There are two independent sources for a known-good JAR. Prefer the first.

### 3.1 Restore the on-host backup (fastest, no rebuild)

Every deploy leaves the JAR it replaced at
`$KC_THEME_DIR/medaris-keycloak-theme.jar.backup.<YYYYmmdd_HHMMSS>` (UTC).
Rolling back past the first MDRS-99 deploy means the old theme id: restore
`madrasah-theme.jar.retired.<timestamp>` to `madrasah-theme.jar` **and** point
the realms back at `madrasah-keycloak-theme` — the old JAR does not provide
`medaris-keycloak-theme`.

```bash
ssh <KC_SSH_USERNAME>@<KC_SSH_HOST> -p <KC_SSH_PORT|22>

# Newest backups last. The timestamp is the moment that file was DISPLACED,
# i.e. the deploy that replaced it — not the moment it was built.
cd "$KC_THEME_DIR"   # the verified host path from §0.1
ls -lt medaris-keycloak-theme.jar.backup.*

# Keep the currently-broken one so you can still inspect it. The suffix must
# not end in .jar, or Keycloak loads it too.
cp medaris-keycloak-theme.jar medaris-keycloak-theme.jar.bad.$(date -u +%Y%m%d_%H%M%S)

cp medaris-keycloak-theme.jar.backup.<TIMESTAMP> medaris-keycloak-theme.jar
```

Note `cp`, not `mv` — keep the backup file itself in place so a second rollback
attempt still has something to restore from.

Then restart Keycloak (§3.3).

> **Caveat, and it matters:** only the newest 5 backups are kept (§2 step 4),
> and nothing records which release each corresponds to. The only ordering
> signal is the timestamp in the filename. If the host has been rebuilt, or the
> directory behind `KC_THEME_DIR` is not persistent, there may be no backup at
> all — use §3.2.

### 3.2 Re-upload a JAR from a past workflow run

```bash
# List runs of this workflow, newest first. A deploy made through the
# CD (development) fan-out ran as a called workflow: its artifact belongs to
# the cd-development.yaml run, so look there too.
gh run list --workflow keycloak-theme-app.yaml --limit 20
gh run list --workflow cd-development.yaml --limit 20

# Download the JAR that run produced.
gh run download <RUN_ID> --name keycloak-theme-jar-<SHA> --dir ./rollback

ssh <KC_SSH_USERNAME>@<KC_SSH_HOST> -p <KC_SSH_PORT|22> 'mkdir -p kc-rollback'
scp -P <KC_SSH_PORT|22> \
    ./rollback/keycloak-theme-for-kc-all-other-versions.jar \
    <KC_SSH_USERNAME>@<KC_SSH_HOST>:kc-rollback/

# The same script the workflow runs: backs up the current JAR, swaps, prints
# the SHA-256.
ssh <KC_SSH_USERNAME>@<KC_SSH_HOST> -p <KC_SSH_PORT|22> \
  "KC_THEME_DIR='<verified path from §0.1>' KC_STAGED_JAR=kc-rollback/keycloak-theme-for-kc-all-other-versions.jar sh -s" \
  < tools/keycloak/deploy-theme.sh
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
container rather than redeploying it from a base image. Either way the JAR
survives only because `KC_THEME_DIR` is a host mount (§0.1).

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
  'ls -l <KC_THEME_DIR>/*.jar; sha256sum <KC_THEME_DIR>/medaris-keycloak-theme.jar'
```

`medaris-keycloak-theme.jar` must be the only theme JAR, and its SHA-256 must
match the one the deploy run printed. Then:

1. Admin console → any realm → *Realm settings → Themes* → the *Login theme*
   drop-down lists `medaris-keycloak-theme`.
2. Open the login page of the `medaris` realm and of `amel-tech-dev` and
   confirm both render the Medaris theme, not the stock Keycloak one — a JAR
   that fails to load does **not** error, Keycloak silently serves the
   built-in theme and logs `Failed to find LOGIN theme medaris-keycloak-theme`.
2. Hard-reload (theme assets are aggressively cached).
3. Exercise at least one non-login page (account console / forgot password),
   since a partial theme can render the login page and nothing else.

**TODO(verify against Coolify):** where to read Keycloak's container logs — a
theme-load failure appears there and nowhere else.

---

## 5. Known blockers

1. **None of this workflow's secrets exist, and `KC_THEME_DIR` is not set.**
   The deploy job stops at its first step until §0.1 and §0.2 are done by
   someone with access to the host and to the repository settings.
2. **The providers mount is not verified.** §0.1 is the procedure; its
   "Verified mount path" line is to be filled in when it has been run.
3. **Provenance is the run log.** The deployed file carries no commit; the
   deploy run prints its SHA-256 and the artifact `keycloak-theme-jar-<sha>`
   holds the same bytes for 90 days.
