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
cp .env.example .env                              # one env file, for the whole workspace
pnpm build                                        # libs/common must be built first
docker compose up -d medaris-db
pnpm nx run tedris-web:dev
```

Two steps that look skippable and are not:

- **`pnpm install` in a fresh clone *or a new git worktree*.** The hook dispatcher lives in `.husky/_`, which is git-ignored. Without it `commitlint` and `lint-staged` silently never run — the commit succeeds and nothing is checked.
- **The root `.env` has to exist before a build.** The Next.js apps validate their environment at **build** time, so without it the build fails with `Invalid environment variables` rather than at startup. There is nothing to run and nothing to keep in sync — each app reads the root file itself.

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

`pnpm test` reports three projects, but only two of them run real tests: **106 tests across 11 suites, all in `tedrisat` and `teskilat`** (104 / 9 and 2 / 2). The third, `tedris-web`, executes `echo 'Tests not implemented'`, which Nx counts as a pass. **Frontend test coverage is zero.** Migrating to Vitest and closing that gap is MDRS-20.

Four of tedrisat's nine suites are the `test/e2e/*.e2e.spec.ts` files: `jest.config.json` matches them too, so **`pnpm test` needs a running Docker daemon** — those suites start a Testcontainers postgres. `pnpm --filter @medaris/tedrisat test:e2e` runs the same four under a separate config rather than adding coverage.

## Toolchain

- **Biome** owns formatting and linting. **ESLint exists only** to run `@nx/enforce-module-boundaries`; it carries no style rules.
- **Boundary tags are not configured yet.** `depConstraints` is deliberately permissive and no project is tagged — the real `scope:*` / `platform:*` taxonomy is MDRS-13. The rule is wired and green so that landing the tags is the only remaining step.
- **Commit hygiene** is enforced by husky: `pre-commit` runs lint-staged (Biome on staged files only), `commit-msg` runs commitlint against a 20-scope enum. See [`CONTRIBUTING.md`](CONTRIBUTING.md).
- **CI** is one `nx affected` pipeline plus CodeQL over both stacks, a dependency audit, depcheck, and a job that lints the pull-request title — the squash commit that reaches `main` is composed server-side and never passes the local hook.

## Local environment

**There is exactly one environment file: `.env` at the repository root.** Nothing is generated and nothing is per app.

A prefix says which app a key belongs to, and is stripped before the app sees it, so `NIZAM__NEXTAUTH_URL` arrives as the plain `NEXTAUTH_URL` that NextAuth reads:

| In `.env` | Goes to |
| -- | -- |
| `KEY=` | all six apps |
| `WEB__KEY=` | landing, nazir, nizam, tedris |
| `API__KEY=` | tedrisat, teskilat |
| `TEDRIS__KEY=` | that one app |

Narrower wins: app over group over shared. A handful of keys — the container ports and `MEDARIS_POSTGRES_*` — carry no prefix and belong to no app; `docker-compose` reads them from the root file directly.

The translation happens where each framework starts up, because neither Next nor Nest can be told to read an env file outside its own project directory:

- `apps/<app>/next.config.js` calls `loadRootEnv("<app>")` before the config object is built — early enough for `NEXT_PUBLIC_*` inlining and for `env.ts`'s build-time validation.
- `apps/<api>/src/load-env.ts` does the same, imported first in `main.ts` so it runs before `./otel` and `ConfigModule`.

Both go through `tools/env/root-env.cjs`, the single implementation of these rules.

**In production there is no file at all.** Every value arrives through the real environment, and anything already in `process.env` wins over the file — a deployed secret is never overridden by a file that happens to be in the image.

Coming from the old six-file layout, or setting up a new machine: get the `.env` from someone who has it, through a channel that does not archive it — it carries real Keycloak client secrets — and put it at the repository root. Then `rm apps/*/.env`; those files are dead weight now and can only shadow keys.

Deriving your own root file from your old `apps/*/.env` is deliberately not offered. Six people doing that produce six different root files, because the inputs had already drifted apart — which is the problem this replaced. One reviewed file, copied.

Notes that save time:

- **Postgres**: `docker compose up -d medaris-db` is enough. `docker/init-db.sql` creates the `tedrisat_db` / `teskilat_db` databases and their users, and the apps run their own migrations at boot (`AUTO_MIGRATIONS_ENABLED=true`).
- **OpenTelemetry** defaults to enabled for the two APIs, pointing at `localhost:4317`. With no collector running that is just log noise — set `API__OTEL_ENABLED=false` in the root `.env`.
- **Keycloak** points at the real server. Auth flows will not complete locally, but pages still render.
- `NEXT_PUBLIC_*` variables are inlined at **build time**, not read at runtime — changing one needs a rebuild, not a restart.

`docker compose up` does **not** bring up the full stack today: only the two Nest apps and Postgres are described, and they take their environment from the root `.env` through the explicit mapping in `docker-compose.yml` rather than from an `env_file:` — compose would hand the container the prefixed key names unchanged. The six `apps/*/Dockerfile` files were rebuilt for pnpm and Nx in MDRS-16 and do build. For the four web apps, run them with `pnpm nx run <project>:dev` and use compose only for the database.

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
