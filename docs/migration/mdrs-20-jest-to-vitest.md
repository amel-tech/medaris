# MDRS-20 — Jest → Vitest

Migration record. Every number below was read out of command output; the two
things that were **not** verified are named as such in §7.

Base: `origin/main` at `68faa44`. Measured locally on Node 22.20.0, pnpm 11.4.0,
Docker 29.3.1. CI runs Node 24 (`.nvmrc`).

---

## 1. Inventory — before

Three projects declared a `test` target; two of them ran real tests.

| Project | Runner | Config | Spec files | Suites | Tests |
| --- | --- | --- | --- | --- | --- |
| `tedrisat` | Jest | `apps/tedrisat/jest.config.json` | 8 | 8 | 89 |
| `teskilat` | Jest | `apps/teskilat/jest.config.json` | 2 | 2 | 2 |
| `tedris-web` | — | none (`echo 'Tests not implemented'`) | 0 | 0 | 0 |
| **Total** | | **4 Jest configs** | **10** | **10** | **91** |

Four Jest config files existed, matching the task description exactly:
`apps/{tedrisat,teskilat}/jest.config.json` and
`apps/{tedrisat,teskilat}/test/jest-e2e.json`. There was no `jest.preset.js`.

No other project had a `test` script, and `git ls-files | grep -E
'\.(spec|test)\.[tj]sx?$'` returned exactly those 10 files — **zero** frontend
specs. `libs/common` has a `depcheck` target but no tests.

Baseline command output (`pnpm nx run-many -t test --skip-nx-cache`):

```
> nx run tedris-web:test
Tests not implemented
> nx run teskilat:test
Test Suites: 2 passed, 2 total
Tests:       2 passed, 2 total
> nx run tedrisat:test
Test Suites: 8 passed, 8 total
Tests:       89 passed, 89 total
NX   Successfully ran target test for 3 projects and 2 tasks they depend on
```

tedrisat's wall time was **32.42 s**.

### What the four Jest configs actually did

- `apps/tedrisat/jest.config.json` — `testMatch: ["<rootDir>/test/**/*.spec.ts",
  "<rootDir>/src/**/*.spec.ts"]`. That glob covers `test/e2e/*.e2e.spec.ts`, so
  **4 of tedrisat's 8 suites are e2e and ran inside the plain `test` target**,
  each booting a Testcontainers `postgres:17-alpine`. `testTimeout: 60000`,
  `maxWorkers: 1`, coverage via `collectCoverageFrom`, `jest-junit` →
  `coverage/junit.xml`, and `globalTeardown: test/helpers/global-teardown.ts`.
- `apps/teskilat/jest.config.json` — same shape, no timeout/worker cap, no
  teardown; its single e2e suite needs no database.
- `apps/tedrisat/test/jest-e2e.json` — `testRegex: ".*\\.e2e.*\\.spec\\.ts$"`,
  selecting the same 4 e2e suites. So `test:e2e` was a narrower **re-run**, not
  extra coverage.
- `apps/teskilat/test/jest-e2e.json` — `testRegex: ".e2e-spec.ts$"`. Note the
  **hyphen**. The only e2e file is `test/e2e/app.e2e.spec.ts`, so this pattern
  matched nothing and `pnpm test:e2e` in teskilat selected **zero suites**.
  Verified directly rather than assumed:

  ```
  $ node -e '...'
  test/e2e/app.e2e.spec.ts   teskilat-jest-e2e: false | tedrisat-jest-e2e: true
  test/unit/app.controller.spec.ts  teskilat-jest-e2e: false | tedrisat-jest-e2e: false
  ```

---

## 2. Inventory — after

| Project | Runner | Configs | Spec files | Suites | Tests |
| --- | --- | --- | --- | --- | --- |
| `tedrisat` | Vitest 4.1.10 | `apps/tedrisat/vitest.config.ts` + `vitest.integration.config.ts` | 8 | 8 | 89 |
| `teskilat` | Vitest 4.1.10 | `apps/teskilat/vitest.config.ts` + `vitest.integration.config.ts` | 2 | 2 | 2 |
| `tedris-web` | — | unchanged (`echo 'Tests not implemented'`) | 0 | 0 | 0 |
| **Total** | | **2 root + 4 project configs** | **10** | **10** | **91** |

