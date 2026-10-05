# MDRS-250 — The web app nazir is called nazar

The owner asked on 5 October whether the medrese and course portal should be
called "nazar" instead of "nazir", and ordered the rename once everything open
was merged (main at `b470a3fe`). This branch renames the **app**. The **role**
keeps its name: a medrese nazırı is still a nazır, and the app they and the
müderrisler work in is Nazar.

The PR is a draft until the Keycloak clients, the hosts and the secrets below
exist. Nothing in the repository can make that switch on its own.

## The rule

| "nazir" names… | Examples | What happens |
| -- | -- | -- |
| the web app | `apps/nazir`, `@medaris/nazir-web`, Nx project and commit scope `nazir-web`, release component and tag prefix, workflow, GHCR image, Dockerfile paths, compose service, `NAZIR__*` env prefix, `NAZIR_URL`, Keycloak clients `nazir`/`nazir-local`/`nazir-dev`, hosts `nazir(-dev).medaris.app`, cookies `nazir.*` and `nazir-scope`, the i18n namespace, `data-app`, the `Logo` app key, the runbook | renamed to nazar |
| the role | `MEDRESE_NAZIR`, `DERS_NAZIR`, `MADRASAH_NAZIR`, `madrasah_nazirs`, `nazirOf`, `nazirIds`, `nazirCount`, `course_nazir.*` / `madrasah.nazir.*` codes and routes, `NazirRow`, `features/nazirs`, the `Nazirs` message keys, the `/medrese/:id/nazirlar` page, every Turkish "nazır" | kept |
| a record of the past | `docs/migration/*`, `docs/adr/*`, `CHANGELOG.md` files, the design mirror under `design-system/`, dated rows of the runbook and of PRD §5.2 | kept |

## What was renamed

Counts are files / lines from `git grep -c -i <word>`, before on `origin/main`
(`b470a3fe`) and after on this branch; "nazir after" is what is left on purpose
(see the next section). Seven "nazar" lines in four `CHANGELOG.md` files were
there before (an old changelog typo) and are not part of this change.

| Area | nazir files / lines before | nazir after | nazar after | What |
| -- | -- | -- | -- | -- |
| `apps/nazir` → `apps/nazar` | 192 / 1108 | 135 / 883 | 137 / 244 | `git mv` of 267 files; package `@medaris/nazar-web`, project `nazar-web`; namespace calls, cookies, `data-app`, `<Logo app>`, `loadRootEnv("nazar")`, Dockerfile paths, comments and test titles |
| `apps/tedrisat` | 167 / 1623 | 161 / 1613 | 9 / 10 | Dockerfile `COPY`; the two Keycloak e2e specs (`nazar-dev`, `nazar-local`); six comments that name the app |
| `apps/nizam` | 28 / 98 | 18 / 48 | 16 / 72 | `NAZAR_URL`; `/nazar-yonlendirme` (route, `NazarRedirectPage`, spec); `landingFor`/`roleApp`/`KoskListEmptyState` answer `nazar`; Dockerfile |
| `apps/tedris` | 14 / 42 | 3 / 7 | 12 / 47 | `NAZAR_URL`, `E2E_NAZAR_URL`; `AssignmentApp` and `openUrl` use `nazar`; `nazarUrl` prop; Dockerfile |
| `apps/landing`, `apps/teskilat` | 4 / 6 | 0 / 0 | 4 / 12 | cookie table and its spec; Dockerfile `COPY` |
| `libs/i18n` | 14 / 148 | 9 / 123 | 13 / 47 | `locales/{tr,en,ar}/nazir.json` → `nazar.json` (moved, contents unchanged except the display name); index exports, Tolgee, README; the nizam and tedris keys that name the app |
| `libs/common` | 8 / 73 | 8 / 73 | 0 / 0 | the role only; untouched |
| `libs/env` | 3 / 5 | 0 / 0 | 3 / 5 | `WEB_APPS` and `MedarisApp` say `nazar`; `NAZAR_WEB_PORT` is root-only |
| `libs/ui`, `libs/tokens`, `libs/services` | 33 / 465 | 28 / 459 | 6 / 8 | `Logo` app key and label, a comment each; the generated client is untouched |
| `config/keycloak` | 5 / 13 | 0 / 0 | 5 / 13 | `clients/{local,prod}/nazar.json` (`nazar-local`, `nazar`, `https://nazar.medaris.app`), secret names, runbook |
| `.github/workflows` | 3 / 28 | 0 / 0 | 3 / 28 | `nazar-web.yaml` (moved), `cd-development.yaml`, CodeQL comment |
| `tools/*` | 6 / 16 | 2 / 5 | 7 / 16 | `setup-realm.sh` (`nazar-dev`), `assert-release-config.mjs`, `assert-env-compose-parity.mjs`, `favicons.sh`, the verification dashboard |
| `docs/runbooks` | 1 / 43 | 1 / 7 | 1 / 40 | `deploy-nazar-web.md` (moved) |
| `docs/PRD.md` | 1 / 7 | 1 / 2 | 1 / 5 | the plan rows; the role rows and the dated §5.2 stay |
| root files | 11 / 52 | 1 / 1 | 11 / 54 | `.coderabbit.yaml`, `.env.example`, `.release-please-manifest.json`, `release-please-config.json`, `pnpm-workspace.yaml`, the lockfile importer key, `docker-compose.yml`, `commitlint.config.mjs`, `AGENTS.md`, `CONTRIBUTING.md`, `README.md` |
| history: `docs/migration`, `docs/adr`, `design-system`, changelogs | 65 / 279 | 65 / 279 | 4 / 7 | untouched (the 7 nazar lines are the old changelog typo) |
| **total** | **555 / 4006** | **432 / 3500** | **232 / 608** | |

