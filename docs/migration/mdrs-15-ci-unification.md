# MDRS-15 — Unify CI onto `nx affected`

Collapses the inherited shared-CI surface (both repos' `pull-request.yaml`,
`ci-dev.yaml` and `codeql.yaml`) into one `.github/workflows/ci.yaml` driven by
`nx affected`, plus one merged `codeql.yaml`. Wires the backend's dormant
security gates in for real, and closes the two lint holes MDRS-12 handed over.

Base for every measurement in this document: `origin/main` at `c59d467`
(MDRS-14). Every number below is copied from a command's output; commands are
given so they can be re-run.

## 1. What landed

| File | Change |
| --- | --- |
| `.github/workflows/ci.yaml` | new — 3 jobs: `commit-hygiene`, `verify`, `security` |
| `.github/workflows/codeql.yaml` | new — merged from the two identical configs, 2-language matrix |
| `.migration/backend/.github/workflows/{ci-dev,codeql,pull-request}.yaml` | **deleted** (3 files) |
| `.migration/frontend/.github/workflows/{ci-dev,codeql,pull-request}.yaml` | **deleted** (3 files) |
| `nx.json` | `sharedGlobals` CI path fixed + `package.json` added; `depcheck` targetDefault |
| `package.json` | 5 scripts (`lint:root`, `assert:affected-isolation`, `audit:ci`, `depcheck`, `security-check`), 2 devDeps |
| `audit-ci.json` | `package-manager: npm` → `pnpm`; `skip-dev` → `false`; 31-advisory dated allowlist |
| `tools/ci/biome-ratchet.mjs` | new — workspace-root Biome gate + warning ratchet |
| `tools/ci/biome-baseline.json` | new — the ratchet's committed ceiling |
| `tools/ci/assert-affected-isolation.mjs` | new — asserts AC #2 on every PR |

Not touched, by design:

- The 7 per-app deploy workflows in `.github/workflows/` → **MDRS-16**.
- `.migration/{backend,frontend}/release-please*` (6 files), and deleting the
  `.migration/` directory itself → **MDRS-17**.
- `biome.json`, `eslint.config.mjs`, `commitlint.config.mjs`, `.husky/` — the
  MDRS-12 and MDRS-14 surfaces are unmodified.

### The `ci-dev.yaml` files contained no CI

Worth recording because AC #1 names them. Both inherited `ci-dev.yaml` files
were pure deploy pipelines — `push: [main]` → Docker build/push to
`ghcr.io/<repo>-<app>` → `curl` a Coolify webhook — for 2 backend and 4 frontend
apps. That surface is already covered by the 7 per-app workflows in
`.github/workflows/`, which use the same Dockerfiles, the same registry naming
and the same `*_COOLIFY_WEBHOOK` / `COOLIFY_DEPLOY_TOKEN` secrets. They differ
only in trigger: release-tag / `workflow_dispatch` / `workflow_call` instead of
push-to-main.

So nothing from `ci-dev.yaml` is reproduced in `ci.yaml`, and `ci.yaml` triggers
no deploys. Whether push-to-main should auto-deploy a dev environment is a
deploy-trigger policy question, and it belongs to **MDRS-16** — this task
deliberately did not decide it. The two files were deleted rather than merged
because keeping them would have re-introduced a second, divergent deploy path.

### One capability was dropped, deliberately: the Jest coverage comment

The backend's `pull-request.yaml` ran `npm run test:coverage` and then posted a
coverage table onto the PR with `MishaKav/jest-coverage-comment@main`, reading
`apps/{tedrisat,teskilat}/coverage/coverage-summary.json`. The unified pipeline
runs `test`, not `test:coverage`, and posts no comment. Recording it as a real
loss rather than letting it disappear quietly:

- `test:coverage` is a separate target that only the 2 backend apps declare, so
  running it through `affected` alongside `test` would either duplicate every
  backend test run or replace `test` with a target 14 of 16 projects lack.
- The action was pinned to `@main` — an unpinned third-party action with
  `pull-requests: write` is a supply-chain exposure this task is not willing to
  carry forward silently, and re-adding it would also mean re-granting that
  permission to the whole workflow.
- Coverage reporting is only meaningful once frontend tests exist at all
  (currently zero, see §4), which is **MDRS-20**'s scope.

So it is assigned to MDRS-20 with the recommendation to use a version-pinned
action and a `test:coverage` target every project declares. Until then, coverage
is not reported on PRs — it was, on backend PRs, before this change.

