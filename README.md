# Medaris — Online Medrese Sistemi

Medaris brings the classical medrese education method — mütalaa, ders, müzakere, ezber, ödev, and icazet — onto an open-source online platform.

This repository is the monorepo: two NestJS APIs, five web apps, and nine shared libraries in a single pnpm workspace orchestrated by Nx. The former `madrasah-backend` and `madrasah-frontend` repositories were merged in here with their history preserved.

## Requirements

- **Node** ≥ 22 (see `.nvmrc`)
- **pnpm** 11 — the repo pins `pnpm@11.4.0` via `packageManager`; prefer `corepack enable` over a global install
- **Docker** — only needed for the local Postgres

## Quick start

```bash
pnpm install                                      # also installs the git hook dispatcher
cp apps/tedris/.env.example apps/tedris/.env      # every app needs its own .env
pnpm build                                        # libs/common must be built first
docker compose up -d medaris-db
pnpm nx run tedris-web:dev
```

Two steps that look skippable and are not:

- **`pnpm install` in a fresh clone *or a new git worktree*.** The hook dispatcher lives in `.husky/_`, which is git-ignored. Without it `commitlint` and `lint-staged` silently never run — the commit succeeds and nothing is checked.
- **Each app needs its own `.env`.** Every `apps/*/` directory ships a `.env.example`; copy the ones you intend to run. The Next.js apps validate their environment at **build** time, so a missing file fails the build with `Invalid environment variables` rather than at startup. The root `.env.example` is for `docker-compose`, not for the apps.

## Layout

Nx project names are not always the directory names — commands take the **project name**.

| Directory | Project name | Stack | Dev port |
| --- | --- | --- | --- |
| `apps/tedrisat` | `tedrisat` | NestJS API | 3001 |
| `apps/teskilat` | `teskilat` | NestJS API | 3002 |
| `apps/tedris` | `tedris-web` | Next.js | 4000 |
| `apps/nizam` | `nizam-web` | Next.js | 4001 |
| `apps/nazir` | `nazir-web` | Next.js | 4002 |
| `apps/landing` | `landing-web` | Next.js | 4003 |
| `apps/keycloak-theme` | `keycloak-theme` | Keycloakify + Vite | Vite default |

Libraries live in `libs/` and resolve as `@medaris/*`: `common`, `hooks`, `i18n`, `icons`, `services`, `tokens`, `types`, `ui`, `utils`.

**`libs/common` must be built before either Nest app will start** — without it they fail at boot with `TS2307`. `pnpm build` handles the ordering, and `nx run tedrisat:dev` does too via `dependsOn: ["^build"]`.

## Commands

Every target runs through Nx, so results are cached and only affected projects rebuild.

| Command | What it does |
| --- | --- |
| `pnpm build` | `nx run-many -t build` |
| `pnpm typecheck` | `nx run-many -t typecheck` |
| `pnpm test` | `nx run-many -t test` |
| `pnpm lint` | `nx run-many -t lint` (Biome, per project) |
| `pnpm module-boundaries` | `nx run-many -t module-boundaries` (ESLint) |
| `pnpm dev` | `nx run-many -t dev` — every app at once |
| `pnpm affected` | `nx affected -t typecheck test build lint module-boundaries` |
| `pnpm lint:fix` | `biome check --write .` |
| `pnpm format` / `pnpm format:check` | `biome format --write .` / check only |
| `pnpm graph` | Nx project graph |

Single project: `pnpm nx run <project>:<target>`, e.g. `pnpm nx run nizam-web:dev`.

Nx runs with `neverConnectToCloud: true` — no remote cache, no analytics. CI therefore starts from a cold cache by design.

### Test coverage, stated honestly

`pnpm test` reports three projects, but only two of them run real tests: **106 tests across 11 suites, all in `tedrisat` and `teskilat`** (104 / 9 and 2 / 2). The third, `tedris-web`, executes `echo 'Tests not implemented'`, which Nx counts as a pass. **Frontend test coverage is zero.**

