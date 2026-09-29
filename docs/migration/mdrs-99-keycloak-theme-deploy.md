# MDRS-99 — make the Keycloak login theme deployable again

Scope of this change: the part of MDRS-99 that lives in the repository. The
production deploy itself, the SSH key, the secrets and the mount check need
access to the Keycloak host and to the repository settings, and are listed
under "Not verified" and "Follow-up".

## What was done

| Issue problem | Change |
| -- | -- |
| 4. The JAR build had not run since keycloakify 11.16 / Vite 7 | New `.github/workflows/keycloak-theme-jar.yaml`: builds the JAR on every pull request and push to `main` touching `apps/keycloak-theme/**` (and `libs/ui`, `libs/icons`, `libs/tokens`, the lockfile, the smoke script), smoke-tests it in Keycloak 26.3.2, uploads it as `keycloak-theme-jar-<sha>` for 90 days. |
| — (a JAR Keycloak cannot load fails nothing) | New `tools/keycloak/smoke-theme-jar.sh`: boots `quay.io/keycloak/keycloak:26.3.2` with the JAR in `/opt/keycloak/providers`, fails unless `/admin/serverinfo` lists `medaris-keycloak-theme` as a login and an e-mail theme and a realm using it renders its login and registration pages through the theme. |
| 2. Theme id renamed, deployed file not | The JAR is deployed as `medaris-keycloak-theme.jar`; the old `madrasah-theme.jar` is renamed to `madrasah-theme.jar.retired.<timestamp>` on the first deploy, so Keycloak stops loading the old id. |
| 1. Password SSH, no secrets | `keycloak-theme-app.yaml` uses `key:` + `fingerprint:` (`KC_SSH_PRIVATE_KEY`, `KC_SSH_HOST_FINGERPRINT`); `KC_SSH_PASSWORD` is no longer read. A first step fails with the list of missing secrets/variables before anything is copied. |
| 3. Load path unconfirmed | The host directory is no longer hard-coded (`/opt/keycloak/themes`); it is the repository variable `KC_THEME_DIR`, with no default. The runbook's new §0.1 says how to find and prove the mount into `/opt/keycloak/providers`. |
| — deploy logic inline in YAML | New `tools/keycloak/deploy-theme.sh` (POSIX sh), run on the host by `appleboy/ssh-action` `script_path`: zip-header check, backup (newest 5 kept), atomic rename, legacy retirement, SHA-256 in the log. The JAR is staged in `~/.medaris-keycloak-theme-staging/<run id>/` of the deploy user — outside the providers directory, and not in a world-writable `/tmp`. |
| — | The deploy workflow no longer builds on its own: a `preflight` job checks the configuration first, its `build` job calls `keycloak-theme-jar.yaml`, and the `deploy` job ships that run's artifact, so the shipped JAR is the smoke-tested one. |
| 5. Runbook | `docs/runbooks/deploy-keycloak-theme.md`: new §0 (providers mount, deploy key, realm themes), §1 (JAR workflow, smoke test), §2/§3/§4 rewritten for the new file name, directory and script. |

The realm side needed no change here: MDRS-97 already sets `loginTheme` and
`emailTheme` to `medaris-keycloak-theme` in `config/keycloak/realms/_base.json`.

## What was verified

- `pnpm exec nx run keycloak-theme:build-keycloak-theme` builds on keycloakify
  11.16.0 / Vite 7 (with Maven 3.9.9 and OpenJDK 21 locally):
  `keycloak-theme-for-kc-all-other-versions.jar`, 2 968 345 bytes.
- `tools/keycloak/smoke-theme-jar.sh` against that JAR: exit 0, all four checks
  `ok`. Against a JAR holding only a manifest: exit 1, all four checks `FAIL`,
  and Keycloak logs `Failed to find LOGIN theme medaris-keycloak-theme, using
  built-in themes` — so the smoke test catches the silent fallback.
- `apps/keycloak-theme/test/deploy.spec.ts` (16 tests, in `-t test`):
  - `deploy-theme.sh` against a scratch directory: installs under the theme
    id, removes the staged copy, backs up the previous JAR, retires
    `madrasah-theme.jar` so only one `*.jar` remains, keeps only the newest
    `KC_THEME_BACKUPS` backups, refuses an unset/missing
    directory, an unset staged path and a non-JAR file without touching the
    installed theme; its theme id equals `themeNames[0]` from `kc.gen.tsx`.
  - AC 1 as text: the JAR workflow triggers on `pull_request` and `push` for
    `apps/keycloak-theme/**`, builds, smoke-tests, then uploads the JAR with
    `if-no-files-found: error`.
  - the deploy workflow checks its configuration in a `preflight` job before
    the build, calls the JAR workflow, ships its artifact, uses
    `key:` + `fingerprint:` on both SSH steps, no password secret, runs
    `deploy-theme.sh` with `KC_THEME_DIR` from `vars`, and names neither
    `madrasah-theme.jar` nor `/opt/keycloak/themes`.
  - `config/keycloak/realms/_base.json` asks for the same theme id.
- `actionlint` 1.7.12 on `keycloak-theme-app.yaml`, `keycloak-theme-jar.yaml`,
  `cd-development.yaml`: no findings. `shellcheck` on both scripts: none.

## What was not verified, and why

| AC | Why not |
| -- | -- |
| The deploy job succeeds, and Keycloak's admin console lists `medaris-keycloak-theme` | Needs the secrets, `KC_THEME_DIR` and the host. The listing half is proven against a local Keycloak 26.3.2 by the smoke test, not against production. |
| The production login and registration pages render the custom theme | Needs a production deploy. Proven only for a local Keycloak with the same image and JAR. |
| The development realm renders it too | `amel-tech-dev` is not managed from the repository (see `config/keycloak/RUNBOOK.md`); switching its login theme is a console step in the runbook's §0.3. |
| The runbook states the verified mount path | The procedure and the key setup are written (§0.1, §0.2); the path itself can only be read on the host, so §0.1 says "not yet verified". |
| The JAR workflow runs green on GitHub | Not run yet — it runs on this pull request. The ubuntu-24.04 runner's Maven and Docker are assumed, as the previous workflow assumed them. |

## Follow-up

- Someone with host access: §0.1 (mount, `KC_THEME_DIR`), §0.2 (deploy key,
  secrets), then run *Keycloak Theme Deploy*, then §0.3 for `amel-tech-dev`
  and §4 to check both realms. Write the verified path into §0.1.
- `run-keycloak` in `apps/keycloak-theme/package.json` still mounts the JAR as
  `providers/keycloak-theme.jar`; harmless (local only), but could use the
  theme id for consistency.
