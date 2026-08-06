# MDRS-11 — Nx task orchestration + TypeScript project references

**Status:** executed
**Date:** 2026-08-06
**Author:** Enes Yasin Gedik
**Issue:** MDRS-11 (see §9 — the issue could not be read from Linear)
**Runs on top of:** [MDRS-10](./mdrs-10-pnpm-workspace.md) (pnpm workspace)
**Normative source:** [ADR-001](../adr/001-monorepo-merge-and-layout.md) §D1, §D3, §D5, §D7, §D8, §D11

---

## 1. What this changed

Turborepo was staged out in MDRS-9 and never replaced, so the root `build` /
`check-types` / `test` scripts were plain `pnpm -r` pass-throughs with no task graph,
no caching and no dependency ordering. Nx 23.0.0 now owns the root, and the
TypeScript project-reference graph ADR §D7 asks for is wired.

| | Before | After |
| -- | -- | -- |
| Root orchestration | `pnpm -r run <script>` | `nx run-many -t <target>` |
| Task graph | none | `nx.json` `targetDefaults`, ported from the two staged `turbo.json` files |
| Task cache | none | Nx local cache, correct `inputs`/`outputs` per target |
| Affected detection | none | `nx affected`, `defaultBase: main` |
| Nx project names | n/a | 16 × `project.json`, ADR §D3/§D4 names (`tedris-web`, not `@medaris/tedris-web`) |
| Typecheck target name | `check-types` ×11, `type-check` ×2, **absent ×3** | `typecheck` ×16 |
| Typecheck coverage | 11 of 16 packages | **16 of 16** |
| TS project references | backend only (`common` ← `tedrisat`/`teskilat`) | backend **+** the full frontend graph, plus a root solution `tsconfig.json` |
| Root `tsconfig.json` | did not exist | solution-style (ADR §D1) |

## 2. Nx is a task runner here, not a build system

Nx infers a target from every `package.json` script (`nx:run-script`), so the commands
that run are byte-identical to what ran before — `nest build`, `next build`, `jest`,
`tsc`. **No `@nx/*` inference plugin is installed.** `@nx/js`, `@nx/next`, `@nx/vite`,
`@nx/nest`, `@nx/eslint`, `@nx/eslint-plugin` and `@nx/vitest` stay in the catalog
unconsumed until the task that needs them (MDRS-13 for eslint, MDRS-20 for vitest).

This is deliberate. Registering an inference plugin swaps the executor and changes how
a thing is built; ADR-001's second rule is that the merge changes nothing semantically.
Nx therefore contributes ordering, caching and `affected` — and nothing else.

Peer ranges were verified against the registry before anything was installed, because
ADR §D8 flags "Nx 23.0.0 + TS 5.9 is proven only diagonally in-house" as a risk:

| Package @23.0.0 | Declared peers | Against our catalog |
| -- | -- | -- |
| `nx` | `@swc/core ^1.15.8` (optional), `@swc-node/register` (optional) | `~1.15.43` ✅ |
| `@nx/js` | `@swc/cli >=0.6.0 <0.9.0` (optional), `verdaccio` (optional) | `^0.7.8` ✅ |
| `@nx/eslint` | `eslint ^8 \|\| ^9 \|\| ^10`, `@nx/jest`, `@zkochan/js-yaml` | eslint `^10.5.0` ✅ |
| `@nx/eslint-plugin` | `eslint-config-prettier ^10`, `@typescript-eslint/parser ^8` | `typescript-eslint ^8.62.0` ✅ |
| `@nx/nest` | `@nestjs/core`/`common` `>=10 <12`, `rxjs ^7`, `reflect-metadata >=0.1 <0.3` | `~11.1.19` ✅ |
| `@nx/next` | `next >=14 <17` | `~16.1.6` ✅ |
| `@nx/vite` | `vite ^5 \|\| ^6 \|\| ^7 \|\| ^8` | `~5.4.21` ✅ |
| `@nx/vitest` | `vite ^5…^8`, `vitest ^3 \|\| ^4`, `@nx/eslint 23.0.0` | vitest `^4.1.9` ✅ |

**The ADR §D8 risk does not exist: neither `nx` nor `@nx/js` declares a `typescript`
peer at all**, so TS 5.9.3 is unconstrained. Two further results worth keeping, because
they retire open questions in the ADR rather than just this issue:

- **ADR §D3's keycloak-theme question is answered.** `@nx/vite@23.0.0` accepts
  `vite ^5.0.0`, so the frozen Vite 5.4.21 island needs **no** plugin exclusion when
  MDRS-20 registers `@nx/vite`.
- **MDRS-10 §7 recorded `nx` as shipping no install script. That was wrong** — it was
  measured while nx was absent from the dependency graph, so pnpm never scanned it.
  `nx@23.0.0` has a postinstall that fetches the platform-native binary, and the first
  install failed with `ERR_PNPM_IGNORED_BUILDS`. `allowBuilds.nx: true` is now explicit
  in `pnpm-workspace.yaml`, which is what ADR §D11 pre-approved anyway.