Those tests run on **Vitest**; MDRS-20 moved them off Jest at an unchanged count — 91 across 10 suites as measured then, before MDRS-35 added tedrisat's 15-test `test/unit/config.spec.ts` — and no Jest dependency or config file remains. It did **not** close the frontend gap — there was no frontend spec to migrate, and scaffolding a runner with nothing to run would only have produced a target that passes vacuously. Writing the first frontend specs, with the `@nx/vite` + `jsdom` setup they need, is tracked separately. See [`docs/migration/mdrs-20-jest-to-vitest.md`](docs/migration/mdrs-20-jest-to-vitest.md).

Four of tedrisat's nine suites are the `test/e2e/*.e2e.spec.ts` files: `apps/tedrisat/vitest.config.ts` matches them too, so **`pnpm test` needs a running Docker daemon** — those suites start a Testcontainers `postgres:17-alpine`. `pnpm --filter @medaris/tedrisat test:e2e` runs the same four under `apps/tedrisat/vitest.integration.config.ts` rather than adding coverage.

## Toolchain

- **Biome** owns formatting and linting. **ESLint exists only** to run `@nx/enforce-module-boundaries`; it carries no style rules.
- **Boundary tags are enforced.** All 16 projects carry `scope:*` / `platform:*` / `type:*` tags and `eslint.config.mjs` holds the real `depConstraints` with `allow: []`. The taxonomy, the allowed directions, and the three cases the linter cannot see are in [`CONTRIBUTING.md`](CONTRIBUTING.md#project-layers-and-tags); ADR-001 §D5 is normative.
- **Commit hygiene** is enforced by husky: `pre-commit` runs lint-staged (Biome on staged files only), `commit-msg` runs commitlint against a 20-scope enum. See [`CONTRIBUTING.md`](CONTRIBUTING.md).
- **CI** is one `nx affected` pipeline plus CodeQL over both stacks, a dependency audit, depcheck, and a job that lints the pull-request title — the squash commit that reaches `main` is composed server-side and never passes the local hook.

## Local environment

There are two layers of environment file, and mixing them up is the most common way to lose an hour:

- **`apps/<app>/.env`** — what the apps actually read. Each app ships its own `.env.example` with its own variable set (`apps/nizam/.env.example` carries Keycloak client credentials and `NEXTAUTH_*`, the Nest apps carry `DB_*`). Copy per app; these files are git-ignored.
- **`.env.example` at the root** — the `docker-compose` template: container ports and the Postgres credentials. It does not feed the apps.

Notes that save time:

- **Postgres**: `docker compose up -d medaris-db` is enough. `docker/init-db.sql` creates the `tedrisat_db` / `teskilat_db` databases and their users, and the apps run their own migrations at boot (`AUTO_MIGRATIONS_ENABLED=true`).
- **OpenTelemetry** defaults to enabled, pointing at `localhost:4317`. With no collector running that is just log noise — set `OTEL_ENABLED=false` locally.
- **Keycloak** points at the real server. Auth flows will not complete locally, but pages still render.
- `NEXT_PUBLIC_*` variables are inlined at **build time**, not read at runtime — changing one needs a rebuild, not a restart.

`docker compose up` does **not** bring up the full stack today: only the two Nest apps and Postgres are described, those services expect a per-app `.env` that is git-ignored, and the six `apps/*/Dockerfile` files still run `npm install` against `catalog:` specifiers. Repairing them is MDRS-16. Until then, run the apps with `pnpm nx run <project>:dev` and use compose only for the database.

## Documents

| Document | Purpose |
| --- | --- |
| [`docs/PRD.md`](docs/PRD.md) | Master PRD v1.0 — product requirements & phased plan |
| [`docs/ecosystem-boundaries.md`](docs/ecosystem-boundaries.md) | Ecosystem Domain Boundaries Charter v0.1 |
| [`docs/adr/001-monorepo-merge-and-layout.md`](docs/adr/001-monorepo-merge-and-layout.md) | Target layout, boundary taxonomy, toolchain decisions |
| [`docs/migration/`](docs/migration/) | Per-task migration records — what was done, what was verified, what was not |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Commit conventions, git hooks, module boundaries, adding a library |

## Ownership

Medaris is owned by **Hadis ve Siyer Medresesi**. **Amel Tech** is the bridge community — mission, standards, and convening — and owns no product. See the boundaries charter for the full governance model.