## 2. The pipeline

`ci.yaml` runs on `pull_request` → `[main, dev]`, `push` → `[main]`, and
`workflow_dispatch`. Concurrency is keyed on PR number (or ref), and
`cancel-in-progress` is **true for PRs only** — a cancelled push-to-main run
would leave `nx-set-shas` without a successful base commit for the next run.

| Job | Runs on | Does |
| --- | --- | --- |
| `commit-hygiene` | PRs only | commitlint against the PR **title** and the commit range |
| `verify` | all triggers | root Biome ratchet, affected-isolation assertion, `nx affected -t lint typecheck test build module-boundaries` |
| `security` | all triggers | `audit-ci` (root, once) + `depcheck` (3 projects) |

Three jobs rather than one so that a dependency advisory and a type error report
independently, and because `commit-hygiene` is meaningless outside a PR.

### `nx affected` correctness

`fetch-depth: 0` on checkout and `nrwl/nx-set-shas@v4` immediately after, as the
task requires. Without both, `nx affected` computes against a shallow history and
silently produces a wrong (usually empty) set. `nx-set-shas` sets `NX_BASE` to
the merge base on a PR, and to the last **successful** `ci.yaml` run on a push to
main. A `Report affected projects` step (`if: always()`) prints `NX_BASE`,
`NX_HEAD` and `nx show projects --affected` into every run's log, so the affected
set is auditable after the fact rather than inferred.

The five targets in the workflow are exactly the five in the root `affected`
script (`nx affected -t typecheck test build lint module-boundaries`). Keeping
the lists identical is deliberate: a contributor running `pnpm affected` locally
must get the same verdict CI does.

### Node version

Both jobs use `node-version-file: .nvmrc` (currently `24`) rather than the
hard-coded `"22"` the four inherited workflows used, so the version lives in one
place. **Gap:** production images are `node:22-alpine` and `@types/node` is
pinned to `^22` as a deliberate prod floor (see `pnpm-workspace.yaml`), so CI now
validates the dev version only and does not exercise the 22 floor. A `[22, 24]`
matrix would, at roughly double the `verify` cost. Recorded as a follow-up rather
than decided here.

### The env-seeding step is not optional

`nx run-many -t build` **fails on a clean checkout of `c59d467`** without it:

```
nizam-web:build  ✖  Error: Invalid environment variables
                    NEXT_PUBLIC_NEXTAUTH_URL: Required
                    NEXT_PUBLIC_TEDRISAT_API_BASE_URL: Required
tedris-web:build ✖  (same)
```

`apps/nizam` and `apps/tedris` validate env through `@t3-oss/env-nextjs` at build
time. `apps/nazir` and `apps/landing` build fine without it. The inherited
frontend workflow hand-copied three `.env.example` files (and, oddly, did it
before *lint* rather than build); `ci.yaml` loops over every `apps/*/.env.example`
instead, so a new app is covered automatically. With the loop, all 8 builds pass
— that is the difference between a red and a green build gate, and it is the
single most load-bearing line in the new workflow.

### Three deviations from ADR-001, stated plainly

ADR-001 §D5 "Wiring" specifies the CI line, and this task departs from it in
three ways. None is accidental:

1. **`ci.yaml`, not `ci.yml`.** The ADR (and therefore the `sharedGlobals` entry
   it produced) says `.github/workflows/ci.yml`. Every one of the 9 workflow
   files in this repo uses `.yaml`, including all 7 inherited deploy workflows.
   Following the ADR's spelling would have made the odd one out; instead the
   convention won and `sharedGlobals` was corrected to match. Either choice is
   fine as long as the two agree — the bug was that they did not.
2. **Five targets, not four.** The ADR says
   `nx affected -t test build typecheck module-boundaries`. `lint` is added,
   because the same ADR section defines the Biome `lint` target and MDRS-12
   shipped it; its absence from the CI line predates Biome landing. The root
   `affected` script already lists five, and CI now matches it exactly.
3. **`ci-dev.yaml`'s deploy content is not reproduced.** ADR-001's own
   correction table assigns "`ci-dev.yaml` matrix" to **MDRS-16**, alongside the
   Docker build contexts and the pnpm install rewrite. Re-authoring a deploy path
   here would have pre-empted that decision.

## 3. Decisions

### Cache strategy: local-only, cold in CI — and that was already decided

