# MDRS-13 — Enforce module boundaries (scope / platform tags + depConstraints)

**Branch:** `argedikas/mdrs-13-enforce-module-boundaries`
**Base:** `origin/main` at `68faa44`
**Date:** 2026-08-14
**Normative source:** [ADR-001 §D5](../adr/001-monorepo-merge-and-layout.md) — the
tag values and the `depConstraints` JSON below are copied from it, not invented here.

## What this changes

Before this PR, `@nx/enforce-module-boundaries` was wired and green but enforced
nothing: `depConstraints` held a single `{ sourceTag: "*", onlyDependOnLibsWithTags: ["*"] }`
entry and no project carried `tags`. That was MDRS-12's deliberate shell (ADR-001
§D5 sequencing rule: land code → rewire → reformat → *only then* enforce).

This PR:

1. Adds `tags` to all 16 `project.json` files.
2. Replaces the permissive constraint with ADR-001 §D5's nine-entry
   `depConstraints`, keeping `enforceBuildableLibDependency: true` and `allow: []`.
3. Documents the taxonomy in `CLAUDE.md` (tag table + edit hazards),
   `CONTRIBUTING.md` (one-screen mirror, filling the MDRS-13 anchor, plus a new
   step 6 in "Adding a library"), and corrects the now-stale `README.md` bullet.

No source file changes. No new `allow:` entry. No suppression comment anywhere.

## Taxonomy applied

Two axes are **enforced** (`scope`, `platform`); `type:*` is documentary and
carries no constraint.

| Nx project | Directory | scope | platform | type |
| -- | -- | -- | -- | -- |
| `tedrisat` | `apps/tedrisat` | `scope:app` | `platform:node` | `type:app` |
| `teskilat` | `apps/teskilat` | `scope:app` | `platform:node` | `type:app` |
| `tedris-web` | `apps/tedris` | `scope:app` | `platform:web` | `type:app` |
| `nizam-web` | `apps/nizam` | `scope:app` | `platform:web` | `type:app` |
| `nazir-web` | `apps/nazir` | `scope:app` | `platform:web` | `type:app` |
| `landing-web` | `apps/landing` | `scope:app` | `platform:web` | `type:app` |
| `keycloak-theme` | `apps/keycloak-theme` | `scope:app` | `platform:web` | `type:app` |
| `common` | `libs/common` | `scope:server` | `platform:node` | `type:infra` |
| `ui` | `libs/ui` | `scope:ui` | `platform:web` | `type:ui` |
| `icons` | `libs/icons` | `scope:ui` | `platform:web` | `type:ui` |
| `tokens` | `libs/tokens` | `scope:ui` | `platform:web` | `type:ui` |
| `hooks` | `libs/hooks` | `scope:ui` | `platform:web` | `type:util` |
| `services` | `libs/services` | `scope:web` | `platform:web` | `type:data-access` |
| `i18n` | `libs/i18n` | `scope:shared` | *(none)* | `type:i18n` |
| `types` | `libs/types` | `scope:shared` | *(none)* | `type:types` |
| `utils` | `libs/utils` | `scope:shared` | *(none)* | `type:util` |

16 projects, 16 tagged. `scope:shared` libs are platform-neutral on purpose so
both the Nest apps and the browser bundles can import them.

Three libs named in the Linear description do not exist in this repo and were
therefore not tagged: `validation`, `errors`, `config` (reserved names for the
anticipated `common` split, ADR-001 §D1) and `mocks` (deleted in MDRS-10). The
`libs/*` set is exactly the nine live packages above.

### Deviation from the Linear description

