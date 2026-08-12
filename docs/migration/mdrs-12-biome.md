# MDRS-12 — Biome adoption, ESLint reduced to a boundaries-only shell

**Status:** executed
**Date:** 2026-08-12
**Issue:** [MDRS-12](https://linear.app/amel-tech/issue/MDRS-12/adopt-biome-reduce-eslint-to-a-boundaries-only-shell)
**Runs on top of:** [MDRS-11](./mdrs-11-nx-task-orchestration.md) (Nx 23 task orchestration)
**Normative source:** [ADR-001](../adr/001-monorepo-merge-and-layout.md) §D5, §D8

---

## 1. What this changed

Between MDRS-10 and this issue the repo had **no linter and no formatter at all** —
every `eslint.config.*` and the whole prettier stack were evicted with the two npm
workspaces and nothing replaced them. Biome 2.4.4 now owns format + lint for the entire
repo, and a single ESLint config survives for the one thing Biome cannot do:
`@nx/enforce-module-boundaries`.

| | Before | After |
| -- | -- | -- |
| Formatter | none (3 orphan prettier files, no prettier installed) | Biome 2.4.4, root `biome.json` |
| Linter | none | Biome (format + lint + import assist) |
| ESLint | absent | `eslint.config.mjs`, **boundaries-only** |
| Nx `lint` target | did not exist | `biome check {projectRoot}`, 16 projects, cached |
| Nx `module-boundaries` target | did not exist | `@nx/eslint/plugin`, 16 projects |
| Root scripts | no `lint` / `format` | `lint`, `lint:fix`, `format`, `format:check`, `module-boundaries` |
| Editor default formatter | ESLint fix-on-save, `formatOnSave: false` | Biome, `formatOnSave: true` |

## 2. The split, and why ESLint survives at all

`eslint.config.mjs` opens with the two lines ADR §D5 quotes verbatim from R1:

```js
// ESLint is used ONLY for Nx module boundary enforcement.
// All other linting and formatting is handled by Biome.
```

Biome has no equivalent of `@nx/enforce-module-boundaries`, so ESLint is kept as a
shell around that single rule and nothing else. The config carries
`linterOptions.reportUnusedDisableDirectives: "off"` per ADR §D5, but that setting
turned out to be **insufficient on ESLint 10** — see §5.

## 3. `biome.json`

Modelled on R1's, with madrasah's generated artifacts added to `files.includes`:

- `apps/keycloak-theme/src/kc.gen.tsx` — Keycloakify codegen
- `apps/keycloak-theme/.keycloakify` — Keycloakify's realm fixture; the sweep
  reflowed all 2 420 lines of it before it was excluded
- `libs/services/src/**/generated` — the OpenAPI generator's 60-file output
- `libs/services/swagger-docs` — the OpenAPI spec that *feeds* that generator; it is
  exported from the running tedrisat API, so reformatting it is churn the next export
  undoes
- `**/routeTree.gen.ts` — TanStack Router codegen (none today; kept so the first one
  added is excluded by default)
- `dist`, `build`, `out`, `out-tsc`, `.next`, `.output`, `.tsbuild`, `coverage`,
  `.nx`, `storybook-static`, `.migration`

`vcs.useIgnoreFile: true`, 2-space indent, 80 line width,
`assist.actions.source.organizeImports: on`. Formatter: double quotes, `es5` trailing
commas, always-parens arrows, semicolons. `javascript.parser.unsafeParameterDecoratorsEnabled`
is on — the NestJS apps need it for constructor-parameter decorators.

Four rules are relaxed, all four copied from R1 rather than invented here:
`complexity/noStaticOnlyClass`, `style/useConsistentTypeDefinitions`,
`suspicious/noEmptyInterface` off; `style/useImportType` raised to `error`.

## 4. Nx wiring

```jsonc
// nx.json
"plugins": [{ "plugin": "@nx/eslint/plugin", "options": { "targetName": "module-boundaries" } }]
"targetDefaults": { "lint": { "executor": "nx:run-commands",
                              "options": { "command": "biome check {projectRoot}" },
                              "cache": true,
                              "inputs": ["default", "{workspaceRoot}/biome.json"] } }
```

`module-boundaries` is the target name ADR §D5 fixes (R1's CI-proven name, not
`boundaries`). `lint` is a `targetDefaults` entry, but **a `targetDefaults` entry does
not by itself create a target** — Nx only merges it into projects that already declare
one. So all 16 `project.json` files gained a bare `"lint": {}`, which the default then
fills in. That is the whole reason for the 16-file `project.json` churn in this diff.

## 5. The `eslint-disable` problem ADR §D5 did not predict

ADR §D5 expected `reportUnusedDisableDirectives: "off"` to be enough to keep the
surviving `eslint-disable` comments quiet. It is not. That option silences *unused*
directives; it does not silence **`Definition for rule 'X' was not found`**, which is
what ESLint 10.8 emits when a disable comment names a rule no loaded plugin defines.
With the boundaries-only config, every `@typescript-eslint/*` and `prettier/prettier`
disable comment in the repo became a hard error — 6 failing projects on the first run.

Fix: the 21 stale directive lines were deleted from the 8 source files that carried
them (`apps/tedrisat/{drizzle.config.ts,src/main.ts}`,
`apps/{nizam,tedris}/types/react-table.d.ts`, `apps/{nizam,tedris}/middleware.ts`,
`apps/keycloak-theme/src/login/KcContext.ts`, `libs/ui/src/components/badge.tsx`).
Nothing is lost: each one suppressed a `typescript-eslint` rule that no longer runs,
and the Biome rule that replaces it is either off (`noEmptyInterface`) or warning-level
(`noExplicitAny`). `reportUnusedDisableDirectives: "off"` is still set, per ADR.

The `/* eslint-disable */` headers inside `libs/services/src/**/generated` and
`kc.gen.tsx` were **left alone** — those files are regenerated, so editing them is
wasted work; they are excluded in both configs instead.

## 6. `libs/ui` self-imports — forced by turning the rule on

`libs/ui` reached its own files through its own package subpaths
(`import { cn } from "@medaris/ui/lib/utils"`, 39 specifiers across 27 files).
`@nx/enforce-module-boundaries` rejects that outright — *"Projects should use relative
imports to import from other files within the same project"* — and it is not a
`depConstraints` matter, so no permissive tag setup can silence it. All 39 were
rewritten to relative specifiers (`../lib/utils`, `./button`, `../hooks/use-mobile`),
derived mechanically from `libs/ui/package.json`'s `exports` map.

This is a strict improvement independent of the linter: a relative path inside a
package does not depend on the `exports` map or on pnpm's self-link resolving. Verified
by `typecheck` + `build` (§8), not by inspection.

## 7. The format sweep

`biome check --write` was run repo-wide as **one isolated commit**, separate from the
config commit, so the config diff stays reviewable. Its SHA is recorded in
`.git-blame-ignore-revs`. `@biomejs/biome` is pinned **exact at 2.4.4** in the catalog
precisely so that commit is byte-reproducible (ADR §D8).

## 8. What was verified

Every command below was run in this worktree, from a clean `pnpm install`:

| Command | Result |
| -- | -- |
| `pnpm nx run-many -t typecheck` | ✅ 16 projects |
| `pnpm nx run-many -t test` | ✅ see §9 for what "test" covers |
| `pnpm nx run-many -t build` | ✅ see §9 for the keycloak-theme caveat |
| `pnpm nx run-many -t lint` | ✅ 16 projects (`biome check` per project) |
| `pnpm nx run-many -t module-boundaries` | ✅ 16 projects |
| `pnpm exec biome check .` | ✅ repo-wide, 0 errors |

## 9. What was NOT verified

- **No CI ran.** All 7 workflows in `.github/workflows/` are release-tag /
  `workflow_dispatch` / `workflow_call` triggered with no `paths:` filter, so no check
  attaches to a PR. Adding a lint job to CI is **MDRS-15**, not this issue. The local
  gate above is the only evidence.
- **`keycloakify build` was not run.** It needs a JRE to produce the theme jar; only
  `apps/keycloak-theme`'s Vite/Storybook build was exercised. The format sweep does
  touch that app's sources, so the jar step is unproven here.
- **No app was started.** Nothing in this diff is a runtime change except the
  `libs/ui` import rewrite (§6), which `typecheck` + `build` cover statically. No
  browser or NestJS boot was performed.
- **Biome's remaining warnings/infos were not fixed** — 97 warnings and 29 infos
  survive (mostly `noExplicitAny` ×55, `noNonNullAssertion` ×11, `useIsArray` ×7,
  `useNodejsImportProtocol` ×12). They do not fail `biome check`. Left deliberately:
  each is a real code change and belongs in the owning app's PR, not in a
  tooling-adoption diff.

## 10. Follow-ups

- **MDRS-13 owns the boundary rules.** `depConstraints` in `eslint.config.mjs` is
  deliberately permissive — a single `{ sourceTag: "*", onlyDependOnLibsWithTags: ["*"] }`
  entry — and **no project carries `tags`**. The real `scope:*` / `platform:*` taxonomy,
  the tag application across all 16 `project.json` files, and the CLAUDE.md /
  CONTRIBUTING tag table are MDRS-13's deliverable, exactly as ADR §D5's sequencing rule
  requires. The shell in this PR proves the rule *runs* and is green; it does not yet
  constrain anything.
- **MDRS-13 should also confirm `enforceBuildableLibDependency: true` still holds** once
  real tags land. It is set per ADR §D5 and passes today, but MDRS-10 dropped the builds
  for `hooks`, `types` and `utils` (§D7), so the buildable/non-buildable split is not
  what the ADR assumed when it wrote that flag.
- **MDRS-14 owns the pre-commit hook.** `lint-staged` should call
  `biome check --write --no-errors-on-unmatched` on `**/*.{ts,tsx,js,jsx,json,css}` —
  R1's exact glob and flags. Root scripts it can lean on instead: `lint` (Nx-cached,
  per-project), `lint:fix` (`biome check --write .`), `format`, `format:check`.
  Note that MDRS-11's doc §7 records husky/commitlint as *MDRS-12's* share of
  `.migration/`; that assignment moved to **MDRS-14** and nothing under `.migration/`
  was touched here (4 files remain: 2× `commitlint.config.js`, 2× `release-please-config.json`).
- **MDRS-15 owns the CI lint job.** `nx affected -t lint module-boundaries` is the
  command; `nx.json`'s `sharedGlobals` already lists `.github/workflows/ci.yml`, which
  does not exist yet.
- **FU-8 from MDRS-11 is closed.** `.vscode/tasks.json`'s "Lint Code" / "Fix Linting
  Issues" tasks pointed at root `lint` / `lint:fix` scripts that did not exist. Both
  scripts now exist. The tasks' `problemMatcher` is still `$eslint-compact`, which no
  longer matches Biome's output — the tasks run, but VS Code will not turn Biome
  diagnostics into clickable problems. Left as-is rather than guessing at a Biome
  matcher; the Biome extension surfaces the same diagnostics natively.
- **Biome 2.5.5 is available.** Staying on 2.4.4 exact is deliberate (§7). The
  `biome migrate` upgrade is MDRS-21.