The display name is its own commit (`feat(i18n, ui, nazar-web): … show the
app's name as Nazar`): 48 strings in nine locale files (tr "Nazar’da aç",
"Nazar’a git", "Nazar uygulamasından", en "the Nazar app", ar «نظر»), the page
title "Medaris Nazar", the `Logo` label, the cookie table's "Tedris, Nizam ve
Nazar", and the comments and specs that quote them.

## What `nazir` is left, and why

`git grep -inw "nazir" -- . ':!docs/migration' ':!docs/adr' ':!design-system' ':!**/CHANGELOG.md' ':!pnpm-lock.yaml'`
prints 749 lines in 198 files (`-w` does not match inside role identifiers such as
`MEDRESE_NAZIR`, which are counted under the other spellings below):

| Directory | Files | Lines | Why they stay |
| -- | -- | -- | -- |
| `apps/nazar` | 119 | 339 | 267 lines cite design screens (`nazir/12`, `nazir 06`, `Nazir 09's page`); 72 name the role (`const nazir`, `nazir={editing}`, `chosen-nazir`, the `nazir` column key) |
| `apps/tedrisat` | 65 | 313 | 135 cite design screens in comments and OpenAPI descriptions; 178 are the role (`NAZIR` test ids, `madrasah.nazir.appoint` routes, `src/madrasah/nazir/`) |
| `libs/services` | 3 | 69 | the generated tedrisat client and spec repeat those design citations; regenerating would only reproduce them |
| `libs/common` | 2 | 13 | the role (`madrasah.nazir.appoint`, `const nazir = role(…)`) |
| `libs/i18n` | 4 | 5 | the role: `Nazirs.columns.nazir` and en's "Madrasah nazir"/"Course nazir" role labels |
| `tools/dogrulama-panosu` | 2 | 3 | the role's e2e accounts (`e2e-medrese-nazir@…`) and the design-screen prefix `nazir`, now mapped to the nazar project |
| `docs/runbooks` | 1 | 5 | dated records: the application's and the image's former names in the header and §3.2, the 2026-09-20 measurement on `nazir-dev`, the old images as rollback values, run 35536080527 of `nazir-web.yaml` |
| `docs/PRD.md` | 1 | 1 | §5.2 "Current state (as of 2026-07-05)" |
| `commitlint.config.mjs` | 1 | 1 | `nazir-web` stays in `scope-enum` for the open branches that use it; a later PR removes it |

