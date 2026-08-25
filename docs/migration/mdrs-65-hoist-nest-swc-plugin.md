# MDRS-65 — Hoist `nestSwcPlugin` to the workspace-root Vitest base

Base: `cb7e963`. Config and dependency wiring only; no application source
changed.

Every figure below was read off command output on this branch. What could not be
measured is listed under **Not verified** rather than left out.

## The defect

`nestSwcPlugin` was constructed twice, with a byte-identical option object:

- `apps/tedrisat/vitest.config.ts:31-45`
- `apps/teskilat/vitest.config.ts:18-30`

The tedrisat copy carried a comment stating the exact reason it must not be
copied — it is exported there "so `vitest.integration.config.ts` reuses the
identical transform rather than a drifting copy" — and the copy was made across
the app boundary anyway.

Why this duplication and not another: the plugin is the only thing keeping
`design:paramtypes` alive under Vitest. Vitest transforms with esbuild by
default and esbuild emits no decorator metadata at all, so if one copy lost
`transform.decoratorMetadata` or `transform.legacyDecorator`, NestJS DI would
break at runtime in that one app's tests while `typecheck` and `build` stayed
green — and the other app would keep working, so the failure would not look like
a config problem. `CLAUDE.md` records 78 of 89 tests going red exactly this way.

## What changed

| File | Change |
| --- | --- |
| `vitest.config.ts` | Now exports `nestSwcPlugin`, with the full explanation of the three SWC flags moved here from tedrisat. **Not** added to this file's own `plugins` array. |
| `apps/tedrisat/vitest.config.ts` | Copy deleted. `import baseConfig, { nestSwcPlugin } from "../../vitest.config"`; the `unplugin-swc` import is gone. |
| `apps/teskilat/vitest.config.ts` | Same. |
| `apps/tedrisat/vitest.integration.config.ts` | `nestSwcPlugin` now comes from `../../vitest.config` instead of `./vitest.config`. |
| `apps/teskilat/vitest.integration.config.ts` | Same. |
| `package.json` | `unplugin-swc: catalog:` added to root `devDependencies` — the import moved here, so the declaration did too. |
| `apps/tedrisat/package.json`, `apps/teskilat/package.json` | `unplugin-swc` removed. Neither app imports it any more. |
| `pnpm-lock.yaml` | One `importers` entry moved from the two apps to the root. Same resolved version, `1.5.11`; no other line changed. |

### Why the dependency moved to the root

`unplugin-swc` was declared by both apps and by neither root. After the hoist
the only file that imports it is the root `vitest.config.ts`, so both app
declarations became genuinely unused — and `-t depcheck` said so, failing
`tedrisat` and `teskilat` with `Unused devDependencies * unplugin-swc`. That is
the **Security gates** check on CI, so this was a real red, not a cosmetic one.
Caught by running `pnpm nx run-many -t depcheck` before opening the PR.

It was fixed by moving the declaration rather than by adding a `.depcheckrc.json`
ignore: the package is still used, just from one directory up, and an ignore
entry would have hidden a true statement instead of correcting a false one.

Resolution was then verified, not assumed. With `unplugin-swc` declared only at
the root, `apps/tedrisat/node_modules/unplugin-swc` no longer exists
(`ls` → absent) and the specifier resolves by Node's `node_modules` walk-up to
`<root>/node_modules/unplugin-swc`. `teskilat`'s two suites pass against that
layout, and so does the full gate below.

### What exporting the plugin does and does not buy

It is exported rather than added to the root `plugins` array so that only the
two Nest apps run their files through SWC; a web project that later
`mergeConfig`s this base does not pay the transform.

It does **not** make the dependency opt-in, and an earlier draft of this record
claimed it did. `import swc from "unplugin-swc"` is a static top-level import,
so it is evaluated whenever the base module loads — whether or not
`nestSwcPlugin()` is called. Any project merging this base therefore resolves
`unplugin-swc` (and its `@swc/core` peer) at config-load time. That works
precisely *because* the declaration is at the root, which is the opposite of
what "the web projects do not have to resolve the package" asserted. Making the
plugin genuinely optional would mean moving the import behind a dynamic
`await import()`; that is not done here and is not needed today, since the two
Nest apps' four config files are the only importers of the root base at all
(`grep` for `../../vitest.config` across `apps/` and `libs/` returns nothing
else, and no web project has a Vitest config yet).

