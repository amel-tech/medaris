# MDRS-10 — pnpm workspace conversion record

**Status:** executed
**Date:** 2026-07-27
**Author:** Enes Yasin Gedik
**Issue:** [MDRS-10](https://linear.app/amel-tech/issue/MDRS-10)
**Runs on top of:** [MDRS-9](./mdrs-9-history-merge.md) (history merge)
**Catalog source:** [MDRS-8](./mdrs-8-dependency-reconciliation.md)
**Normative source:** [ADR-001](../adr/001-monorepo-merge-and-layout.md) §D3, §D4, §D6, §D7, §D8, §D11

---

## 1. What this changed

Two npm workspaces and two lockfiles became one catalog-driven pnpm workspace, and the
`@madrasah/*` namespace became `@medaris/*` in the same pass.

| | Before | After |
| -- | -- | -- |
| Package manager | npm × 2 workspaces | pnpm 11.4.0, one workspace |
| Lockfiles | 2 × `package-lock.json` | 1 × `pnpm-lock.yaml` |
| Version strings | scattered across 19 manifests | 130 `catalog:` entries, 0 literals in packages |
| Cross-package deps | `*` / `^1.0.0` / `1.0.0` | `workspace:*` everywhere |
| Registered packages | implicit globs | 16, enumerated explicitly |
| Namespace | `@madrasah/*` | `@medaris/*` |
| Shared config packages | `eslint-config`, `typescript-config`, `mocks` | dissolved |

## 2. Catalog governance

`pnpm-workspace.yaml` is the single source of truth for external versions. Adding a
dependency means adding it to the catalog first, then referencing it as `catalog:` from the
package. **A bare version string in a workspace `package.json` is a bug** — the check that
proves it is in §7.

The catalog was authored from the MDRS-8 draft, not re-derived. Two entries changed:

- **`zod: ~3.25.76` — FU-3 is resolved, not deferred.** MDRS-8 left this blocking, pending a
  30-minute check of whether `@medaris/ui` used v4-only APIs. It uses no zod at all: the
  package declared `zod@^4.0.17` but not one of its 38 source files imports it. The
  declaration was a phantom. It is dropped, the v3 line is uncontested, and ADR §D8's
  "catalog exception #2 candidate" / Escalation #1 both fall away.
- **Jest is cataloged** — see §4.

## 3. Package-level decisions (ADR §D3/§D4/§D6/§D7)

- **Names.** Apps take `@medaris/<release-component>` (`@medaris/tedris-web`, …), libs take
  `@medaris/<dirname>`. Release components and tags are untouched — release-please's
  per-path `component` is independent of the package name.
- **`private: true` everywhere**, `publishConfig` removed. `keycloak-theme` gains the field
  it alone lacked; `hooks`/`types`/`utils` lose `publishConfig.access: public`.
- **Lib versions reset to `0.0.0`.** App versions carry over unchanged and already matched
  the §D3 table.
- **Source consumption (§D7).** `hooks`, `types`, `utils` and `i18n` drop their dist builds
  and point at source; `common` (tsc → `dist/`) and `tokens` (CSS codegen) stay built, the
  two documented exceptions. `i18n`'s entry resolves to `src/locales/index.ts` — there is no
  `src/index.ts`; the old `dist/index.js` came from tsc inferring `src/locales` as rootDir.
- **§D3/§D4 corrections applied:** tedris promotes `services` devDep → dependency (33 runtime
  imports; a pruned production install would have crashed) and drops its dead `hooks`/`types`
  declarations; `ui` declares the `tokens` dep it imports from `globals.css`; `common` moves
  `@types/multer` to devDeps; `icons`' `main` is repointed to `./src/csr/index.ts` (the old
  target, `./src/index.ts`, does not exist — `exports` was masking it); `landing` and `nazir`
  gain explicit `transpilePackages` instead of relying on Turbopack auto-transpilation.
- **A 13th namespaced package exists** that neither the issue nor the ADR lists:
  `libs/services/src/tedrisat/generated` is `@medaris/tedrisatapi`, the OpenAPI client. It is
  not a workspace package, but it carries the namespace, so it was renamed **and** the
  `npmName=` argument in the `generate:tedrisat` script was renamed with it — otherwise the
  next regeneration would silently restore `@madrasah/`.

## 4. Jest — a deliberate deviation from MDRS-8 §4

MDRS-8 §4 lists `jest`, `@types/jest`, `ts-jest` and `jest-junit` as "removed by a toolchain
decision" (ADR §D9 locks Vitest), for MDRS-10 to delete. **They are kept here and cataloged.**