AC: "Set up Nx remote caching, or accept cold cache in CI and document the
choice." `nx.json` carries `"neverConnectToCloud": true` and
`"analytics": false`, both pre-existing. `neverConnectToCloud` is a hard opt-out:
Nx will not contact Nx Cloud even if a token is present, so remote caching cannot
be enabled without first reversing that flag. **The decision is therefore to
accept a cold Nx cache in CI**, and it is a ratification of an existing choice
rather than a new one.

Why not reverse it: Nx Cloud is a third-party service that would receive task
metadata and cached artifacts from a private repository, which is a data-sharing
decision for the team, not for a CI-plumbing task. The self-hosted alternatives
(`@nx/remote-cache` against S3/Azure/GCS) need a bucket and credentials that do
not exist yet.

What CI keeps instead: `nx affected` (only changed projects run at all) and
pnpm's store cache via `actions/setup-node`'s `cache: pnpm`. What it loses: no
reuse of a task result across runs — a second PR touching the same project
re-runs its build. Given 16 projects, 8 of which build, that is acceptable
today; it stops being acceptable if the project count grows or `test:e2e` lands.

**`sharedGlobals` was pointing at a file that does not exist.** It listed
`{workspaceRoot}/.github/workflows/ci.yml` — `.yml`, while every workflow in this
repo is `.yaml`, and no `ci.yml` was ever created. So changing CI did **not**
invalidate the cache, which is exactly the bug the AC warns about. Now aligned to
the real filename, `.github/workflows/ci.yaml`. `{workspaceRoot}/package.json`
was added at the same time: the root scripts define what every target runs, so a
change there must invalidate too.

### Root lint hole: a root-level Biome step, not a second Nx target

MDRS-12's handoff, re-verified here. The `lint` target is `biome check
{projectRoot}` and all 16 projects live under `apps/` or `libs/`, so:

```
biome check .           → Checked 521 files
biome check apps libs   → Checked 508 files
```

The 13-file difference is real configuration that **no `lint` target can reach**:
`eslint.config.mjs`, `commitlint.config.mjs`, `nx.json`, `biome.json`,
`package.json`, `tsconfig.json`, `tsconfig.base.json`, `audit-ci.json`,
`.depcheckrc.json`, `.mcp.json`, `.vscode/{extensions,settings,tasks}.json`.
(MDRS-12 recorded 12; `commitlint.config.mjs` is the 13th, added by MDRS-14
after that list was written.) `nx affected -t lint` has the same hole from the
other direction: a root-config-only change yields zero affected projects.

`apps/` and `libs/` contain nothing outside those 16 project directories, so
`biome check apps libs` is exactly the union of the per-project `lint` targets —
which is what makes the 13-file difference the whole of the gap. The `tools/ci/`
scripts this task adds fall in the same blind spot (no Nx project owns them) and
are likewise covered only by the root gate, bringing it to 524 files total.

Fixed with a root `biome ci .` step in CI, as MDRS-12 recommended — *not* a
second local per-project lint script, which it measured as racing the cached
`lint` target. `tools/ci/biome-ratchet.mjs` is not an Nx target and is not
cached; it runs once, at the root, over the whole tree.

### Warning exit-0 hole: a ratchet, not `--error-on-warnings`

Also verified: `biome ci .` reports **0 errors, 94 warnings, 27 infos and exits
0**, so the lint gate could not fail on any warn-severity rule.

`--error-on-warnings` was rejected: it fails immediately on all 121 existing
diagnostics, and closing those is MDRS-21's task, so it would red-light every PR
in the meantime. Instead the ratchet compares Biome's per-severity counts against
`tools/ci/biome-baseline.json` (`{errors: 0, warnings: 94, infos: 27}`) and fails
when **any count grows**, printing the offending rules by frequency. Errors fail
unconditionally at any count.

Both directions were tested rather than assumed. At baseline it exits 0; with the
warning ceiling lowered to 93 by one it exits 1 with
`warnings rose 93 → 94` and the per-rule table (`noExplicitAny` 55,
`noNonNullAssertion` 11, `useIsArray` 7, …). Dropping *below* baseline logs the
new numbers and asks for the file to be lowered, but does not fail — failing a
contributor for fixing lint would be perverse. The cost is that the baseline can
sit stale-permissive until someone lowers it; MDRS-21 drives it to zero.

### Security gates: preserved, and now actually running

`audit-ci.json` and `.depcheckrc.json` were both present at the root but
**nothing invoked them**, and the tools were not installed at all:

- The backend's inherited `pull-request.yaml` had its audit step commented out
  (`# disabled for now.`), so the gate had never run in CI.