### `@swc/core`, the peer that had no home

`unplugin-swc@1.5.11` declares a required — not optional — peer on
`@swc/core` (`^1.2.108`). After the hoist, root declared `unplugin-swc` but not
that peer: `ls node_modules/@swc/core` came back **absent** at the root, and
the only `@swc/core` declarations in the workspace were the two apps' own, even
though nothing in either app imports it and neither `nest-cli.json` configures
an SWC builder. `.depcheckrc.json` ignores `@swc/*`, so no gate would ever have
said so.

Nothing was broken — pnpm satisfies the peer inside `unplugin-swc`'s own
`.pnpm` peer-scoped directory, which is why every suite passed. But the
catalog's own comment on that entry is
`~1.15.43 # floors backend 1.15.33; emitDecoratorMetadata under Vitest` — the
floor exists *for this transform*, and the transform now lives at the root. So
`"@swc/core": "catalog:"` was added to the root `devDependencies`, putting the
version floor where the thing it constrains is defined. Same resolved version,
`1.15.46`; one new `importers` line in the lockfile. The two apps' declarations
were left alone — see the follow-ups.

### Module boundaries

No new escape hatch. `eslint.config.mjs:70` already allows the
`../../vitest.config` specifier (the MDRS-13/MDRS-20 entry); the allow list is
keyed on the specifier, not on which binding is imported from it, so switching
from a default-only import to `baseConfig, { nestSwcPlugin }` needs nothing.
`apps/*/vitest.integration.config.ts` moves from a same-project relative import
to that already-allowed one. `-t module-boundaries` green on 16 projects.

`nx.json` needed no change: `sharedGlobals` already lists
`{workspaceRoot}/vitest.config.ts`, so editing it still invalidates every cached
`test` result.

## Verified

Gate, all with `--skip-nx-cache`:

| Target | Result |
| --- | --- |
| `typecheck` | 16 projects green |
| `test` | 3 projects green — **226 tests / 17 suites, 0 failures** |
| `build` | 8 projects green |
| `lint` | 16 projects green |
| `module-boundaries` | 16 projects green |
| `depcheck` | 3 projects green |

`pnpm run lint:root` (the Biome ratchet) also holds: 553 files, 0 errors,
91 warnings, 27 infos — every count equal to its baseline, none exceeded.

Test totals read off each runner's own summary line: `tedrisat`
`Test Files 15 passed (15) / Tests 224 passed (224)`, `teskilat`
`Test Files 2 passed (2) / Tests 2 passed (2)`. The third project with a `test`
target, `tedris-web`, has no specs at all — its script is
`echo 'Tests not implemented'` — so the 17/226 total is the two Nest apps.

The JUnit reports under `coverage/` were not used as the source for those
figures: `apps/tedrisat/coverage/junit.xml` was observed 0 bytes immediately
after one `run-many` invocation, so the console summary was read instead. That
is worth knowing separately from this change — see the follow-ups.

Tedrisat's e2e suites boot Testcontainers `postgres:17-alpine`. The Docker
Desktop context on this machine was unreachable, so the run used
`DOCKER_HOST=unix:///var/run/docker.sock`. That is a local environment detail,
not a repository change.

### The acceptance criterion that needed a negative test

"Both Nest apps' unit and integration configs resolve to that one instance" is
not observable from a green run — a stale second copy would also be green. So it
was tested by breaking the single remaining copy on purpose:
`transform.decoratorMetadata` was flipped to `false` in the hoisted
`vitest.config.ts` and nothing else was touched.

| Run | Result with the flag flipped |
| --- | --- |
| `teskilat` unit + e2e via `vitest.config.ts` | 2 files failed, 2 tests failed |
| `tedrisat` `test/e2e/app.e2e.spec.ts` via `vitest.integration.config.ts` | 1 file failed, 2 tests failed — `Error: Nest can't resolve dependencies of the DatabaseService (?, LOGGER)` |

Both apps and both config kinds went red from one edit in one place, which is
the property the task asks for. The flag was restored immediately afterwards and
the full gate above was run against the restored file.