The Linear issue's scope table gives `scope:shared → (nothing)`, `scope:ui →
scope:shared`, and `scope:web → ui, shared`. ADR-001 §D5 supersedes it with four
recorded amendments (self-edges for `shared`, `ui`, `web`, and the
`notDependOnLibsWithTags` form for the platform axis) because the stricter
version is false on day one — `ui → icons` is 8 real imports and `ui → tokens` is
a real CSS edge. **The ADR's JSON was implemented verbatim.** The ADR is the
normative source per its own Context section and per the Linear description's own
"confirm against the ADR".

The issue also says the rule should be "wired to the Nx `boundaries` target". The
target is named `module-boundaries` (`nx.json` → `@nx/eslint/plugin` →
`options.targetName`), which ADR-001 §D5 explicitly adjudicated in favour of the
draft prose. Not changed.

## What was verified

All commands run on this branch from a clean worktree at base `68faa44`, after
`pnpm install` and after seeding the four Next.js `apps/<app>/.env` files from
their `.env.example` (build-time env validation; the files are not committed).

### Gate

| Command | Result |
| -- | -- |
| `pnpm nx run-many -t typecheck --skip-nx-cache` | `Successfully ran target typecheck for 16 projects and 2 tasks they depend on` |
| `pnpm nx run-many -t test --skip-nx-cache` | `Successfully ran target test for 3 projects and 2 tasks they depend on` — `tedrisat` 89 tests / 8 suites, `teskilat` 2 tests / 2 suites, `tedris-web` echo stub. **91 tests / 10 suites**, unchanged from base. |
| `pnpm nx run-many -t lint --skip-nx-cache` | `Successfully ran target lint for 16 projects` |
| `pnpm nx run-many -t module-boundaries --skip-nx-cache` | `Successfully ran target module-boundaries for 16 projects` |
| `pnpm nx run-many -t build --skip-nx-cache` | `Successfully ran target build for 8 projects` |
| `node tools/ci/biome-ratchet.mjs` | `checked 526 files ... errors 0 (baseline 0) / warnings 94 (baseline 94) / infos 27 (baseline 27)` — no count grew |
| `node tools/ci/assert-affected-isolation.mjs` | `✔ affected-isolation: each stack's changes stay within it.` |

This PR adds no tests. The tag/constraint pair has no unit-testable surface —
its test is the deliberate-violation probe below, which is a property of the
ESLint run and cannot be asserted from a spec file without shipping a permanently
broken import.

### The rule actually forbids things (deliberate violations, reverted)

A green `module-boundaries` proves nothing on its own: the permissive constraint
on `main` was also green. Each probe below was a temporary file, run, then
deleted. `git status` was confirmed clean of probes before committing.

