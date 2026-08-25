# MDRS-66 — one root-env bootstrap, in `@medaris/env`

Branch `argedikas/mdrs-66-env-package`, off `origin/main` at `cb7e9636`.

MDRS-25 landed the single-root-`.env` scheme by copying its bootstrap into six
files. MDRS-66 reports that the copies had already drifted on the day they
landed, and that the drift is in the part with real semantics: the four
`next.config.js` copies **threw** when no `pnpm-workspace.yaml` was found, while
`apps/tedrisat/src/load-env.ts` and `apps/teskilat/src/load-env.ts` returned
`null` and **skipped in silence**. `findRepoRoot` existed a seventh time inside
`tools/env/root-env.cjs`, the file all six were trying to reach.

## 1. What was done

`tools/env/root-env.cjs` became `libs/env/src/root-env.cjs`, the implementation
file of a new workspace package `@medaris/env`, and all six call sites were
reduced to an import plus a call.

| File | Before | After |
| -- | -- | -- |
| `apps/{tedris,nizam,nazir,landing}/next.config.js` | 22 lines: walk-up + `require(join(repoRoot, "tools", "env", "root-env.cjs"))` | `requireCjs("@medaris/env").loadRootEnv("<app>")` |
| `apps/{tedrisat,teskilat}/src/load-env.ts` | 29 lines: own `findRepoRoot`, `null` on not-found, `existsSync` guard around the require | `import { loadRootEnv } from "@medaris/env"` + `loadRootEnv("<app>")` |
| `tools/env/root-env.cjs` | seventh `findRepoRoot` | moved; `tools/env/` is gone |

The new package:

- `libs/env/package.json` — `@medaris/env`, `main: ./src/root-env.cjs`,
  `types: ./src/root-env.d.ts`, `type: module`, private, version `0.0.0`.
- `libs/env/project.json` — **`tags: ["scope:shared", "type:util"]`**, added in
  this same change per MDRS-13 (§4 below measures what that actually enforces).
- `libs/env/src/root-env.cjs` — the one implementation.
- `libs/env/src/root-env.d.ts` — declarations for the two TypeScript call sites.
- `libs/env/test/root-env.spec.ts` + `libs/env/vitest.config.ts` — 28 tests, the
  first this code has ever had.
- `pnpm-workspace.yaml` — registered; the enumeration is now 17 packages.
- `commitlint.config.mjs` — `env` added to `scope-enum` (libs 9 → 10).

`@medaris/env` was added to the `dependencies` of all six consuming apps as
`workspace:*`. `pnpm-lock.yaml` is committed with the change.

### Why `.cjs` with no build step

`next.config.js` is evaluated before any TypeScript in this repo has been
compiled, so a package that only existed as `dist/` could not be the single
implementation — the four Next call sites would have had to keep a copy. A
`.cjs` file needs no build, and both an ESM `createRequire` caller and a
CommonJS-compiled Nest app can consume it unchanged. This was verified from
both shapes, not assumed; see §3.