MDRS-10's own "Watch for" section names the risk this PR takes: *"NestJS apps depend on
hoisting behaviour that differs under pnpm's strict node_modules layout."* The 91 backend
tests are the only instrument that can detect whether that happened. Deleting the runner in
the same commit that takes the risk removes the measurement, and MDRS-10's AC separately
requires the test suites to pass. MDRS-20 deletes the four catalog entries as part of the
Vitest conversion, which is where the replacement actually arrives.

The instrument earned its keep: it is what confirmed NestJS + drizzle + testcontainers
resolve correctly under pnpm (§7).

## 5. tsconfig rewiring

`libs/typescript-config` dissolved into root `tsconfig.base.json`, which is **strict +
NodeNext with no `paths` aliases** (§D7). Cross-package resolution goes through pnpm's
workspace links instead.

The rewiring was mechanical and **behaviour-preserving**, not a re-authoring. For each of the
16 packages the old `extends` chain (`typescript-config/{base,nextjs,react-library}`, or the
backend's own root base) was resolved into its *effective* compilerOptions; only the delta
against the new root base is written back; and any flag the new base turns on that the
package never had is turned **off explicitly**, so nothing silently gets stricter. The three
NestJS packages restore `commonjs` + decorators in their own tsconfig.

Two `paths` aliases pointed at `../../shared/ui/src/*` — a directory MDRS-9's rename removed,
so they had been dead since the merge. They were dropped rather than repointed, per §D7.

Three source-consumed libs (`utils`, `types`, `hooks`) moved from NodeNext to `Bundler`
resolution, matching `ui`/`icons`/`services`/`i18n`. This was forced by a real failure — see
§6.

## 6. What the strict layout surfaced

Six dependencies were **imported but never declared**. npm's hoisted `node_modules` resolved
them by accident; pnpm's strict layout does not. This is exactly the class of bug the issue
predicted, though it landed on the frontend rather than in NestJS:

| Package | Undeclared import | Fixed by |
| -- | -- | -- |
| `libs/hooks` | `react` | declare `react` + `@types/react` |
| `libs/ui` | `react-hook-form` (5 components) | declare it |
| `apps/tedris` | `@tanstack/react-table` | declare it (was only in `ui`) |
| `apps/nizam` | `@tanstack/react-table` | declare it |
| `apps/keycloak-theme` | `@medaris/icons` | declare `workspace:*` |
| `apps/tedrisat` | `class-transformer` (standalone, not the NestJS fork) | declare it |

Three more failures came from the dist → source flip and the lockfile regeneration:

- **`libs/utils` exported nothing.** `src/index.ts` began `export * from './meeting-platform.js'`
  — a NodeNext specifier. esbuild resolved `.js` → `.ts` when it bundled the lib; Turbopack,
  reading the raw source, could not, so the re-export silently resolved to empty and both
  tedris and nizam failed to build on a missing `resolveMeetingPlatform`. Fixed by making the
  specifier extensionless and moving the three formerly-built libs to Bundler resolution.
- **7 obsolete `@ts-expect-error` directives in `libs/ui`.** All the same Radix `Slot` union
  workaround. With `@types/react` resolving to 19.2.17 the suppressed error no longer occurs,
  so the directives themselves became errors. Removed. This is ordinary lockfile-regeneration
  drift — the range (`^19`) floats exactly as the old `^19.1.10` did.
- **FU-4 fallout, as predicted.** `keycloak-theme` declared `@types/react@^18.3.23` while
  running React 19; on the catalog's `^19` its two `JSX.Element` annotations broke, because
  React 19's types dropped the global `JSX` namespace. Changed to `React.JSX.Element`.

## 7. Verification

All commands run from a clean checkout with no `node_modules`.

| Check | Result |
| -- | -- |
| `pnpm install --frozen-lockfile`, zero `node_modules` | **passes**, 7.6s, pnpm 11.4.0 via corepack |
| Version strings left in the 16 workspace manifests | **0** — every dep is `catalog:` or `workspace:*` |
| Cross-package deps not on `workspace:*` | **0** |
| `package-lock.json` anywhere in the tree | **0** |
| `tsc --noEmit`, all 16 packages | **16/16 clean** |
| `apps/tedrisat` tests | **8 suites / 89 tests pass** (incl. the testcontainers Postgres integration suite) |
| `apps/teskilat` tests | **2 suites / 2 tests pass** |
| Frontend tests | none exist — `tedris`'s `test` script echoes "Tests not implemented" |
| Builds | tedrisat ✅ teskilat ✅ landing ✅ nazir ✅ nizam ✅ tedris ✅ keycloak-theme ✅ (`vite build`) |
| Boots | landing HTTP 200 ✅ · nazir HTTP 200 ✅ · teskilat HTTP 200 ✅ · tedrisat booted against real Postgres by its own e2e suite ✅ |

**`allowBuilds` (AC 9).** pnpm 11 replaces pnpm 10's `onlyBuiltDependencies` list with a map,
and refuses to install while any install-script dependency is undecided. All **10** that
pnpm's own scan of the merged tree reported are decided: 4 approved (`@swc/core`, `esbuild`,
`sharp`, `@openapitools/openapi-generator-cli`), 6 denied. Note the delta against MDRS-8 §3,
which predicted from `hasInstallScript` in the two npm locks: `nx`, `lightningcss`,
`@tailwindcss/oxide` and `unrs-resolver` ship **no** install script at the pinned versions
(nx is not in the graph until MDRS-11), while `@parcel/watcher`, `@scarf/scarf`,
`cpu-features`, `protobufjs` and `ssh2` do and had to be denied explicitly rather than in a
comment.