**Probe 1 — `platform:web` app → `platform:node` lib** (the Linear AC's exact case).
`apps/tedris/lib/boundary-probe.ts` importing `@medaris/common`:

```
$ pnpm nx run tedris-web:module-boundaries --skip-nx-cache

/…/apps/tedris/lib/boundary-probe.ts
  2:1  error  A project tagged with "scope:app" and "platform:web" can only depend on
              libs tagged with "scope:ui", "scope:web", "scope:shared"
              @nx/enforce-module-boundaries

✖ 1 problem (1 error, 0 warnings)
NX   Running target module-boundaries for project tedris-web failed
```

This trips the `allSourceTags` narrowing first, so it does not by itself prove the
platform axis. Probe 2 isolates that.

**Probe 2 — the `platform` axis alone.** `libs/types` temporarily retagged
`["scope:shared", "platform:node", "type:types"]` and imported from `libs/ui`
(`scope:ui` + `platform:web`). `scope:ui → scope:shared` is legal, so only the
platform constraint can fail:

```
$ pnpm nx run ui:module-boundaries --skip-nx-cache

/…/libs/ui/src/boundary-probe.ts
  2:1  error  A project tagged with "platform:web" can not depend on libs tagged with "platform:node"

Violation detected in:
- types  @nx/enforce-module-boundaries

✖ 1 problem (1 error, 0 warnings)
NX   Running target module-boundaries for project ui failed
```

**Probe 3 — `scope:shared` is a leaf.** `libs/utils/src/boundary-probe.ts`
importing six sibling libs; the four illegal ones fail and the two legal-shaped
ones are covered in the "not caught" note below:

```
$ pnpm exec eslint src/boundary-probe.ts      # cwd libs/utils
  3:1  error  A project tagged with "scope:shared" can only depend on libs tagged with "scope:shared"   # @medaris/common
  4:1  error  A project tagged with "scope:shared" can only depend on libs tagged with "scope:shared"   # @medaris/icons
  6:1  error  A project tagged with "scope:shared" can only depend on libs tagged with "scope:shared"   # @medaris/tokens
  7:1  error  A project tagged with "scope:shared" can only depend on libs tagged with "scope:shared"   # @medaris/hooks
✖ 4 problems (4 errors, 0 warnings)
```

Re-run with the subpath specifiers real code actually uses
(`@medaris/ui/components/button`, `@medaris/services/tedrisat`) — both fail:

```
  2:1  error  A project tagged with "scope:shared" can only depend on libs tagged with "scope:shared"
  3:1  error  A project tagged with "scope:shared" can only depend on libs tagged with "scope:shared"
✖ 2 problems (2 errors, 0 warnings)
```

**Probe 4 — cross-project relative import.** `apps/nizam/lib/boundary-probe.ts`
with `export { authOptions } from "../../tedris/lib/auth_options"`:

```
  2:1  error  Projects cannot be imported by a relative or absolute path, and must
              begin with a npm scope  @nx/enforce-module-boundaries
```

### Existing violations found: none

Every real dependency edge in the repo was enumerated and classified against the
taxonomy before writing the constraints. Declared `workspace:*` deps
(`grep '"@medaris/' apps/*/package.json libs/*/package.json`) and actual import
specifiers (`grep -r '@medaris/[a-z0-9-]\+'` over `*.ts`, `*.tsx`, `*.css`):

| Source | Imports | Verdict |
| -- | -- | -- |
| `ui` | `icons` ×8, `tokens` ×2 | legal (`scope:ui → scope:ui`) |
| `icons`, `tokens`, `hooks`, `i18n`, `types`, `utils`, `common`, `services` | none | legal (leaves) |
| `tedris-web` | `ui` ×62, `services` ×33, `icons` ×18, `i18n` ×2, `tokens` ×1, `utils` ×1 | legal |
| `nizam-web` | `ui` ×67, `services` ×24, `icons` ×16, `i18n` ×2, `utils` ×1 | legal |
| `keycloak-theme` | `ui` ×23, `icons` ×3, `tokens` ×1 | legal |
| `landing-web` | `icons` ×6, `ui` ×2, `i18n` ×1, `tokens` ×1 | legal |
| `nazir-web` | `ui` ×1, `tokens` ×1 | legal |
| `tedrisat` | `common` ×26 | legal (`app`+`node` → `server`) |
| `teskilat` | `common` ×5 | legal |
| any app → any app | none | — |
| any web-side lib → `common` | none | — |

`libs/services` and `libs/mocks` were flagged in the Linear description as the
most likely pre-existing violators. `services` imports nothing internal at all
(measured), and `mocks` no longer exists. Nothing had to be fixed and nothing had
to be excused — `allow` stayed `[]`.

### Boundary check runs in CI and blocks merge

- `.github/workflows/ci.yaml`, job `verify` (display name **`Verify`**), step
  "Verify affected projects": `pnpm exec nx affected -t lint typecheck test build module-boundaries`.
- `gh api repos/amel-tech/medaris/rulesets/20827887` — ruleset "main protection",
  enforcement `active`, `required_status_checks` = `[{"context":"Verify"},{"context":"Commit hygiene"}]`.
- The affected set is not a hole. Measured:
  - `nx show projects --affected --files=eslint.config.mjs` → all 16 projects.
    (`eslint.config.mjs` is not in `nx.json`'s `sharedGlobals`, but it *is* an
    input of the inferred `module-boundaries` target, and Nx derives touched
    projects from target inputs — confirmed by the output, not assumed.)
  - `nx show projects --affected --files=libs/ui/project.json` →
    `["ui","keycloak-theme","landing-web","tedris-web","nazir-web","nizam-web"]`
    — the lib plus exactly its consumers.

## What the rule does not catch (measured, not theorised)

Recorded in `CLAUDE.md` and `CONTRIBUTING.md` as review rules rather than left
implicit.

1. **`@medaris/<app>` package-specifier imports between apps.** ADR-001 §D5 says
   "App→app imports are banned by construction (`scope:app` appears in no allowed
   list)". The constraint is written that way, but the rule never fires, because
   no app declares `main` or `exports` — Nx's target-project locator resolves
   `@medaris/tedris-web` to no project at all, and an unresolved specifier is
   skipped before any tag is consulted. Measured: a file in `apps/nizam` exporting
   from `@medaris/tedris-web`, `@medaris/common`, and `@medaris/keycloak-theme` in
   one go reported **only** the `@medaris/common` line.
   Severity: low. Such an import cannot compile or bundle either (no entry point,
   no `workspace:*` link), and the relative form is caught (Probe 4). But the ADR's
   "by construction" claim is stronger than reality and should not be repeated.
