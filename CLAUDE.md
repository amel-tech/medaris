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

Expected: typecheck 16 projects · **91 tests / 10 suites** · build 8 · lint 16 · module-boundaries 16.

**`-t test` is the only gate that catches a broken NestJS container.** `typecheck` and `build` stay green while dependency injection is already broken at runtime — this has happened, see below. Never skip it.

## Traps that have already cost time

- **`useImportType` breaks NestJS DI.** Rewriting a constructor parameter type to `import type` erases it from `design:paramtypes`, and Nest can no longer resolve the dependency. 78 of 89 tests went red this way while typecheck and build were green. `biome.json` disables the rule for the three packages that use `emitDecoratorMetadata` (`apps/tedrisat`, `apps/teskilat`, `libs/common`). Do not re-enable it there.
- **`biome.json` must stay comment-free.** A comment anywhere in that file — including *above* the `overrides` array — makes Biome silently drop the override's `includes`, which re-enables `useImportType` on the Nest packages. Measured, not theorised. Put explanatory notes in `docs/migration/` instead.
- **Do not partially stage a file the formatter will reflow.** `git add -p` plus `biome check --write` re-applies the hidden hunks at a stale offset and can produce a syntax error while lint-staged still exits 0. Stage whole files.
- **Biome exits 0 on warnings.** `biome check` returns success with warn-severity findings present, so `-t lint` alone cannot catch a growing warning count. `tools/ci/` holds a ratchet that fails closed; do not weaken it.

## Boundaries

ESLint exists **only** to run `@nx/enforce-module-boundaries`. All formatting and linting belongs to Biome — do not add style rules to `eslint.config.mjs`.

Project tags are **not configured yet**: `depConstraints` is a single permissive entry and no project carries `tags`. Landing the real `scope:*` / `platform:*` taxonomy is MDRS-13's deliverable. Until then the rule is wired and green but enforces nothing — do not describe the repo as having enforced boundaries.

## Commits and pull requests

Conventional commits, English, against the 20-scope enum in `commitlint.config.mjs`. No emoji, no "Generated with" trailers, no `Co-Authored-By` for AI. Details and the full scope list are in [`CONTRIBUTING.md`](CONTRIBUTING.md).

Never use `--amend`, `--no-verify`, force push, `git reset --hard`, or `gh pr merge --admin`. Never commit directly to `main`.

## Never modify

- `docs/PRD.md` and `docs/ecosystem-boundaries.md` — authoritative product and governance documents.

`.migration/` is **gone** as of MDRS-17 — the staging area from the history merge is fully consolidated. Any instruction telling you to leave it alone is stale.

## Releases

`release-please-config.json` and `.release-please-manifest.json` at the root are the only release configuration; there are exactly 7 components, and their names are the same list as `commitlint.config.mjs`'s app scopes, the Nx project names, and the `<component>-v<version>` tag prefixes the deploy workflows guard on (ADR-001 §D3/§D10). `node tools/ci/assert-release-config.mjs` enforces that chain — when it fails, fix the file it names rather than the assertion. **The manifest is the version of record**: release-please bumps from it, so an edit there re-releases or skips a version. Do not hand-edit versions in an app's `package.json`.

The repo carries **0 git tags** — the 43 that MDRS-9 preserved were never pushed to `amel-tech/medaris`. Until they are, release-please has no release anchor to diff against; see `docs/migration/mdrs-17-release-please-consolidation.md` §3 before running a release.

## Writing documentation

Verify every number against command output before writing it down. A migration record in this repo once claimed "89/89 tests", "548 files", and "nothing is lost" — all three were wrong and needed a follow-up pull request to correct. If you could not verify something, write that it was not verified rather than omitting it.