The other spellings: `NAZIR` is only role identifiers (`MEDRESE_NAZIR`,
`DERS_NAZIR`, `NAZIR_ID`, `NAZIR_COURSE_SCOPE_INVALID`, …) plus
`NAZIR_WEB_COOLIFY_WEBHOOK` twice in the runbook's dated rows. `Nazir` is role
code (`NazirRow`, `MadrasahNazirService`), the design citation "Nazir 09" and
PRD §5.2. `nazir-` is `nazir-1` (a test user), tedrisat's role files
(`nazir-not-found.error.ts`, `nazir-grant-scopes.ts`, `nazir-course-scope`),
and the runbook and commitlint rows above. `-nazir` is `madrasah-nazir`,
`appoint-nazir`, `chosen-nazir`, the role's e2e accounts, and the old image
names in the runbook. `nazir.` is role code and codes (`nazir.name`,
`course_nazir.assign`). `nazir/` is the design citations and tedrisat's
`src/madrasah/nazir/`.

## Behaviour changes

- The app answers at `https://nazar.medaris.app` and `https://nazar-dev.medaris.app`
  once the hosts exist; the old hosts work only if Coolify keeps them as extra
  domains.
- Everyone signed in to the app goes through Keycloak once more (silent while
  the SSO session lasts): the NextAuth cookies are `nazar.*` and the new host
  has none. The remembered scope cookie is `nazar-scope`, so the app opens on
  the first scope once.
- nizam's page for medrese and course staff moved from `/<locale>/nazir-yonlendirme`
  to `/<locale>/nazar-yonlendirme`; the old address is no longer a route.
- tedris and nizam read `NAZAR_URL`. Where only `NAZIR_URL` is set, "Nazar’da
  aç", "Nazar’a git" and "Düzenlemeye dön" disappear without an error (the
  variable is optional).
- A local `.env` with `NAZIR__*` keys makes `loadRootEnv` throw for every app:
  `"NAZIR__…" names "NAZIR", which is not an app or a group`.
- Releases are tagged `nazar-web-v*`, the image is `ghcr.io/amel-tech/medaris-nazar-web`,
  the workflow is "Nazar Web", telemetry reports `nazar-web`.
- With the display-name commit: the interface says Nazar (ar «نظر») wherever it
  named the app.

## Deploy order (before the PR leaves draft)

Old and new names live side by side during the switch; nothing below removes a
nazir name until the last step.

1. **Keycloak, `medaris` realm.** Run `config/keycloak/scripts/provision prod`
   from this branch (with `KC_CLIENT_SECRET_NAZAR` set, or empty for a
   generated secret): it creates the client `nazar` on `https://nazar.medaris.app`.
   For a local realm, `provision local` creates `nazar-local`
   (`KC_CLIENT_SECRET_NAZAR_LOCAL`). The scripts never delete a client, so
   `nazir` stays until it is removed by hand.
2. **Keycloak, `amel-tech-dev` realm** (not managed from `config/keycloak`):
   create or rename the client `nazar-dev`, confidential, standard flow, PKCE
   S256, the `tedrisat-api` audience mapper, redirect URIs for
   `https://nazar-dev.medaris.app/api/auth/callback/keycloak` and
   `http://localhost:4002/api/auth/callback/keycloak`, post-logout to the same
   hosts; note its secret. (`tools/keycloak/setup-realm.sh` makes the same
   client on a local Keycloak.)
3. **tedrisat, every environment:** `KEYCLOAK_ALLOWED_CLIENTS` gets `nazar-dev`
   (development) and `nazar` (production) next to the `nazir` entries, and
   `ALLOWED_ORIGINS` gets the new host wherever it lists the old one; redeploy.
   Until then the API refuses every token the renamed app sends.
4. **DNS:** `nazar.medaris.app` and `nazar-dev.medaris.app` point where the
   nazir hosts point.
5. **Coolify, the app** (development `rcwww0wkosws0g8ks8oks4c4`, and the
   production twin once it exists): domain `https://nazar-dev.medaris.app` /
   `https://nazar.medaris.app` (keep the old one as a second domain for
   bookmarks if wanted), image `ghcr.io/amel-tech/medaris-nazar-web` with tag
   `latest` / `stable`, and the environment `KEYCLOAK_CLIENT_ID=nazar-dev` /
   `nazar`, the new client's `KEYCLOAK_CLIENT_SECRET`, `NEXTAUTH_URL` on the new
   host, `OTEL_SERVICE_NAME=nazar-web`. Renaming the application to
   `nazar-web` is optional; if it is recreated, its uuid goes into the runbook.
   **Coolify, tedris-web and nizam-web:** add `NAZAR_URL` (the new host) in
   place of `NAZIR_URL`.