### Not verified here

- **`keycloakify build` (the jar).** `vite build` — the JavaScript half — succeeds. The jar
  step needs a JRE, and this machine has none. The Vite 5 / Keycloakify 11 island is frozen
  through the merge by §D8 anyway; MDRS-16 owns its pipeline.
- **`tedris` / `nizam` interactive boot.** Both build and both need a live Keycloak to get
  past the auth flow. Their builds run the full Next type-check and page-data collection.
- Next apps validate env at build *and* boot (`@t3-oss/env-nextjs`). Builds and boots above
  used placeholder values from each app's committed `.env.example`; no `.env` is committed.

## 8. Residual `@madrasah/` references — 15, all in records

The AC asks for grep-verified zero. Live code, config and manifests are at zero. Fifteen
occurrences remain in four files, deliberately, because rewriting them would falsify a record:

| File | n | Why it stays |
| -- | -- | -- |
| `apps/tedris/CHANGELOG.md` | 10 | release-please history; those entries describe what shipped under the old name |
| `docs/adr/001-monorepo-merge-and-layout.md` | 2 | states the rename decision — "`@madrasah/X` → `@medaris/X`" needs both names to mean anything |
| `docs/PRD.md` | 2 | product snapshot owned outside this epic; a doc follow-up (FU-7), not a codemod target |
| `docs/migration/mdrs-9-history-merge.md` | 1 | the merge audit record |

Verify with: `git grep -c '@madrasah/'` → only these four files.

## 9. Follow-ups this PR opened

- **FU-6 — `start:prod` is broken in both NestJS apps, and was before the merge.** Both run
  `node dist/main`, but the emitted entry is `dist/src/main.js`. Cause: `src/config/config.ts`
  does `import * as pkg from '../../package.json'`, so with `resolveJsonModule` (present in
  the backend's pre-merge root base too) the app-root `package.json` joins the program and
  pushes tsc's inferred rootDir up one level. Pre-existing, not merge fallout — production
  runs `npm start`, which is why nobody hit it. **Left unfixed on purpose:** MDRS-16 owns the
  runtime and Docker entry points and is rewriting `npm` → `pnpm` in those images anyway.
- **FU-7 — `docs/PRD.md` names two packages by their old namespace.** Needs the PRD owner.
- **Root has no task orchestration.** Turbo is staged out (MDRS-9) and Nx arrives in MDRS-11,
  so the root `build`/`check-types`/`test` scripts are plain `pnpm -r` pass-throughs. MDRS-11
  replaces them with Nx targets.
- **No TS project references.** §D7 names them as part of the source-consumed model, but they
  need `composite: true`, which fights `noEmit` in the Next apps. Deferred to MDRS-11, which
  is setting up the task graph regardless.
- **ESLint is absent** between this PR and MDRS-12 — every `eslint.config.*` and every
  `lint` script is gone, because a config extending a deleted package is worse than none.
- **`.migration/` still holds 22 files** owned by MDRS-11 (turbo), MDRS-12 (husky, commitlint),
  MDRS-15 (CI workflows) and MDRS-17 (release-please). MDRS-10 removed its own six
  (`package.json` ×2, `package-lock.json` ×2, `tsconfig.json` ×2) plus the two staged
  READMEs, which nothing supersedes. The directory must be empty and gone by MDRS-17.

## Related

- [MDRS-9 history merge record](./mdrs-9-history-merge.md)
- [MDRS-8 dependency reconciliation](./mdrs-8-dependency-reconciliation.md)
- [ADR-001](../adr/001-monorepo-merge-and-layout.md)