**Test count is unchanged: 91 tests across 10 suites.** No spec file was
deleted, renamed, skipped, or excluded. Per-file counts from the Vitest run
(Jest printed only the totals, which matched):

| File | Tests |
| --- | --- |
| `tedrisat test/unit/app.controller.spec.ts` | 1 |
| `tedrisat test/unit/example/example.controller.spec.ts` | 8 |
| `tedrisat test/unit/example/example.repository.spec.ts` | 11 |
| `tedrisat test/unit/example/example.service.spec.ts` | 11 |
| `tedrisat test/e2e/app.e2e.spec.ts` | 2 |
| `tedrisat test/e2e/course.e2e.spec.ts` | 27 |
| `tedrisat test/e2e/example.e2e.spec.ts` | 13 |
| `tedrisat test/e2e/kosk.e2e.spec.ts` | 16 |
| `teskilat test/unit/app.controller.spec.ts` | 1 |
| `teskilat test/e2e/app.e2e.spec.ts` | 1 |
| **Total** | **91** |

---

## 3. What was done

**Two workspace-root base configs**, both listed in `nx.json` `sharedGlobals` so
editing either invalidates every cached `test` result:

- `vitest.config.ts` — globals on, node environment, `passWithNoTests: false`,
  v8 coverage, and the built-in `junit` reporter replacing `jest-junit`.
  Deliberately sets **no** `test.include`: `mergeConfig` concatenates arrays, so
  a base glob could never be narrowed by a project and would silently widen
  every project's spec selection.
- `vitest.integration.config.ts` — e2e base: long timeouts, serialised
  execution, coverage off, separate junit file.

**Four project configs** `mergeConfig` those. Spec globs are carried over
verbatim from the Jest configs they replace, which is what keeps the four
tedrisat e2e suites inside the `test` target.

**Specs**: only `jest.fn` → `vi.fn` and `jest.clearAllMocks` →
`vi.clearAllMocks`, in 3 files. `describe` / `it` / `expect` / `beforeEach`
carry over untouched because `globals: true` is set. No assertion, no test body,
and no test name was changed.

**Deleted**: all four Jest config files; the `jest`, `@types/jest`, `ts-jest`
and `jest-junit` catalog entries and every package reference to them.
`apps/tedrisat/tsconfig.json` `types` went from `["node","multer","jest"]` to
`["node","multer","vitest/globals"]`.

**`nx.json`**: the `production` named input's `!{projectRoot}/jest.config.*` and
`!{projectRoot}/jest-e2e.json` became the two `vitest*.config.ts` paths, so test
config still stays out of build/typecheck cache keys.

### `apps/tedrisat/test/helpers/global-teardown.ts` was deleted, not ported

Jest's `globalTeardown` runs in the parent process, with its own module
registry — so the `globalPostgresContainer` it saw was always `null` and
`stopTestDatabase()` there never stopped anything. That is visible in the
**baseline** Jest output, which logs the teardown entering and finishing but
never logs the "Stopping PostgreSQL container..." line inside the branch that
would do the work:

```
Running global teardown...
Global teardown completed.
Jest did not exit one second after the test run has completed.
```

Vitest's `globalSetup` has the same parent-process semantics, so porting it
would have reproduced a no-op. The containers are reaped by Testcontainers' own
Ryuk sidecar, which is unchanged. `stopTestDatabase` itself is still used — the
`SIGINT`/`SIGTERM` handlers in `test-app.helper.ts` call it — so no export went
dead.

### Two dependency decisions that needed a real fix