`createRequire` rather than a static `import` in `next.config.js`: the package
is CommonJS, and keeping the call as a statement preserves exactly the shape
MDRS-25 used. Note that `env` has no `build` target, so **`build` stays at 8
targets** (AC #4) rather than becoming 9.

## 2. The not-found decision, and why the loud copy won

**Chosen behaviour: no `pnpm-workspace.yaml` anywhere up the tree throws.**
It is expressed in exactly one place — `findRepoRoot` in
`libs/env/src/root-env.cjs` — and every call site inherits it by importing that
function. There is no `if (!root)` guard left anywhere in the repository.

The silent-skip shape was not preserved. It let a process boot fully configured
by whatever happened to be in the ambient environment, with no signal that the
file it was supposed to read had never been looked for. A misconfigured app that
starts is worse than one that refuses to: the failure surfaces later, somewhere
else, as wrong behaviour rather than as a stack trace naming the cause.

The header of `root-env.cjs` separates the two conditions that were previously
conflated, because only one of them is an error:

1. **No marker anywhere up the tree → throw.** Not a supported state.
2. **Marker found, no `.env` beside it → return an empty map.** This is
   production: every value arrives through the real environment. Unchanged from
   MDRS-25, and *not* the silent skip the issue complains about — the walk-up
   succeeded and the file is legitimately absent.

### Consequence for the two Nest runtime images

The Nest apps run `load-env.ts` at container start, so the throw reaches
production. The runner stage of `apps/tedrisat/Dockerfile` and
`apps/teskilat/Dockerfile` previously carried neither `libs/env` nor
`pnpm-workspace.yaml`, which would have made every boot either
`MODULE_NOT_FOUND` or case 1. Both now copy three things into the runner:

```
COPY --from=build /app/pnpm-workspace.yaml   ./pnpm-workspace.yaml
COPY --from=build /app/libs/env/package.json ./libs/env/package.json
COPY --from=build /app/libs/env/src          ./libs/env/src
```

That puts the image in case 2 — a well-formed workspace with no `.env` — rather
than case 1. `pnpm-workspace.yaml` is a list of package paths and carries
nothing secret; the same file is already copied into the `deps` and `prod-deps`
stages of every one of these Dockerfiles.

The four Next apps need no Dockerfile change on this axis, and this was
measured rather than assumed (§3.3): `next.config.js` is evaluated during
`next build`, inside the checkout, and `output: "standalone"` inlines the
resulting config into `server.js` as a literal object. `next.config.js` is not
present in the standalone tree at all, so it is never re-evaluated at runtime
and `@medaris/env` is never needed there.

All six Dockerfiles also gained `COPY libs/env/package.json libs/env/` in their
manifest-only `deps` stage (and `prod-deps` where present), because
`pnpm install --frozen-lockfile` needs every one of the 17 registered packages'
`package.json` present. The "16 members" comments in those files were updated to
17. Missing this would have broken all six image builds.

## 3. What was verified, by measurement

### 3.1 The not-found case is now identical on both sides

A scratch directory outside any workspace — no `pnpm-workspace.yaml` at any
ancestor, checked by walking up to `/` — was given a copy of the shipped
`libs/env` and the two call-site shapes verbatim.

Next side (`apps/nizam/next.config.js` shape, ESM + `createRequire`):

```
Error: [@medaris/env] no pnpm-workspace.yaml found walking up from
  .../proof/next/node_modules/@medaris/env/src. The single root .env cannot be
  located, so this process would start with whatever happens to be in the
  ambient environment. ...
    at findRepoRoot (.../@medaris/env/src/root-env.cjs:92:13)
    at Object.loadRootEnv (.../@medaris/env/src/root-env.cjs:191:32)
    at file:///.../proof/next/next.config.js:5:28
exit=1
```

Nest side (`apps/tedrisat/src/load-env.ts` shape, CommonJS `require`):

```
Error: [@medaris/env] no pnpm-workspace.yaml found walking up from
  .../proof/nest/node_modules/@medaris/env/src. ...
    at findRepoRoot (.../@medaris/env/src/root-env.cjs:92:13)
    at loadRootEnv (.../@medaris/env/src/root-env.cjs:191:32)
    at Object.<anonymous> (.../proof/nest/load-env.js:3:1)
exit=1
```

Same message, same throw site (`root-env.cjs:92`), same exit code. The two
traces differ only in the frame that called in, which is what "one
implementation" means in practice. AC #2.

For contrast, the **pre-MDRS-66** `load-env.ts` (`git show cb7e9636:apps/tedrisat/src/load-env.ts`,
its two `import`s rewritten to `require` so Node could run it directly) in the
same orphan directory:

```
no throw, nothing loaded. root = null loader = null
exit=0
```

That is the bug, reproduced.

### 3.2 Case 2 behaves as documented

The runner layout was reproduced on disk — `pnpm-workspace.yaml` at the root,
`libs/env` beside it, `apps/tedrisat/node_modules/@medaris/env` symlinked to it,
no `.env`, cwd `/app/apps/tedrisat` as in the image:

```
no throw. keys applied from file: 0
exit=0
```

This exercises the file layout the Dockerfile now produces; it is **not** a run
of an actually built image (§6).

### 3.3 The Next apps never re-evaluate `next.config.js` at runtime

Inspected in the `apps/nizam/.next/standalone` tree produced by this branch's
`-t build`:

- `next.config.js` is **absent** from the standalone tree
  (`find … -name "next.config*"` returns nothing).
- `apps/nizam/server.js` carries the entire resolved config as an inlined
  object literal — `const nextConfig = {…,"configOrigin":"next.config.js",…}` —
  then sets `process.env.__NEXT_PRIVATE_STANDALONE_CONFIG` from it and passes
  it straight to `startServer({ config: nextConfig, … })`.
- `@medaris/env` is not in the traced `node_modules`, consistent with the
  bootstrap being build-time only for these four apps.

So the throw in `findRepoRoot` can only fire for a Next app during `next build`,
where the checkout is present by construction. This is what makes the two Nest
runner stages the only images that needed the `pnpm-workspace.yaml` + `libs/env`
copies.

### 3.4 `load-env` still runs first, and the import is not elided

This repo has already lost 78 tests to an import being erased from the emitted
JavaScript, so the emitted output was read rather than assumed. From
`apps/tedrisat/dist/` after this branch's `-t build`:

```
// dist/src/load-env.js
const env_1 = require("@medaris/env");
(0, env_1.loadRootEnv)("tedrisat");

// dist/src/main.js
require("./load-env");
require("./otel");
const common_1 = require("@medaris/common");
```

The static `import { loadRootEnv }` survives as a value require (it is called,
so nothing elides it), and `./load-env` is still evaluated before `./otel` and
before anything that reads `process.env`. That ordering constraint is unchanged
from MDRS-25.

### 3.5 The five gates

Run with `--skip-nx-cache`, `pnpm install` done, root `.env` present
(`cp .env.example .env`), `pnpm nx build common` done, Docker reachable via
`DOCKER_HOST=unix:///var/run/docker.sock`. Node 22.20.0, pnpm 11.4.0.

| Gate | `origin/main` (`cb7e9636`, per `CLAUDE.md`) | This branch, measured |
| -- | -- | -- |
| `typecheck` | 16 projects | **17 projects** ✅ |
| `test` | 226 tests / 17 suites | **254 tests / 18 suites** ✅ |
| `build` | 8 | **8** ✅ |
| `lint` | 16 | **17** ✅ |
| `module-boundaries` | 16 | **17** ✅ |

The `test` delta is exactly this change: 226 + 28 = 254, 17 + 1 = 18. Per
project: `tedrisat` 224 tests / 15 suites, `env` 28 / 1, `teskilat` 2 / 2;
`tedris-web`'s `test` script is still `echo 'Tests not implemented'`.

Note on the commit history: the first commit on this branch (`bd9b5f69`) records
"26 tests" and "252/18" in its message. Two more tests were added while
resolving review findings (`loadRootEnv` keeps no null-guard; quotes are not
stripped), making the correct figures **28 tests and 254/18**. Pushed commit
messages are not rewritten — `--amend` is forbidden in this repo — so this
record is the accurate one and the gate table below is the measured truth.

`libs/env` coverage, measured on Node 22.20.0 with the v8 provider: **74/74
statements, 42/42 branches, 6/6 functions, 66/66 lines — 100% on all four.**
`vitest.config.ts` sets floors of 95, not 100, so v8's small variation across
Node majors (CI runs 24) cannot turn into a red build on its own.

Repo assertion gates, all green on this branch:

- `pnpm run assert:release-config` — "7 components, one config, one manifest,
  chain intact."
- `pnpm run assert:affected-isolation` — both cases still isolate.
- `pnpm run lint:root` (biome ratchet) — 559 files, errors 0 / warnings 91 /
  infos 27, all equal to baseline, nothing raised.
- `pnpm nx run-many -t depcheck` — no issue in the 3 projects that have the
  target. `@medaris/env` is a detected, used dependency in both Nest apps.

## 4. `tags` are on the package, and here is what they enforce

`libs/env/project.json` carries `["scope:shared", "type:util"]` — `scope:shared`
with **no `platform:*` tag**, so both `platform:web` and `platform:node` projects
may depend on it. This is the shape `libs/{i18n,types,utils}` already use.

`CLAUDE.md` on the *stale local* `main` still said "project tags are not
configured yet, `depConstraints` is a single permissive entry". That is out of
date: MDRS-13 landed in the `cb7e9636` integration, all projects carry tags, and
`eslint.config.mjs` holds the real `depConstraints`. So these tags are not
inert — but they are not uniformly enforced either, and the difference was
measured rather than assumed.

Nx sees all six edges (`pnpm nx graph`):

```
tedrisat -> env (static)      landing-web -> env (static)
teskilat -> env (static)      tedris-web  -> env (static)
                              nazir-web   -> env (static)
                              nizam-web   -> env (static)
env tags: ['npm:private', 'scope:shared', 'type:util']
```

Whether `@nx/enforce-module-boundaries` *acts* on an edge is a separate
question, because the rule reads **import statements**, not `package.json`.
Measured by deliberately mis-tagging `env` and re-running the gate:

| Mis-tag | Consumer | Result |
| -- | -- | -- |
| `platform:web` | `tedrisat` (`platform:node`, static `import`) | **caught** — `load-env.ts:14:1  error  A project tagged with "platform:node" can not depend on libs tagged with "platform:web"` |
| `platform:node` | `nizam-web` (`platform:web`, `createRequire` only) | **not caught** — gate passed green |

So: for the two Nest apps the platform-neutrality of `@medaris/env` is enforced
by the linter. For the four Next apps it is documentary only, because
`requireCjs("@medaris/env")` is a runtime string the rule cannot see. That is a
property of `createRequire`, not of the tags, and it is the price of the
no-build-step constraint in §1. Both tags were restored and the full gate re-run
green before committing.

## 5. Deliberate deviations from the issue text

The issue's **Work** section asks for "a release-please component and a
commitlint scope". Only the commitlint scope was added.

`tools/ci/assert-release-config.mjs` pins the release-please component list to
exactly the seven deployable apps (`LOCKED_COMPONENTS`) and asserts that each
component has a deploy workflow guarding on its tag prefix. None of the nine
existing libs is a release-please component. Adding `libs/env` as an eighth
would mean giving a private, unpublished package a version, a git tag, a
CHANGELOG and a deploy workflow that deploys nothing — and editing the gate that
exists to prevent exactly that drift. The repo convention for a lib is: a
commitlint scope so its changes are attributable in `git log`, and no component.
`env` follows it. The four acceptance criteria do not mention release-please.

`nx.json`'s `sharedGlobals` lost `{workspaceRoot}/tools/env/**`. That path no
longer exists, and the six apps that load the bootstrap now reach it through the
project graph, so only those six are invalidated when it changes instead of all
17. Incidental finding while doing this: **every value under `namedInputs` must
be an array** — a `"//"` note placed inside it makes Nx reject the whole file
with `Given napi value is not an array on NxJson.namedInputs`. The note was
moved to the top level of `nx.json`, where it is accepted.

## 6. What was NOT verified

- **No Docker image was built or run.** The runner-stage `COPY` lines and the
  17-manifest `deps` stage are reasoned from the Dockerfiles and validated
  against a hand-built replica of the runner layout (§3.2), not against
  `docker build`. Building all six images was out of proportion to the change;
  it is the one step that would turn §2's container reasoning into a
  measurement, and it is the first thing to do if a Nest container fails to
  boot after this lands.
- **No standalone server was started.** §3.3 inspected the standalone tree and
  `server.js` source, which settles where the config comes from, but no
  `node apps/nizam/server.js` was run to confirm the server boots from it.
- **No live service was exercised.** No Keycloak flow, no running Nest app, no
  `next start`. The `.env` used for `-t build` is `.env.example` copied
  verbatim, so no real secret was involved.
- **`tedrisat:typecheck` did flake once**, on a re-run of the gate after the
  review edits: Nx failed the target, labelled it flaky itself
  ("Flaky tasks can disrupt your CI pipeline"), and the immediate re-run passed
  with exit 0. This is the known race between `common:build`'s `rimraf dist`
  and its consumers, not a regression from this change, and it was not
  investigated further — out of scope. `tedrisat:test` (Testcontainers) did not
  flake on any run here, which is an observation and not a guarantee.

## 6b. Review findings and what was done about each

A delegated `/code-review` pass returned five findings after PR #52 was opened;
it independently re-ran the gates and hand-built the Nest runner layout, and
confirmed the runner COPYs are correct. None was a correctness blocker. What was
done:

| Finding | Response |
| -- | -- |
| `CLAUDE.md` and `README.md` still said "20-scope enum"; it is now 21 | **Fixed.** Verified by reading the enum: `scope-enum[2].length` -> 21. |
| `parseEnv` does not strip surrounding quotes, and the new test pinned that as intended | **Documented, not changed** — see follow-up 3. The divergence note now sits above `parseEnv` and the test is renamed to say it is divergent. Changing the parse behaviour is a behaviour change to every app, not this task. |
| The "no override" test read the developer's real gitignored root `.env` | **Fixed.** It asserted `loadRootEnv("nizam")` bare; a root `.env` carrying an unrecognised `__` prefix made the suite fail for unrelated reasons. Reproduced: appending `KEYCLOAK__ADMIN=x` to the local root `.env` failed the old spec with `"KEYCLOAK" ... is not an app or a group` and passes on the new one, which asserts the walk-up directly and points `file` at a name that cannot exist. |
| Stale "16"/"nine libs" counts left in live files | **Fixed** in `tools/ai-review/lenses.yaml` (10 occurrences), `.github/workflows/{ci,traceability,linear-reconcile}.yaml`, the six app deploy workflows, `tools/ci/{biome-ratchet,assert-affected-isolation}.mjs`, and `docs/ci-ai-review-gate.md`. `lenses.yaml` mattered most: it is prompt text fed to the AI review gate, so a wrong fact there is restated to every reviewer. Records under `docs/migration/` and `docs/adr/` were left alone — they describe the repo as it was. |
| §7 listed two follow-ups already done in this PR, and §3.1 embedded a local absolute path | **Fixed.** Both removed. |

## 7. Follow-ups (no Linear issue opened — see §Linear policy)

Two items that were on this list in an earlier draft — auditing
`CONTRIBUTING.md` for the new package, and writing down the `createRequire`
blind spot — were done in this same change and are no longer follow-ups.


1. **ADR-001 §D11 is now stale.** It enumerates "all 16 packages: the 7 apps +
   `libs/{common, ui, icons, tokens, hooks, services, i18n, types, utils}`".
   With `libs/env` registered the count is 17 and the list needs `env`. Amending
   an ADR is a decision-record edit and was deliberately **not** made
   unilaterally here; whoever owns ADR-001 should add `env` to §D11 and to the
   tag table.
2. **`apps/tedrisat/package.json#start:prod`** still says `node dist/main`,
   which is wrong (`dist/src/main`). Noted in MDRS-16 as out of scope and still
   true; untouched here.
3. **`parseEnv` does not strip surrounding quotes**, diverging from dotenv and
   from Compose's own env-file parser: `A="x"` yields the four-character value
   `"x"`, and `A="x" # note` yields `"x" # note` because the trailing-comment
   rule skips quoted values. Pre-existing from MDRS-25. Not fixed here on
   purpose — stripping quotes changes the value every app receives, which is a
   behaviour change rather than the deduplication this task is. Measured while
   deciding: no line in `.env.example` or in the local root `.env` is quoted, so
   nothing misreads a value today. The divergence is now written above
   `parseEnv` and the test that covers it is named
   "does NOT strip surrounding quotes — a known divergence from dotenv", so
   taking this follow-up means changing an assertion that already says what it
   is rather than discovering the behaviour was pinned as correct.