2. **The bare `@medaris/ui` / `@medaris/services` specifier** also resolves to
   nothing, because both packages publish subpath-only `exports` maps with no `"."`
   entry. This is harmless: the bare form is not importable by any tool, and the
   subpath forms real code uses *are* caught (Probe 3, second run).
3. **CSS `@import` edges.** `ui → tokens` is a CSS import; ESLint never parses it.
   The declared `workspace:*` dependency plus pnpm's strict `node_modules` is the
   enforcement. ADR-001 §D5 already says this; unchanged by this PR.
4. **Missing tags cannot be enforced.** `depConstraints` has no "tag is mandatory"
   form: an untagged project matches no entry and is silently unconstrained, and an
   app tagged only `scope:app` matches the permissive generic rule and loses its
   platform narrowing. ADR-001 §D5 makes this a review-checklist rule and offers
   the stricter alternative (drop the generic `scope:app` entry so an untagged app
   fails closed) as an option MDRS-13 *may* adopt. **Not adopted here** — dropping
   it would also change the meaning for correctly tagged apps, and the ADR's JSON
   is normative. Captured as a follow-up instead.

## What was NOT verified

- **`pnpm --filter @medaris/tedrisat test:e2e`** was not run. It is broken on
  `main` and its fix is in open PR #19; it is not part of this gate. `-t test`
  already executes the same four e2e suites via `apps/tedrisat/jest.config.json`.
- **CI itself** at the time of writing this file: the numbers above are local.
  The PR body carries the CI result.
- **Whether the required check list is complete for every branch.** Only the
  `main` ruleset was read (`repos/.../branches/main/protection` returns 404 — this
  repo uses rulesets, not legacy branch protection).
- **Behaviour of the constraints against libraries that do not exist yet**
  (`errors`, `validation`, `config`). The self-edge amendments in ADR-001 §D5 were
  written to make that future split legal without an ADR change, but nothing was
  measured because there is nothing to measure.

## Follow-ups

1. **App→app imports are not linter-enforced** (finding 1 above). Options: give
   each app a `"exports": {}` / `"main"` field purely so Nx can resolve it, or
   accept the compile-time failure as sufficient and amend ADR-001 §D5's "by
   construction" wording. Needs a decision, not a patch — filing against MDRS-6.
2. **Mandatory-tag enforcement.** Consider MDRS-18 adding a workspace check (a
   `tools/ci/` script in the shape of `assert-affected-isolation.mjs`) that fails
   when a project has no `scope:*`, or when an app has no `platform:*`. That is
   the only way the review-checklist rule in ADR-001 §D5 becomes a gate.
3. **`type:*` constraints.** ADR-001 §D5 pre-approves a
   `type:testing → everything-below-app` rule for when a real testing lib or
   `apps/e2e` appears. Nothing to do until then.
4. **`enforceBuildableLibDependency` is inert today.** Both buildable libs
   (`common`, `tokens`) have zero internal dependencies, so the flag protects
   nothing yet. Worth re-checking when `common` is split.