**`vite` is now a named catalog entry.** `vitest@4` peers on
`vite: ^6 || ^7 || ^8`. With no `vite` declared by the backend apps, pnpm
satisfied that peer from the frozen keycloak-theme pin (`vite: ~5.4.21`, ADR-001
§D8 exception #1) and Vitest died at startup:

```
Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: Package subpath './module-runner'
is not defined by "exports" in .../vitest@4.1.10/node_modules/vite/package.json
```

`vite/module-runner` is a subpath vite 5 does not export. Since one package is
genuinely needed at two majors and the default catalog cannot hold a name twice,
`pnpm-workspace.yaml` gained a `catalogs.vitest` entry (`vite: ^7.3.6`) that the
two Nest apps reference as `catalog:vitest`. keycloak-theme keeps `catalog:` and
stays frozen at vite 5.

**`eslint.config.mjs` `allow`.** `@nx/enforce-module-boundaries` rejected each
project config's `import ... from "../../vitest.config"` with *"External
resources cannot be imported using a relative or absolute path"*. The two
specifiers are whitelisted via the rule's own `allow` option. This whitelists
two import paths; it exempts no file from the rule, adds no style rule, and
leaves `depConstraints` untouched.

---

## 4. Nest DI — proven by falsification, not asserted

This is the failure mode the task calls the hard part: esbuild, Vitest's default
transform, emits no decorator metadata, so `design:paramtypes` disappears and
Nest cannot resolve constructor dependencies — while `tsc --noEmit` and
`nest build` both stay green. `unplugin-swc` is configured with
`jsc.parser.decorators`, `jsc.transform.legacyDecorator` and
`jsc.transform.decoratorMetadata` all on.

Rather than assume that config took effect, the flag was flipped and the run
repeated.

**`decoratorMetadata: false`** — 2 of 2 teskilat suites fail, and the failure is
exactly an unresolved injection (`this.appService` is `undefined`):

```
FAIL  test/unit/app.controller.spec.ts > AppController > root > should return "Hello World!"
TypeError: Cannot read properties of undefined (reading 'getHello')
 ❯ AppController.getHello src/app.controller.ts:23:28
     23|     return this.appService.getHello();
       |                            ^

FAIL  test/e2e/app.e2e.spec.ts > AppController (e2e) > / (GET)
Error: expected 200 "OK", got 500 "Internal Server Error"

 Test Files  2 failed (2)
      Tests  2 failed (2)
```

**`decoratorMetadata: true`** — the same two suites pass:

```
 Test Files  2 passed (2)
      Tests  2 passed (2)
```

The config was restored to `true` afterwards and the whole gate re-run. So the
SWC transform is doing the work, and the guard is demonstrated rather than
claimed. Both backend apps additionally satisfy the acceptance criterion
"a spec exercising an injected provider passes": teskilat's suites inject
`AppService` into `AppController`, and tedrisat's e2e suites boot the full
`AppModule` with `DatabaseService` injected (see §5).

`biome.json` was **not** touched. `useImportType` stays disabled for
`apps/tedrisat`, `apps/teskilat` and `libs/common` — turning it back on breaks
`design:paramtypes` the same way, and no comment was added to that file.

---

## 5. e2e really starts Testcontainers

From the `-t test` run — real container boot, real drizzle migrations, real HTTP:

```
> nx run tedrisat:test
Starting PostgreSQL container for tests...
PostgreSQL container started at postgres://testuser:testpass@localhost:32856/tedrisat_test
INFO: Database connected successfully   context: "DatabaseService"
INFO: Migrations completed successfully context: "DatabaseService"
 ✓ test/e2e/course.e2e.spec.ts  (27 tests) 3662ms
 ✓ test/e2e/example.e2e.spec.ts (13 tests) 2495ms
 ✓ test/e2e/app.e2e.spec.ts     ( 2 tests) 2776ms
 ✓ test/e2e/kosk.e2e.spec.ts    (16 tests) 2629ms
 ✓ test/unit/example/example.service.spec.ts    (11 tests) 18ms
 ✓ test/unit/example/example.controller.spec.ts ( 8 tests) 19ms
 ✓ test/unit/example/example.repository.spec.ts (11 tests) 16ms
 ✓ test/unit/app.controller.spec.ts             ( 1 test)  15ms
 Test Files  8 passed (8)
      Tests  89 passed (89)
```

Multi-second e2e durations against sub-20 ms unit durations are the container
round-trips. Wall time dropped from Jest's **32.42 s** to **19.48 s**.

### `test:e2e` was broken on main and is fixed here

`apps/tedrisat/test/jest-e2e.json` set neither `testTimeout` nor `maxWorkers`, so
four suites each booting a container raced past Jest's 5 s default hook limit.
Vitest splits Jest's single `testTimeout` into `testTimeout` / `hookTimeout` /
`teardownTimeout`, and container boot happens in a `beforeAll` — i.e. under
`hookTimeout`, whose default is **10 s**. All three are set explicitly, plus
serialised execution. Result:

```
> nx run tedrisat:test:e2e     Test Files  4 passed (4)   Tests  58 passed (58)
> nx run teskilat:test:e2e     Test Files  1 passed (1)   Tests   1 passed  (1)
```

teskilat's `test:e2e` selected **0** suites before (§1) and selects 1 now — this
target gained a suite; none was lost anywhere.

### A silent-ignore trap that was caught in the act

The first draft used `poolOptions: { forks: { singleFork: true } }` to reproduce
Jest's `maxWorkers: 1`. Vitest 4 **removed** `poolOptions`; it only logs

```
DEPRECATED  `test.poolOptions` was removed in Vitest 4.
```

and otherwise ignores the value — confirmed in vitest's own source, where the
key's sole remaining use is `if ("poolOptions" in resolved) logger.deprecate(...)`.
The suites would have run in parallel while the config looked correct. Replaced
with `fileParallelism: false` (which forces `maxWorkers` to 1) plus an explicit
`maxWorkers: 1`. The final gate run emits no deprecation notice.

---

## 6. Coverage gate

Jest collected coverage and gated **nothing** — neither `jest.config.json` had a
`coverageThreshold`. Coverage is now enforced: both apps' `test` script is
`vitest run --coverage`, so `nx run-many -t test` fails the build when a floor is
missed. `coverage.include` / `exclude` are carried over verbatim from
`collectCoverageFrom`.

Measured (v8 provider, Node 22.20.0), and the floors set from it:

| App | Metric | Measured | Floor |
| --- | --- | --- | --- |
| `tedrisat` | statements | 63.10 % (419/664) | 60 |
| | branches | 53.95 % (116/215) | 50 |
| | functions | 62.22 % (196/315) | 58 |
| | lines | 63.01 % (397/630) | 60 |
| `teskilat` | statements | 70 % (7/10) | 65 |
| | branches | 100 % (**0/0**) | 50 |
| | functions | 66.66 % (4/6) | 62 |
| | lines | 70 % (7/10) | 65 |

Two deliberate choices:

- Floors sit ~3 points below measured, to absorb v8 line-attribution differences
  between Node majors — this was measured on 22 and CI runs 24.
- teskilat's `branches` floor is **not** 100. That figure is `0/0`; the file has
  no branches yet, so a literal floor would fail on the first branch anyone adds.

The floors are a ratchet: raise them as coverage grows, never lower one to make a
run pass.

---

## 7. Verification

All six gates, `--skip-nx-cache`, in order, after the final edit:

| Gate | Result |
| --- | --- |
| `nx run-many -t typecheck` | ✅ **16 projects** + 2 dependencies |
| `nx run-many -t test` | ✅ **3 projects — 10 suites / 91 tests** |
| `nx run-many -t lint` | ✅ **16 projects** |
| `nx run-many -t module-boundaries` | ✅ **16 projects** |
| `nx run-many -t build` | ✅ **8 projects** |
| `node tools/ci/biome-ratchet.mjs` | ✅ 527 files · 0 errors · **94 warnings** · **27 infos** |
| `nx run-many -t depcheck` | ✅ 3 projects, "No depcheck issue" |

The ratchet's warning and info counts are **identical to the 94 / 27 baseline** —
this change adds neither. File count went 526 → 527 (six configs added, four Jest
configs and one teardown helper removed). `.depcheckrc.json` needed no new
ignore: depcheck resolves `vitest`, `vite`, `@vitest/coverage-v8` and
`unplugin-swc` through the config files.

### Zero Jest remains — residual sweep

`git grep -l jest` over the whole tree was run and every hit resolved:

| Hit | Action |
| --- | --- |
| `apps/{tedrisat,teskilat}/.dockerignore` — `jest.config.js`, `jest-e2e.json` | Replaced with `vitest.config.ts`, `vitest.integration.config.ts`. Not cosmetic: `test/` is ignored but the config files sit at the app root, so without this they would be copied into the images. |
| `apps/tedris/.dockerignore` — `jest.config.*` | → `vitest.config.*`. |
| `.github/dependabot.yaml` — `"jest"` in the `dev-tools` group (twice) | → `"vitest"` + `"@vitest/*"`, so the new runner is actually grouped. |
| `pnpm-lock.yaml` | Only `jest-worker@27.5.1` remains — a transitive of the bundlers, never a declared dependency. `jest@29`, `ts-jest`, `@types/jest` and `jest-junit` are gone from the lock; `require.resolve("jest")` from `apps/tedrisat` now throws `MODULE_NOT_FOUND`. |
| `pnpm-workspace.yaml` | The remaining mentions are the comment recording that these four entries were removed. |
| `audit-ci.json` | Left as-is on purpose: those are historical rationale comments about what the audit config used to hide, not live references. |

Stale `node_modules/.pnpm/jest*` directories do survive an in-place install, but
they are orphaned store entries: nothing in the lockfile references them and no
package can resolve them. A fresh clone never materialises them.

### Not verified

- **Coverage under Node 24.** Everything here was measured on Node 22.20.0;
  Node 24 was not installed locally. The floors carry a ~3-point margin for
  exactly this, but the Node 24 figures themselves are unmeasured — CI is the
  first run that produces them.
- **`test:watch` and `test:debug`.** Rewritten to `vitest` and
  `vitest run --inspect-brk --no-file-parallelism`, but neither was executed;
  they are interactive and no gate covers them. `test`, `test:coverage` and
  `test:e2e` were all run.

## 8. Out of scope — frontend

The task's work list includes "Frontend: `@nx/vite` + `jsdom` +
`@vitejs/plugin-react` per app", and that was **not** done. Its own current-state
note says frontend "has no meaningful test setup to migrate", and the inventory
confirms it: **zero** frontend spec files. Migrating Jest cannot touch what never
used Jest.

Scaffolding a runner with nothing to run would need `passWithNoTests: true` to
exit 0, which produces a `test` target that is green because it asserts nothing —
strictly worse than `tedris-web`'s honest `echo 'Tests not implemented'`, which
at least reads as a gap. `tedris-web`'s stub is therefore left exactly as it was.

Follow-up: write the first frontend specs and land the `@nx/vite` + `jsdom` +
`@vitejs/plugin-react` setup with them, in one change, so the config arrives with
tests that exercise it.

## 9. Follow-ups

1. **Frontend test setup** — §8. Still the repo's largest coverage gap.
2. **Raise the coverage floors.** tedrisat's `src/flashcard` tree is at 8.86 %
   statements and drags the whole app down; `src/course` and `src/kosk` are at
   97 %+. Floors should climb as flashcard gains tests.
3. **One container instead of four.** Each e2e suite boots its own postgres
   because module state is per-file under Vitest's default isolation. A Vitest
   `globalSetup` could start one container, publish its connection details
   through the environment, and genuinely tear it down. Deliberately not
   attempted here — it changes test-helper architecture, and this change's job
   was to keep 91 tests at 91.
4. **`@vitest/ui`** sits in the catalog unused; either wire a `test:ui` script or
   drop the entry.