6. **GitHub secrets:** `NAZAR_WEB_COOLIFY_WEBHOOK` (the development application's
   deploy webhook) and, for production, `NAZAR_WEB_PROD_COOLIFY_WEBHOOK` (the
   old production secret was never set either; MDRS-87).
7. **GHCR:** the first run of `nazar-web.yaml` after the merge creates the
   package `medaris-nazar-web` and only then calls the webhook. If Coolify
   pulls without credentials, give the new package the visibility the old one
   has right after that first push, or the first deploy fails at the pull.
8. **Release anchor (optional):** release-please now looks for `nazar-web-v*`
   tags and finds none (this app's historical tags are `nazir-web-v*`). Pushing
   `nazar-web-v0.2.0` at the commit `nazir-web-v0.2.0` names gives the first
   nazar-web release PR the same baseline.
9. **Every local `.env`:** `NAZIR__` → `NAZAR__`, `NAZIR_WEB_PORT` →
   `NAZAR_WEB_PORT`, `TEDRIS__NAZIR_URL` / `NIZAM__NAZIR_URL` → `…NAZAR_URL`,
   `NAZAR__KEYCLOAK_CLIENT_ID=nazar-dev` with that client's secret, `nazar-dev`
   in `API__KEYCLOAK_ALLOWED_CLIENTS`; Playwright runs of tedris read
   `E2E_NAZAR_URL`. One command for the renames:
   `sed -i 's/^NAZIR__/NAZAR__/; s/^NAZIR_WEB_PORT=/NAZAR_WEB_PORT=/; s/__NAZIR_URL=/__NAZAR_URL=/' .env`.
10. **Merge.** `cd-development.yaml` builds and deploys `nazar-web`; sign in at
    `https://nazar-dev.medaris.app`, open a medrese, and follow "Nazar’da aç"
    from tedris and nizam.
11. **After the switch has held:** remove the `nazir` clients and the `nazir*`
    entries of `KEYCLOAK_ALLOWED_CLIENTS`, the `NAZIR_WEB_*` secrets, the old
    domains, and (in a later PR) `nazir-web` from `commitlint.config.mjs`. Keep
    the old GHCR package as long as a rollback to it may be wanted.

## Rollback

- **Before step 11** nothing on the Keycloak side needs undoing: the nazir
  clients and allowed-client entries are still there. Point the Coolify
  application back at a digest of `ghcr.io/amel-tech/medaris-nazir-web` with the
  old `KEYCLOAK_CLIENT_ID`, secret, `NEXTAUTH_URL` and domain; the image reads
  the same unprefixed variables as the new one. Put `NAZIR_URL` back on tedris
  and nizam if their images are rolled back too.
- **In the repository**, revert the merge; the workflow `nazir-web.yaml` and
  every old name come back together.
- **Only the display name:** revert the commit "show the app's name as Nazar";
  it touches strings, comments and the specs that read them, nothing else.

## Decided by default, owner may overrule

1. **The interface says Nazar.** The owner's question was about the app's
   name, and the app is also the müderris's and the başmüderris's, so "Nazır"
   as its name kept meaning the role. The copy change is one commit and can be
   dropped alone. Arabic writes it «نظر», transliterated like «نظام» and «تدريس».
2. **Design citations keep the design's name.** `nazir/12`, `Nazır 02`,
   `Nazir 09's page`, "the Nazır canvas" cite screens of the design canvas,
   whose mirror under `design-system/` is not renamed. Renaming 471 lines would
   point them at screens that do not exist under that name. The verification
   dashboard keeps the `nazir` screen prefix and maps it to the nazar project.
3. **Role words inside the app stay.** `features/nazirs`, the `Nazirs` message
   keys, `/medrese/:id/nazirlar`, `NazirRow`, `Account.noNazirNote` name the
   role (the nazırlar page), so they keep "nazir".
4. **`/nazir-yonlendirme` gets no redirect.** It is nizam's internal landing
   for people whose roles are the medrese's; the home page sends them to the
   new address, and nothing links to the old one.
5. **`commitlint` keeps `nazir-web`** for the open branches (as ordered); it
   leaves in a later PR.
6. **Dated records keep their words**: PRD §5.2, the runbook's dated rows, the
   dashboard's saved state and its issue short titles ("Nazır kabuğu",
   "Nazırlar", "Nazır dersleri").