- `audit:ci` / `depcheck` scripts exist in `apps/tedrisat`, `apps/teskilat` and
  `libs/common` — the task brief expected them to be missing entirely; they are
  not, they are just unreachable from the root.
- Neither `audit-ci` nor `depcheck` was in any `package.json`. Both were in the
  MDRS-8 catalog (`audit-ci: ^7.1.0`, `depcheck: ^1.4.7`) but never referenced,
  so `node_modules/.bin/` contained neither and all six scripts were broken.

Both are now root devDeps from the catalog. The 3 per-package scripts were left
in place — verified that pnpm puts the workspace-root `node_modules/.bin` on a
workspace package's PATH, so they resolve now.

**`audit-ci.json` said `"package-manager": "npm"`.** The merged repo has one
`pnpm-lock.yaml` and no `package-lock.json`, so the npm reader had nothing to
read. Changed to `pnpm`.

**`skip-dev` was `true` and is now `false`.** Inherited that way, it made
`pnpm audit` report `devDependencies: 0` — all 1155 unaudited — so a new critical
in `jest`, `nx`, `biome`, `drizzle-kit` or `testcontainers` would have sailed
through a gate this document claims catches anything new. Raised in review; see
§5 #5. Auditing dev dependencies costs a longer allowlist and buys back the
property.

**The audit allowlist is a ratchet.** `audit-ci` on `c59d467` reports, across
**1833** total dependencies (678 prod + 1155 dev):

```
{ info: 0, low: 2, moderate: 27, high: 38, critical: 0 }
```

The 38 high findings resolve to **31 distinct advisories**. Entries 1–24 are
runtime debt — transitive `next`/`postcss`/`nanoid`/`sharp`,
`@opentelemetry/*`, `@nestjs/swagger > js-yaml`,
`exceljs > brace-expansion`, `@hookform/resolvers > ajv > fast-uri`, and `xlsx`
(MDRS-8 FU-5: unfloorable, must be replaced). Entries 25–31 are the dev-only ones
`skip-dev` had been hiding: `nx > brace-expansion`, and `@commitlint`/`jest`
reaching `js-yaml` via `cosmiconfig`/`istanbul`. All of it is pre-existing debt
MDRS-8 already routed to MDRS-21. Gating on it today would block every PR, so the
31 GHSA IDs are listed in `allowlist` with the measurement that produced them.
The gate still fails on any **new** high or critical advisory in either
dependency type, which is the property that was missing. `low`/`moderate` stay
ungated, as inherited. Verified: `pnpm run audit:ci` prints
`Passed pnpm security audit` while still listing the 31 as allowlisted.

**`depcheck` needed no allowlist** — `nx run-many -t depcheck` reports
`No depcheck issue` for all 3 projects, so it is a genuine blocking gate from day
one. It is now an Nx target (cached, with `.depcheckrc.json` as an input) so it
participates in `affected`. Note it covers **3 of 16 projects**; the other 13
declare no `depcheck` script. Extending it is not in this task's scope.

Kept as a single root audit rather than `nx run-many -t audit:ci`: there is one
lockfile, so a per-project audit would re-audit the same tree 3 times and report
the same advisories.

### CodeQL: one workflow, 2-language matrix

The two inherited configs were byte-identical apart from one blank line — both
`languages: typescript` with `queries: +security-extended,security-and-quality`
over their own repo root.

On AC #3, "CodeQL covers both stacks": to be precise, both stacks *are*
TypeScript, and CodeQL's `javascript-typescript` extractor analyses the whole
checkout. One matrix entry therefore already spans what previously needed two
repos — `apps/tedrisat`, `apps/teskilat`, `libs/common` (NestJS) plus
`apps/tedris`, `apps/nizam`, `apps/nazir`, `apps/landing`,
`apps/keycloak-theme` and the shared libs (Next/React). The matrix earns its
place by adding `actions`, which analyses the workflow files themselves —
appropriate in a repo whose CI surface just grew. `fail-fast: false` so one
language cannot hide the other's findings, and a `paths-ignore` config skips
`dist`/`.next`/`coverage`, `.migration`, `libs/services/src/**/generated` and
`apps/keycloak-theme/src/kc.gen.tsx` so generated code does not dominate the
alerts.

Left as a separate workflow from `ci.yaml` on purpose: it needs
`security-events: write` to upload SARIF, and it runs on a monthly schedule the
quality gates should not.

