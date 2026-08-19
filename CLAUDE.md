# CLAUDE.md

Instructions for AI agents working in this repository. Read [`README.md`](README.md) first for the layout and commands; this file covers what is easy to get wrong.

## What this repo is

A single pnpm workspace orchestrated by Nx: two NestJS APIs (`tedrisat`, `teskilat`), five web apps, nine `@medaris/*` libraries. It was formed by merging `madrasah-backend` and `madrasah-frontend` with history preserved. Any instruction that describes two separate repositories is stale.

## Before you touch anything

- **`pnpm install` in every fresh clone and every new git worktree.** The husky dispatcher lives in git-ignored `.husky/_`; without it `commitlint` and `lint-staged` silently do not run and a bad commit lands clean.
- **`libs/common` must be built before the Nest apps start**, otherwise they fail at boot with `TS2307`.
- Use Nx **project names**, not directory names: `apps/tedris` is `tedris-web`, `apps/nizam` is `nizam-web`, `apps/nazir` is `nazir-web`, `apps/landing` is `landing-web`.

## The gate

```bash
pnpm nx run-many -t typecheck --skip-nx-cache
pnpm nx run-many -t test --skip-nx-cache
pnpm nx run-many -t build --skip-nx-cache
pnpm nx run-many -t lint --skip-nx-cache
pnpm nx run-many -t module-boundaries --skip-nx-cache
```

Expected: typecheck 16 projects · **226 tests / 17 suites** · build 8 · lint 16 · module-boundaries 16.

Two prerequisites that look optional and are not:

- **`-t test` needs a running Docker daemon.** `apps/tedrisat/vitest.config.ts` matches `test/**/*.spec.ts`, which includes the six `test/e2e/*.e2e.spec.ts` suites, and those start a Testcontainers `postgres:17-alpine`. Of tedrisat's 15 suites, 6 are e2e. `test:e2e` re-runs the same six under a separate config — it is not extra coverage.
- **`-t build` needs the root `.env` for the four Next.js apps.** They validate the environment at build time, so a fresh worktree fails with `Invalid environment variables` until `cp .env.example .env` has been run. That is a missing file, not a regression.

**`-t test` is the only gate that catches a broken NestJS container.** `typecheck` and `build` stay green while dependency injection is already broken at runtime — this has happened, see below. Never skip it.

## Traps that have already cost time

- **`useImportType` breaks NestJS DI.** Rewriting a constructor parameter type to `import type` erases it from `design:paramtypes`, and Nest can no longer resolve the dependency. 78 of 89 tests went red this way while typecheck and build were green. `biome.json` disables the rule for the three packages that use `emitDecoratorMetadata` (`apps/tedrisat`, `apps/teskilat`, `libs/common`). Do not re-enable it there.
- **`biome.json` must stay comment-free.** A comment anywhere in that file — including *above* the `overrides` array — makes Biome silently drop the override's `includes`, which re-enables `useImportType` on the Nest packages. Measured, not theorised. Put explanatory notes in `docs/migration/` instead.
- **Do not partially stage a file the formatter will reflow.** `git add -p` plus `biome check --write` re-applies the hidden hunks at a stale offset and can produce a syntax error while lint-staged still exits 0. Stage whole files.
- **`NODE_ENV=development` in a web app's `.env` breaks `next build`.** React resolves its development bundle against a production SSR runtime and the build dies prerendering `/_global-error` with `Cannot read properties of null (reading 'useContext')`. Measured on all four web apps. The root `.env.example` therefore scopes `NODE_ENV` to `API__`; never broadcast it.
- **There is one `.env`, at the root (MDRS-25).** `apps/<app>/.env` no longer exists and must not be recreated — Next reads a project-directory `.env` on its own, so a stray file silently shadows keys for that one app. The prefix translation lives in `tools/env/root-env.cjs`, applied by each `next.config.js` and by `apps/<api>/src/load-env.ts`.
- **`load-env` must stay the first import in a Nest `main.ts`.** `./otel` and `ConfigModule` both read the environment as they are evaluated, and ES import order is evaluation order.
- **Biome exits 0 on warnings.** `biome check` returns success with warn-severity findings present, so `-t lint` alone cannot catch a growing warning count. `tools/ci/` holds a ratchet that fails closed; do not weaken it.

## Boundaries

ESLint exists **only** to run `@nx/enforce-module-boundaries`. All formatting and linting belongs to Biome — do not add style rules to `eslint.config.mjs`.

Boundaries **are enforced**. All 16 projects carry `tags` in their `project.json`, and `eslint.config.mjs` holds the real `depConstraints` from ADR-001 §D5. Two axes are enforced (`scope`, `platform`); `type:*` is documentary and carries no constraint. `allow` holds exactly two entries — the workspace-root Vitest base configs, which the per-project configs can only reach by relative path — and each carries its removal condition inline, which is the only form MDRS-13's AC permits. Adding a third without one is a regression.