## 3. The task graph

`nx.json` `targetDefaults` are a port of the two `turbo.json` files staged in
`.migration/` (now deleted — see §7), not a fresh invention:

| Target | `dependsOn` | Cached | Outputs |
| -- | -- | -- | -- |
| `build` | `^build` | yes | `dist` / `.next` (minus `cache`) / `theme/main.css` |
| `typecheck` | `^build`, `^typecheck` | yes | `.tsbuild`, `tsconfig.tsbuildinfo` |
| `test`, `test:coverage` | `^build` | yes | `coverage`, `test-results` |
| `dev`, `start*`, `storybook`, `run-keycloak` | `^build` where the source config had it | no | — `continuous: true` |
| `db:migrate` | `db:generate` | no | — |

Everything not listed is uncached by Nx default, which matches the `cache: false` the
turbo configs set on `clean`, `audit`, `audit:ci`, `depcheck` and the `db:*` family.

**One conflict had to be adjudicated.** The backend turbo config declared
`test: dependsOn ["^build", "build"]`; the frontend one declared `test: dependsOn
["^test"]`. There is no single prior behaviour to preserve, so: `test` depends on
`^build` only. A project's own build is not an input to its own tests — jest runs
ts-jest over source — while `^build` is genuinely required, because `@medaris/common`
resolves to `dist/index.js`. Keeping the backend's literal `"build"` edge would have
forced a full `next build` before `tedris-web`'s `echo 'Tests not implemented'`.

**Turbo's `globalDependencies: ["**/.env.*local"]` is ported, but not as a file input.**
Nx's file map is `.gitignore`-aware, so `.env*.local` is invisible to it and a plain
glob input would have been silently inert. `sharedGlobals` therefore carries a `runtime`
input that hashes those files, and each Next app additionally declares the exact
variables its `env.ts` validates (14 for tedris/nizam/nazir, 3 for landing) as Nx `env`
inputs, so a changed value in CI busts the build cache.

Three `sharedGlobals` entries point at files that do not exist yet —
`{workspaceRoot}/.github/workflows/ci.yml`, `{workspaceRoot}/vitest.config.ts` (both
named by ADR §D5) and `{workspaceRoot}/tsconfig.json`. They are inert forward
declarations so MDRS-15 and MDRS-20 get correct cache invalidation for free.

The inferred project graph was checked against ADR §D5's hand-written edge table and
**matches it exactly** — including the ADR's claim that `hooks` and `types` have zero
consumers:

```
keycloak-theme -> icons, ui          tedris-web  -> i18n, icons, services, tokens, ui, utils
tedrisat       -> common             nizam-web   -> i18n, icons, services, ui, utils
teskilat       -> common             landing-web -> i18n, icons, ui
ui             -> icons, tokens      nazir-web   -> ui
common, tokens, icons, services, i18n, types, utils, hooks -> (no internal deps)
```

## 4. One typecheck target instead of three names and five holes

`check-types` (11 packages), `type-check` (`common`, `icons`) and **nothing at all**
(`tedrisat`, `teskilat`, `i18n`) all became `typecheck`. The name is ADR §D5's, from the
CI line `nx affected -t test build typecheck module-boundaries`.

This was not cosmetic. `pnpm -r run check-types` silently skipped the five packages that
did not use that exact name — including both NestJS apps. Root typecheck coverage goes
from 11/16 to 16/16, and the three packages that never had the script have now been
type-checked for the first time since the merge (all clean).

`.vscode/tasks.json`'s "Check Types" task and `libs/icons/README.md` were updated to
match. The root `check-types` script is **gone**, not aliased — one target, one name.

## 5. TypeScript project references — delivered, with a measured scope

MDRS-10 deferred these here, stating they "need `composite: true`, which fights `noEmit`
in the Next apps." That diagnosis was half right, and the half that was wrong is what
made the work possible:

- **Apps genuinely cannot be composite.** TypeScript forbids `composite` with
  `noEmit: true`, which every Next app requires. So apps can never be *reference
  targets*, and the root solution `tsconfig.json` cannot list them.
- **But apps do not need to be composite to be reference *sources*.** Only the libs they
  point at do. That is the part that was open, and it is now measured: all 9 libs emit
  declarations cleanly under `composite: true` (each probed individually).

The one real constraint found is `incremental`: `tsconfig.base.json` sets
`incremental: false`, and TypeScript rejects that on a composite project (TS6379), so
each composite lib turns it back on.

### What is wired