7. **The manifest version stays 0.2.0** and no tag is pushed here; step 8 is
   the owner's call.
8. **`.env.example` allows only `nazar-dev`**, not both: it describes a fresh
   machine; deployed tedrisat lists both during the switch (step 3).
9. **tedrisat comments that name the app say nazar** (six lines); its OpenAPI
   descriptions only cite design screens, so the generated client is not
   regenerated and the OpenAPI check stays fresh.
10. **Test addresses and ids follow the app:** `http://nazar.test`,
    `KEYCLOAK_CLIENT_ID: "nazar-test"` in the unit-test env.

## Commits

1. `refactor(nazar-web): … rename the app directory and package to nazar` —
   `git mv apps/nazir apps/nazar` plus the package, project, workspace entry,
   lockfile importer key and the commitlint scope.
2. `chore(repo): … rename the nazir app in workspace, release and CI config`.
3. `chore(repo, env): … rename the app's Keycloak clients, env keys and compose service`.
4. `refactor(nazar-web, i18n, ui): … rename the app's message namespace, cookies and app key`.
5. `refactor(nizam-web, tedris-web, i18n): … point the links, app keys and redirect page at nazar`.
6. `feat(i18n, ui, nazar-web): … show the app's name as Nazar`.
7. this record.

Commits 1 to 3 only make sense together: after 1, `assert-release-config` and
every Docker build fail until 2 renames the release component and the
Dockerfile `COPY` lines, and `docker compose --profile web` builds the old
Dockerfile path until 3. From 3 on, every commit typechecks (nizam, nazar and
tedris had 0 errors at 3); the touched specs ran at 3, and the full suites of
the apps each later commit touches ran at 4, 5 and 6.

## Verified (counts read off the output)

- `pnpm install --frozen-lockfile --prefer-offline` with the renamed workspace:
  "Lockfile is up to date", exit 0; the only lockfile change is the importer key.
- `nx show projects` lists `nazar-web` and no `nazir-web`;
  `nx run nazar-web:typecheck`, `nx run nazar-web:lint` (260 files) and
  `nx run nazar-web:build` (with `.env.example` copied to `.env`, as the
  Dockerfile does; 45.5 s) exit 0.
- `levelcheck.sh` run for `apps/nazar`: tsc 0 errors in tedrisat, nizam, nazar,
  tedris (landing 0 as well); spec name check clean apart from the known
  `vitest.config.ts` TS2307 line; Biome ratchet errors 0, warnings 70, infos
  21; OpenAPI spec fresh (184 paths).
- Unit suites: nazar 50 files / 1076 tests, nizam 46 / 756, tedris 80 / 802
  (with `NODE_OPTIONS=--no-experimental-webstorage`), landing 8 / 74, libs/ui
  13 / 164 (with the same flag; without it 25 `theme.spec.tsx` tests fail on
  Node's experimental `localStorage`, the same environmental failure as
  tedris's), libs/env 2 / 57, libs/common 12 / 176, tedrisat unit 80 / 1082.
- `node tools/ci/assert-release-config.mjs`: "7 components, one config, one
  manifest, chain intact", `nazar-web → .github/workflows/nazar-web.yaml`.
- `node tools/ci/assert-env-compose-parity.mjs`: 64 in-scope keys reach a
  container. `config/keycloak/scripts/validate`: ok for `local` and `prod`.
- commitlint passes on all seven messages.

## Not verified

- No Keycloak, Coolify, DNS, GHCR or GitHub secret was touched or read; the
  deploy order above is written from the repository, the runbooks and the
  scripts, not tried.
- No browser: the Playwright specs of nazar, nizam and tedris were renamed
  (cookie and route names, `E2E_NAZAR_URL`, copy) but not run; they need a
  running stack and a realm with the new clients.
- No tedrisat e2e: `keycloak-audience` and `keycloak-provision` name the new
  clients and were only typechecked.
- No Docker image was built; `nx build nazar-web` ran on the host.
- How release-please behaves without a `nazar-web-v*` anchor, the default
  visibility of a new GHCR package in the organisation, and what Coolify does
  when a pull fails were not checked.