| Project | Tags |
| -- | -- |
| `tedrisat`, `teskilat` | `scope:app` `platform:node` `type:app` |
| `tedris-web`, `nizam-web`, `nazir-web`, `landing-web`, `keycloak-theme` | `scope:app` `platform:web` `type:app` |
| `common` | `scope:server` `platform:node` `type:infra` |
| `ui`, `icons`, `tokens` | `scope:ui` `platform:web` `type:ui` |
| `hooks` | `scope:ui` `platform:web` `type:util` |
| `services` | `scope:web` `platform:web` `type:data-access` |
| `i18n` | `scope:shared` `type:i18n` |
| `types` | `scope:shared` `type:types` |
| `utils` | `scope:shared` `type:util` |

| sourceTag | may depend on |
| -- | -- |
| `scope:shared` | `scope:shared` |
| `scope:ui` | `scope:ui`, `scope:shared` |
| `scope:web` | `scope:web`, `scope:ui`, `scope:shared` |
| `scope:server` | `scope:server`, `scope:shared` |
| `scope:app` (fallback) | `scope:ui`, `scope:web`, `scope:server`, `scope:shared` |
| `scope:app` + `platform:web` | `scope:ui`, `scope:web`, `scope:shared` |
| `scope:app` + `platform:node` | `scope:server`, `scope:shared` |
| `platform:web` | **not** `platform:node` |
| `platform:node` | **not** `platform:web` |

Rules that are easy to get wrong when editing this:

- **`scope:shared` libs must stay platform-neutral** — they carry no `platform:*` tag on purpose, so both web and node code may import them. Adding one silently locks half the repo out.
- **Platform isolation uses `notDependOnLibsWithTags`, never a positive list.** `onlyDependOnLibsWithTags` fails on any dependency on an *untagged* project, which would break every `scope:shared` edge.
- **Every new app and lib needs tags in the same PR that creates it.** `depConstraints` cannot express "a tag is mandatory": an untagged project matches no constraint and is therefore unconstrained. An app that only gets `scope:app` falls back to the permissive generic rule and loses its platform narrowing.
- **`type:*` is documentary.** Do not write a constraint against it without amending ADR-001.

What the linter does **not** catch (measured, MDRS-13):

- `@medaris/<app>` package-specifier imports between apps. Apps declare no `main`/`exports`, so Nx's target-project locator resolves the specifier to nothing and the rule never runs. Such an import cannot compile either, so it is a documentation gap rather than a live hole. The *relative* form (`../../tedris/lib/...`) **is** caught.
- CSS `@import` edges (`ui → tokens`). ESLint never sees them; the declared dependency plus pnpm's strict `node_modules` is the enforcement there.

## Commits and pull requests

Conventional commits, English, against the 20-scope enum in `commitlint.config.mjs`. No emoji, no "Generated with" trailers, no `Co-Authored-By` for AI. Details and the full scope list are in [`CONTRIBUTING.md`](CONTRIBUTING.md).

Never use `--amend`, `--no-verify`, force push, `git reset --hard`, or `gh pr merge --admin`. Never commit directly to `main`.

## Never modify

- `docs/PRD.md` and `docs/ecosystem-boundaries.md` — authoritative product and governance documents.

## Releases

`release-please-config.json` and `.release-please-manifest.json` at the root are the only release configuration; there are exactly 7 components, and their names are the same list as `commitlint.config.mjs`'s app scopes, the Nx project names, and the `<component>-v<version>` tag prefixes the deploy workflows guard on (ADR-001 §D3/§D10). `node tools/ci/assert-release-config.mjs` enforces that chain — when it fails, fix the file it names rather than the assertion. **The manifest is the version of record**: release-please bumps from it, so an edit there re-releases or skips a version. Do not hand-edit versions in an app's `package.json`.

The repo carries **0 git tags** — the 43 that MDRS-9 preserved were never pushed to `amel-tech/medaris`. Until they are, release-please has no release anchor and its first run would rewrite every changelog from the beginning of history; see `docs/migration/mdrs-17-release-please-consolidation.md` §3–§4 before running a release.

`.migration/` no longer exists (MDRS-17 consolidated the last 6 files). Any instruction telling you to leave that directory alone is stale.

## Writing documentation

Verify every number against command output before writing it down. A migration record in this repo once claimed "89/89 tests", "548 files", and "nothing is lost" — all three were wrong and needed a follow-up pull request to correct. If you could not verify something, write that it was not verified rather than omitting it.