## 4. Verification

Local gate, `--skip-nx-cache`, on the final tree:

| Command | Result |
| --- | --- |
| `nx run-many -t typecheck` | ✅ 16 projects (+2 dependent tasks) |
| `nx run-many -t test` | ✅ 3 projects — **10 suites, 91 tests** |
| `nx run-many -t build` | ✅ 8 projects (with env seeded; ✖ 2 without) |
| `nx run-many -t lint` | ✅ 16 projects |
| `nx run-many -t module-boundaries` | ✅ 16 projects |
| `nx run-many -t depcheck` | ✅ 3 projects, `No depcheck issue` |
| `pnpm run audit:ci` | ✅ `Passed pnpm security audit` |
| `node tools/ci/biome-ratchet.mjs` | ✅ 0 errors / 94 warnings / 27 infos, at baseline |
| `node tools/ci/assert-affected-isolation.mjs` | ✅ both cases |
| `actionlint` 1.7.7, repo-wide | ✅ 0 findings across all 9 workflow files |

**On the test count — do not read "3 projects" as coverage.** `tedrisat`
contributes 8 suites / 89 tests and `teskilat` 2 suites / 2 tests. The third
project, `tedris-web`, has `"test": "echo 'Tests not implemented'"`, which Nx
records as a pass. The other 5 frontend projects declare no `test` target at all.
**Frontend test coverage in this pipeline is zero**, and the new workflow does
not change that (MDRS-20 owns the Vitest conversion).

Workflow YAML is not visible to the local Nx gate, so it was checked separately:
both new files parse under `yaml.safe_load`, and `actionlint` 1.7.7 reports no
findings repo-wide — including the 7 deploy workflows, which is why adding
actionlint as a CI step would be safe (see follow-ups; not added here, since
pulling a binary into CI is a supply-chain decision beyond this task).

### The pipeline running for real (PR #15)

Not inferred from the local gate — copied from the run of this PR's own workflow
(`gh run view 31563667832`):

| Check | Result |
| --- | --- |
| `Commit hygiene` | ✅ 35s — PR title **and** commit range |
| `Verify` | ✅ `Successfully ran targets lint, typecheck, test, build, module-boundaries for 16 projects` |
| `Security gates` | ✅ 36s — `audit-ci` passed, `depcheck` for 3 projects |
| `Analyze (javascript-typescript)` | ✅ 1m6s |
| `Analyze (actions)` | ✅ 46s |

`nx-set-shas` resolved `NX_BASE` to `c59d467` — the correct merge base — and the
root ratchet reported the same `524 files / 94 warnings` in CI as locally. The
affected set was all 16 projects, exactly as predicted: this PR edits
`sharedGlobals` inputs, so a full run is the correct outcome, not a failure of
`affected`.

One incidental confirmation: the `Report affected projects` step printed the 16
names **newline-separated, not as a JSON array**. That is the same shape that
broke the isolation gate's first run and could not be reproduced locally — so the
format difference is real and environment-dependent, and tolerating both shapes
was the right fix rather than a workaround.

### AC #2 — stack isolation

AC #2 asks that a backend-only change not trigger frontend builds, and vice
versa, "verified on a real PR". Measured from the real project graph:

| Changed file | Affected projects |
| --- | --- |
| `apps/tedrisat/src/main.ts` | `["tedrisat"]` |
| `apps/nizam/app/[locale]/decks/[id]/cards/page.tsx` | `["nizam-web"]` |
| `libs/common/src/index.ts` (backend shared lib) | `["common","tedrisat","teskilat"]` — no frontend |
| `libs/ui/src/components/alert-dialog.tsx` (frontend shared lib) | `["ui","keycloak-theme","landing-web","tedris-web","nazir-web","nizam-web"]` — no backend |

Restricting to projects with a `build` target gives the same answer
(`["tedrisat"]` / `["nizam-web"]`), so the isolation holds at the build-task
level, not just in the project list.

**Partly verified. Read the two halves separately — they prove different things.**

*Verified in CI:* the isolation assertion ran inside PR #15's own `Verify` job
(run `31564219262`, job `94012638632`), against the real project graph on a
GitHub runner:

```
✔ backend-only change (NestJS app)
    affected: ["tedrisat"]
✔ frontend-only change (Next.js app)
    affected: ["nizam-web"]
✔ affected-isolation: each stack's changes stay within it.
```

**NOT verified, and this AC must not be marked satisfied.** Two independent
reasons, both worth stating because they are different gaps:

1. **This PR's diff cannot show the distinction at all.** It edits `nx.json`,
   `package.json` and `.github/workflows/ci.yaml` — all `sharedGlobals` inputs,
   which by definition mark every project affected. So its real affected set is
   all 16 projects. `nx affected` is behaving correctly; this diff simply cannot
   demonstrate separation.
2. **The assertion above overrides the changed-file set.** It passes
   `--files=<leaf file>` rather than letting Nx derive changes from the diff. That
   proves the *project graph* isolates the stacks, which is the substantive
   property — but it bypasses the `nx-set-shas` → `NX_BASE` → git-diff → affected
   path. The full chain, from a real narrow diff through to only one stack's
   builds running, is therefore still unobserved.

What *is* verified around it: `nrwl/nx-set-shas` set `NX_BASE` to the true merge
base with `fetch-depth: 0`, and all five targets ran green across 16 projects. CI
logged the all-16 affected set explicitly:

```
NX_BASE=c59d4673190caa3bdb15615b287d91ea0707ae76
--- projects affected by this change ---
keycloak-theme services tedris-web nizam-web tedrisat teskilat landing-web
common tokens ui nazir-web hooks icons types utils i18n
```

That is the right outcome for a root-config change, not a failure of `affected`.

**Follow-up owner: MDRS-19** (cutover). On the first PR that touches exactly one
app, read the `Report affected projects` step and confirm the list contains only
that app and its dependents — no projects from the other stack. Until that is
observed, AC #2 stays **unmet** in this record, deliberately: writing an
unverified number down is what cost MDRS-12 a separate correction PR (#13). See §7.

## 5. What review found

### CodeQL, on this PR

The new `Analyze (actions)` matrix entry justified itself immediately by finding
a real problem in the workflow that introduced it. On PR #15, CodeQL raised 4
findings of *Unpinned tag for a non-immutable Action*:
`pnpm/action-setup@v4` (×3) and `nrwl/nx-set-shas@v4` (×1). A floating tag on a
third-party action is the same exposure that got the coverage-comment action
dropped in §1, so leaving these would have been incoherent. Both are now pinned
to commit SHAs with the version in a trailing comment
(`pnpm/action-setup@b906aff… # v4.3.0`,
`nrwl/nx-set-shas@3e9ad73… # v4.4.0`).

The first-party `actions/checkout`, `actions/setup-node` and
`github/codeql-action` refs are deliberately left on tags: CodeQL does not flag
them, and all 7 deploy workflows use `@v4` the same way — pinning them here only
would create an inconsistency for MDRS-16 to reconcile. Recorded as a
repo-wide follow-up instead.

### Self-inflicted defect, caught by the gate itself

The affected-isolation gate failed on its own first CI run. Recording it rather
than quietly fixing it: it parsed only a JSON array, but `nx show projects`
printed bare newline-separated names in CI. The shape was not reproducible
locally — piped output, `CI=true`, and `NX_BASE`/`NX_HEAD` all produced JSON — so
the parser now passes `--json` *and* accepts either shape, unit-checked against
JSON, plain, empty-JSON, empty-plain and banner-only inputs.

### Code review

`/code-review` at high effort returned 7 findings. Dispositions:

| # | Finding | Disposition |
| --- | --- | --- |
| 1 | The `postgres` service is dead config, and its justifying comment was wrong | **Fixed** — removed |
| 2 | The Biome ratchet fails *open* if Biome's summary keys or file count collapse | **Fixed** — fail-closed guards |
| 3 | The exact-match isolation assertion misdirects on legitimate graph growth | **Fixed** — rewrote the failure message |
| 4 | The plain-shape parser reds the build on a legitimately empty affected set | **Fixed** — returns `[]`, stricter name pattern |
| 5 | `skip-dev: true` meant devDependencies were never audited | **Fixed** — now audited |
| 6 | Dependabot is still `package-ecosystem: npm` on per-app dirs | **Deferred** — see below |
| 7 | Coverage reporting was dropped | **Already documented** (§1); reviewer added that no `coverageThreshold` exists anywhere, so nothing else catches it |

**#1 was the strongest finding and my comment was factually wrong.** I had
justified keeping the inherited `postgres` service as being "for whoever wires
e2e in". It cannot be: `apps/tedrisat/test/helpers/test-app.helper.ts` starts its
*own* `PostgreSqlContainer("postgres:17-alpine")` and overwrites
`DB_HOST`/`DB_PORT`/`DB_USERNAME`/`DB_PASSWORD`/`DB_NAME` before `AppModule`
loads — with credentials (`testuser`/`testpass`/`tedrisat_test`) that do not even
match what the service provided (`postgres`/`postgres`/`tedrisat-test`). Verified
by reading the helper. The service was pure cost on every run; removed, and the
comment now says what e2e will actually need (a Docker socket).

**#2, fail-open, was the subtlest.** `summary.errors ?? 0` meant that if Biome
renamed a summary key on upgrade, or `biome.json` grew an ignore that narrowed
the file set, every count would read as 0 — and the gate would report "below
baseline" and *recommend permanently lowering the baseline to zero*, silently
disabling the only lint covering the 13 root config files. Now the severity keys
must exist and be numeric, and `minFilesChecked: 500` fails the gate if coverage
collapses. Both guards were tested by tripping them deliberately.

**#5 changed a real security property.** With the inherited `skip-dev: true`,
`pnpm audit` reported `devDependencies: 0` — 1155 of them unaudited — so a new
critical in `jest`, `nx`, `biome`, `drizzle-kit` or `testcontainers` would have
passed silently, contradicting this task's own claim that the gate catches
anything new. The cheap fix was to weaken the claim; instead dev dependencies are
now audited. Cost: 38 high instead of 28, over 31 allowlisted advisories instead
of 24 — the 7 additions being `nx > brace-expansion` and `@commitlint`/`jest`
reaching `js-yaml` through `cosmiconfig`/`istanbul`.

**#6 is deferred, with a warning.** `.github/dependabot.yaml` still declares
`package-ecosystem: "npm"` against `/apps/tedrisat` and `/apps/teskilat`, whose
`package.json` files now use `catalog:` specifiers and have no per-app lockfile.
Nothing Dependabot opens can update the root `pnpm-lock.yaml`, so its monthly PRs
will fail this pipeline at `pnpm install --frozen-lockfile`. To be precise about
blame: this is a pre-existing MDRS-10 misconfiguration that this task makes
*visible* rather than causes — before now, no CI ran on PRs at all, so those PRs
were merely unverified. It is not fixed here because migrating it means re-deciding
ecosystem, directory, grouping and schedule together, which is a dependency-policy
change rather than CI plumbing, and a careless conversion spams the queue.
Assigned to **MDRS-21** with the dependency work.

Three such PRs are **already open and already dead**, opened against the npm
directory layout before the pnpm catalog migration:

| PR | Bump | Directory |
| --- | --- | --- |
| #8 | `@swc/cli` 0.7.10 → 0.8.1 | `/apps/tedrisat` |
| #7 | `class-validator` 0.14.4 → 0.15.1 | `/apps/tedrisat` |
| #6 | `@swc/cli` 0.7.10 → 0.8.1 | `/apps/teskilat` |

None can merge: the versions they target now live in `pnpm-workspace.yaml`'s
catalog, the app `package.json` files carry `catalog:` instead of a version
range, and there is no per-app lockfile for Dependabot to update. **They should be
closed**, and the bumps re-taken as catalog edits. Deliberately left untouched
here — closing dependency PRs is MDRS-21's call, made together with the ecosystem
migration above, not a side effect of a CI task.

## 6. Not verified

Everything here is unverifiable from this branch, and none of it is claimed as
working:

1. **AC #2 — the backend/frontend affected split — is NOT met by this PR.**
   Spelled out in §4: this diff touches `sharedGlobals`, so all 16 projects are
   correctly affected, and the isolation assertion proves the *project graph*
   rather than the git-diff → affected path. Assigned to **MDRS-19**. Of the six
   acceptance criteria this is the one left open; the other five are met.
2. **Branch protection.** `main` has **no** branch protection —
   `gh api repos/amel-tech/medaris/branches/main/protection` returns 404. So no
   stale required check is blocking PRs, and AC #6 is not blocked. But creating
   protection is a repository-settings change, not a code change, and is not done
   here. Required check names to configure, once the workflows have run at least
   once: **`Commit hygiene`**, **`Verify`**, **`Security gates`**,
   **`Analyze (javascript-typescript)`**, **`Analyze (actions)`**. Assigned to
   **MDRS-19** (cutover).
3. **`nrwl/nx-set-shas` on push-to-main.** On the very first run there is no
   prior successful `ci.yaml` run to use as a base, so it falls back. Expected to
   self-correct from the second run; not observed.
4. ~~CodeQL `actions` language with `+security-extended,security-and-quality`.~~
   **Resolved on PR #15:** `Analyze (actions)` passed in 50s and
   `Analyze (javascript-typescript)` in 1m21s, so both query suites exist for
   both languages. `fail-fast: false` is retained anyway, so a future failure in
   one cannot mask the other's findings.
5. ~~The Postgres service.~~ **Removed** after review showed it could never be
   used — see §5 #1. Nothing in this pipeline needs a database, and `test:e2e`
   brings its own via Testcontainers.
6. **`commitlint --from/--to` over the PR range.** Both the title check and the
   range check passed on PR #15 (`Commit hygiene`, 38s), but the range check has
   not been exercised against unusual histories — force-pushed or rebased
   branches, or a PR whose base branch moved underneath it.
7. **Node 22 prod floor.** CI builds on `.nvmrc` (24) only; `node:22-alpine` is
   what production runs. Not exercised.

## 7. Follow-ups

| Owner | Item |
| --- | --- |
| **MDRS-16** | Decide the deploy trigger policy. The 7 per-app workflows are release-tag/`dispatch`/`call` only; the deleted `ci-dev.yaml` files auto-deployed on push to main. That capability is currently gone — intentionally, but someone must decide whether a dev environment should get it back. |
| **MDRS-17** | Delete `.migration/` entirely (6 release-please files remain). Per MDRS-14's note: the per-package `pull-request-title-pattern`s let bot release commits pass `scope-enum` and must be preserved; `extra-files` is stale in both configs. |
| **MDRS-18** | README/`CONTRIBUTING.md` need the Nx target vocabulary and CI behaviour — see the handoff below. |
| **MDRS-19** | Create branch protection on `main` with the 5 check names in §6.1. Confirm on the first app-only PR that only that stack's builds ran. |
| **MDRS-20** | Frontend test coverage is zero; `tedris-web`'s `test` target is an `echo`. Also owns `test:e2e`, which is what the Postgres service is there for, and restoring PR coverage reporting (dropped here — see §1). |
| **MDRS-21** | Drive `tools/ci/biome-baseline.json` to `{0,0,0}` and empty `audit-ci.json`'s 31-entry allowlist. Both are ratchets designed to be lowered. Also migrate `.github/dependabot.yaml` off `package-ecosystem: npm` and close the 3 already-dead Dependabot PRs (#6, #7, #8) — see §5 #6; none of them can pass this pipeline. |
| unassigned | Add `actionlint` to CI (all 9 workflows pass it today). Pin the first-party `actions/*` refs repo-wide (7 deploy workflows + these 2). Extend `depcheck` beyond its 3 projects. Consider a `[22, 24]` Node matrix. The 3 per-package `audit:ci` scripts are redundant under a single lockfile and could be dropped. |

## Handoff to MDRS-18 (docs)

For `README.md` — the target vocabulary a contributor needs:

| Target | Projects | What it runs |
| --- | --- | --- |
| `typecheck` | 16 | `tsc --noEmit` |
| `lint` | 16 | `biome check {projectRoot}` — **root config files excluded**, see `lint:root` |
| `build` | 8 | `nest build` / `next build` / `tsc` / `vite build` |
| `test` | 3 | Jest (backend); `tedris-web` is a stub |
| `module-boundaries` | 16 | ESLint, `@nx/enforce-module-boundaries` only |
| `depcheck` | 3 | unused/missing deps |

Root scripts that are **not** Nx targets and must be called directly:
`pnpm lint:root` (workspace-root Biome + ratchet), `pnpm audit:ci`,
`pnpm security-check`, `pnpm assert:affected-isolation`.

For `CONTRIBUTING.md` (MDRS-14 created it; this is the CI section it lacks):

- `pnpm affected` is the local equivalent of the CI `verify` job — same five
  targets, in the same order.
- CI validates the **PR title** with commitlint, because squash-merge composes
  main's commit message from it server-side and no local hook ever sees it. A PR
  title that would fail `commit-msg` locally fails CI.
- A build on a clean checkout needs `apps/*/.env` seeded from `.env.example`;
  CI does this automatically, locally you must.
- Lint warnings are ratcheted, not ignored: adding one fails CI even though
  `biome ci` exits 0. Fix it, or justify raising
  `tools/ci/biome-baseline.json`.
- Nx caching is local-only by design (`neverConnectToCloud`); CI starts cold
  every run.