Composite, emitting declarations to a gitignored `.tsbuild/` via `emitDeclarationOnly`:
`ui`, `icons`, `services`, `i18n`, `utils`. Their `typecheck` script becomes
`tsc -b tsconfig.json`; the declarations exist **only** to satisfy the reference graph —
`main`/`exports` still resolve to `src/`, nothing ships from `.tsbuild/`, and ADR §D7's
"no dist builds for the source-consumed libs" holds at the consumer boundary.

References follow the real edges from §3: `ui → icons`; `tedris`/`nizam` → 5 libs;
`landing` → 3; `nazir` → 1; `keycloak-theme` → 2. `tedrisat`/`teskilat` → `common`
already existed and is untouched.

Root `tsconfig.json` is solution-style (ADR §D1): no files of its own, references the
6 composite libs, so `pnpm exec tsc -b tsconfig.json` emits the whole library graph in
dependency order.

Three libs are deliberately **excluded**, and this is the rule for adding a new one:

| Lib | Why excluded |
| -- | -- |
| `tokens` | Its public types are a hand-written `index.d.ts` at the package root, not compiled output. A reference would redirect nothing. |
| `hooks`, `types` | Zero consumers today (ADR §D4). A reference nothing traverses is machinery nothing reads. |

Adding a first import of `@medaris/hooks` from an app therefore means: make the lib
composite, switch its `typecheck` to `tsc -b`, and add the `references` entry — one
commit, three lines.

### Evidence that the graph is live, not decorative

Deleting `libs/ui/.tsbuild` and type-checking `tedris` produces 114 × `TS6305`
("Output file … has not been built from source file …"). The Nx `typecheck → ^typecheck`
edge is what guarantees it is built, and the cold run in §6 exercises exactly that path.

### What references do **not** cost

`next build` was measured with references wired, both with and without lib declarations
present: **9.5s and 9.4s, both passing**. Next 16's Turbopack build resolves through
pnpm's `node_modules` links to source and does not use TypeScript's project-reference
redirect. So the TS6305 prerequisite binds the standalone `typecheck` target *only* —
it does **not** reach `next build`, and therefore does not reach the Docker images or
deploy workflows MDRS-16 owns. No new prerequisite was pushed into a pipeline that has
not been touched yet.

> A first pass at this measurement reported the opposite. It was contaminated twice:
> once by a stale `apps/tedris/tsconfig.tsbuildinfo` (the app sets `incremental: true`,
> so redirected resolution survived a config revert), and once by invoking a `next`
> binary at the workspace root, where pnpm's strict layout does not put one. Both runs
> were redone from clean state. `tsconfig.tsbuildinfo` is now a declared Nx output of
> `typecheck` precisely so the cache manages it instead of leaving it to go stale.

## 6. Verification

Run from a clean cache (`nx reset`) with every build artefact removed —
`.tsbuild/`, `libs/common/dist`, `apps/*/.next`, `apps/*/dist`, all `tsconfig.tsbuildinfo`.

| Check | Result |
| -- | -- |
| `pnpm install --frozen-lockfile` | **passes** — lockfile change is nx + its deps only |
| `pnpm typecheck` (`nx run-many -t typecheck`) | **16/16 projects pass** + 2 dependency tasks |
| `pnpm build` (`nx run-many -t build`) | **8/8 build targets pass** |
| `pnpm test` (`nx run-many -t test`) | **3/3 pass** — tedrisat 8 suites / 89 tests, teskilat 2/2, tedris-web `echo` |
| `pnpm exec tsc -b tsconfig.json` (root solution) | **passes**, emits all 6 lib declaration sets |
| `apps/keycloak-theme` `vite build` | **passes** (2.26s) — references did not disturb the frozen Vite 5 island |
| `nx affected --base=origin/main` | resolves, lists all 16 (root config changed) |
| Nx cache replay | confirmed — repeat runs report tasks read from cache |
| Reference graph is enforced | confirmed — removing one `.tsbuild/` yields 114 × TS6305 |

Next-app builds use placeholder values copied from each app's committed `.env.example`
into a gitignored `.env.local`, exactly as MDRS-10 §7 did. No `.env` is committed and
none was needed.

### Not verified here

- **`keycloakify build` (the jar).** The `vite build` half passes. The jar step needs a
  JRE and this machine has none — unchanged from MDRS-10 §7. MDRS-16 owns that pipeline.
- **`tedris` / `nizam` interactive boot.** Both build; both need a live Keycloak to get
  past the auth flow.
- **CI behaviour of `nx affected`.** No workflow runs it yet — all 7 workflows are
  release-tag / `workflow_dispatch` / `workflow_call` triggered with no `paths:` filter
  (ADR "Corrections" table). MDRS-15 owns wiring `nx affected` into CI, including
  `nrwl/nx-set-shas` for the base SHA.
- **Nx remote caching.** Not configured; `neverConnectToCloud: true` and
  `analytics: false` are set per ADR §D5.