On acceptance criterion 3 — "a spec that exercises an injected provider in each
backend app" — no new spec was written, because both apps already have one and
the negative test above proves it bites. `apps/teskilat/test/unit/app.controller.spec.ts`
and `apps/tedrisat/test/unit/app.controller.spec.ts` both compile a
`TestingModule` around `AppController`, whose constructor injects `AppService`
by type; that resolution is exactly what `design:paramtypes` feeds.

## Not verified

- **The web-project claim.** "A web project that later merges this base is
  unaffected" is reasoned from the code, not measured — no web project has a
  Vitest config today, so there was nothing to run.
- **The AI Multi-Lens Review Gate.** Red on PR #49, and not because a lens
  raised a finding: the preflight resolved `actor Argedik permission=write`,
  which is not admin, and 05:08 UTC is outside the `16:00-21:00 UTC` review
  window, so the lenses were deferred to the nightly drain rather than run. The
  gate's own message says "This check is red because deferred is not reviewed,
  not because a finding was raised." Nothing in this change has been through
  those lenses yet. Re-running one off-hours is deliberately an admin decision,
  so the label was left alone.

### Correcting one claim in an earlier draft of this record

This document first said CI runs nothing against a pull request, because all
seven workflows were release-tag / `workflow_dispatch` / `workflow_call`
triggered. That was wrong, and the count was the tell: the seven are the
per-app *deploy* workflows. `.github/workflows/ci.yaml:17-21` is an eighth, and
it is triggered by `pull_request: branches: [main, dev]` — its own header calls
it "The single shared-CI surface for the monorepo (MDRS-15)". This record even
contradicted itself, calling `depcheck` "the **Security gates** check on CI"
four sections earlier. PR #49 ran ten checks; nine pass:

| Check | Result |
| --- | --- |
| `Verify` (the five-target gate on Node 24) | pass, 3m5s |
| `Security gates` | pass, 35s |
| `Commit hygiene` | pass, 36s |
| `Traceability` | pass, 6s |
| `Analyze (javascript-typescript)` | pass, 1m20s |
| `Analyze (actions)` | pass, 45s |
| `CodeQL` | pass |
| `AI review preflight` | pass |
| `AI Multi-Lens Review Gate` | **fail** — deferred, see above |

`Verify` passing removes what this record had listed as unverified: the gate
now has run on CI's Node 24, not only on this machine's Node, so the coverage
thresholds in both app configs held there too. It has since passed a second
time, on the follow-up commit.

## Follow-ups

None opened. Five observations, none in this task's scope:

1. `apps/tedrisat/vitest.config.ts` and `apps/teskilat/vitest.config.ts` still
   duplicate their `test.include` / `exclude` globs and the entire `coverage.exclude`
   list verbatim. Unlike the SWC plugin, drift there is loud — a dropped glob
   drops suites and `passWithNoTests: false` fails the run — so it is a tidiness
   issue, not a silent-failure one.
2. `apps/tedrisat/vitest.config.ts`'s header says "the four
   `test/e2e/*.e2e.spec.ts` suites still run under `nx run tedrisat:test`".
   There are six such files today, and `vitest.integration.config.ts`'s header
   correctly says six. Pre-existing and left alone here: this task's diff is
   config wiring, and correcting a stale count is a separate, verifiable claim.
3. `apps/tedrisat/coverage/junit.xml` was 0 bytes after a `nx run-many -t test`
   run that reported success, and correctly populated after `nx run
   tedrisat:test` on its own. Not investigated — it did not affect any gate
   result here, and no CI job currently consumes these reports. If one is ever
   wired up, confirm the file is written before the target exits.
4. Both apps still declare `@swc/core` even though neither imports it and
   neither `nest-cli.json` uses an SWC builder. `.depcheckrc.json` ignores
   `@swc/*`, so no gate will ever flag it. Left in place here: removing a
   declaration that currently satisfies a peer is a change worth making on its
   own, with its own verification, not as a rider on this one.
5. `tedrisat:test` was reported failing in one of three consecutive
   `nx run-many -t test` invocations during review, with Nx marking it a flaky
   task. Not reproduced in the runs recorded above and not introduced by this
   change — that target runs six Testcontainers e2e suites under
   `fileParallelism: false`, and container boot is the plausible culprit. Worth
   noting that "test green" here rests on runs that passed rather than on a
   target proven deterministic.