## 7. `.migration/` and one dead root file

- `.migration/backend/turbo.json` and `.migration/frontend/turbo.json` — **deleted**.
  Their task semantics live in `nx.json` (§3). This is MDRS-11's share of the directory;
  20 files remain, owned by MDRS-12 (husky, commitlint), MDRS-15 (CI workflows) and
  MDRS-17 (release-please). The directory must be empty and gone by MDRS-17.
- **Root `nest-cli.json` — deleted.** MDRS-9 §6 listed it as root config that "rode along
  and still needs an owner"; root task orchestration is this issue. It was provably dead:
  it declared `root: "apps/madrasah-backend"` — a directory that has never existed in this
  repo — and pointed every project at a `tsconfig.app.json` that does not exist either.
  Both NestJS apps carry their own working `nest-cli.json`, which is what `nest build`
  actually reads. Left in place it was a trap, not a config.

## 8. Follow-ups

- **FU-8 — `.vscode/tasks.json` still has "Lint Code" / "Fix Linting Issues" tasks
  pointing at root `lint` / `lint:fix` scripts that do not exist.** ESLint and Biome are
  absent between MDRS-10 and MDRS-12 by design; these two tasks have been broken since
  MDRS-10 and are left for **MDRS-12**, which is adding the scripts they call.
- **FU-9 — `README.md` still describes the repo as documentation-only awaiting a merge,
  and documents no commands.** The merge landed in MDRS-9/10 and the root command set
  changed here. **MDRS-18** owns docs; the tag table and command reference are already
  its deliverables (ADR §D5).
- **Boundary `tags` are not in `project.json`.** ADR §D3 describes the end state as
  `name` + `tags`, but §D5 binds tag application to the PR that documents the taxonomy
  and enables `module-boundaries` — **MDRS-13**. Only `name` is set here, so MDRS-13
  lands tags, the CLAUDE.md/CONTRIBUTING table and enforcement together, as §D5's
  sequencing rule requires.
- Nx currently derives `npm:*` pseudo-tags from `package.json` `keywords` (visible on
  `tokens` and `icons`). They are inert; MDRS-13 should confirm they do not collide with
  the real `scope:`/`platform:`/`type:` tags.
- **FU-10 — `hooks`, `types` and `utils` declare `"module": "./dist/index.js"`, and that
  `dist/` no longer exists.** MDRS-10 dropped their builds (§D7) and repointed `main` to
  `src/index.ts` but left `module` behind. Bundlers that prefer `module` over `main`
  resolve to a missing file; today every build passes because Turbopack falls back to
  `main`, so this is latent rather than broken. Not fixed here on purpose — editing
  module-resolution fields changes which file a bundler picks, which is a behavioural
  change that wants its own diff, not a rider on a task-graph PR.
- Carried forward from MDRS-10, untouched here: **FU-6** (`start:prod` path, MDRS-16) and
  **FU-7** (`docs/PRD.md` namespace, PRD owner).

## 8a. Review fixes applied in this PR

Self-review of the diff caught three things; two are fixed above the line, one became
FU-10.

- **`clean` did not remove `.tsbuild`** in any of the five composite libs. Left alone,
  the new declaration output would have been un-cleanable — and a stale `.tsbuild` is
  precisely the failure mode that contaminated the first measurement in §5. Every
  composite lib's `clean` script now removes it. (`libs/utils`' script was also
  normalised from three chained `rm -rf` calls to one.)
- **`libs/ui` had `include: ["**/*.ts", "**/*.tsx"]` against the new `rootDir: "./src"`.**
  Every TS file in the package is under `src/` today, so it compiled — but the first
  root-level `.ts` anyone adds (a `tailwind.config.ts`, say) would have failed with
  "not under rootDir". The include is now `src/`-scoped, matching the other four
  composite libs, which were already correct.

## 9. Acceptance criteria used

The Linear MCP connection available to this session authenticates against a workspace
that does not expose the `amel-tech` board — `list_teams` returns a single unrelated
team and `MDRS-11` cannot be fetched. The acceptance criteria used are therefore
ADR-001's decisions for this issue, as instructed: **§D1** (root `nx.json`,
solution-style root `tsconfig.json`), **§D3/§D4** (`project.json` carrying the Nx
project name), **§D5** (target naming and the `typecheck` target, `analytics: false`),
**§D7** (TS project references), **§D8** (Nx 23.0.0 exact, TS ~5.9.3 peer verification)
and **§D11** (`allowBuilds` governance), plus the four debts MDRS-10 §9 assigned to
MDRS-11. The Linear issue status and PR link must be set by hand.

## Related

- [MDRS-10 pnpm workspace record](./mdrs-10-pnpm-workspace.md)
- [MDRS-9 history merge record](./mdrs-9-history-merge.md)
- [ADR-001](../adr/001-monorepo-merge-and-layout.md)
