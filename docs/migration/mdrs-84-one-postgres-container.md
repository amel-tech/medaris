# MDRS-84 — One Postgres container per run, not one per test file

Base: `9cf36a8`. Test infrastructure only; no application source changed.

Every figure below was read off command output on this branch, on one machine
(Docker 28.4.0, Node 22.21.0, `postgres:17-alpine` already pulled). What could
not be established is listed under **Not verified** rather than left out.

## The defect

`apps/tedrisat/vitest.config.ts` sets `pool: "forks"` with
`fileParallelism: false`, so Vitest runs each test file in its own fork.
`test/helpers/test-app.helper.ts` kept the Testcontainers instance in a
module-level `globalPostgresContainer`, guarded by a `if (container) return`
check that reads like a per-run singleton and was in fact a per-fork one: a
fresh fork means a fresh copy of the module, so the check never once found a
container someone else had started.

The result was one `postgres:17-alpine` boot, and one full 14-migration run, per
e2e file. Measured on the base commit:

```
$ /usr/bin/time -p pnpm nx run tedrisat:test --skip-nx-cache
$ grep -c "Starting PostgreSQL container for tests" ...
8
real 38.48
 Test Files  22 passed (22)
      Tests  377 passed (377)
   Duration  34.27s
```

Eight boots for the eight files in `test/e2e/`, and every new e2e file added
another. `CLAUDE.md` names `-t test` as the only gate that catches a broken
NestJS container and forbids skipping it, so this is a cost the repo pays on
every change to tedrisat.

## What changed

| File | Change |
| --- | --- |
| `apps/tedrisat/test/global-setup.ts` | **New.** Starts the one container in the main process, hands the workers its connection details through `project.provide("postgres", …)`, stops it in `teardown`. Carries the `ProvidedContext` augmentation and the `SIGINT`/`SIGTERM` handlers that used to sit in the helper. The module holds the startup **promise**, not the resolved container — see below. |
| `apps/tedrisat/test/helpers/test-app.helper.ts` | Container lifecycle removed. `createTestApp` now `inject`s the connection details and, once per test file, creates that file's own database inside the shared container before populating `process.env` and importing `AppModule`. |
| `apps/tedrisat/vitest.config.ts` | `globalSetup: ["./test/global-setup.ts"]`. The `fileParallelism: false` comment no longer claims suites race for the Docker daemon — they cannot, the container is up before any worker runs — and states the reason it stays serial anyway. |
| `apps/tedrisat/vitest.integration.config.ts` | Same `globalSetup` entry. It is not inherited: this file merges the workspace-root integration base, not its sibling. |

No spec file was touched. `startTestDatabase` and `stopTestDatabase` were
exported but imported nowhere outside the helper itself, so removing them
changed no call site.

### Why `provide`/`inject` and not `process.env`

A fork's environment is a copy taken when it is spawned. A variable that
`globalSetup` sets on the main process reaches a worker only by accident of
timing, and silently does not reach one already running. `provide`/`inject` is
the channel Vitest documents for exactly this.

### Why a database per file, not one database shared by all of them

Before this change every file owned a whole container, so cross-file isolation
was free. The obvious replacement — let all eight suites share one database and
rely on the `beforeEach` truncation most of them already do — would have made
that free property conditional on two things that are not guaranteed:

- **Eight files keeping their cleanup discipline.** They do not have it
  uniformly today. `app.e2e.spec.ts` never cleans (it asserts only on routes),
  and `throttler.e2e.spec.ts` cleans two tables by name rather than truncating.
- **`fileParallelism` staying `false`.** It is a config line, and nothing fails
  loudly if someone flips it.

A fresh database per file costs one `CREATE DATABASE` plus the migrations the
Nest app already runs at boot (`AUTO_MIGRATIONS_ENABLED=true`), so no new
migration machinery was needed. The name is derived from the test file path —
stem for readability, an 8-character sha1 prefix for uniqueness — and validated
against `/^[a-z0-9_]{1,63}$/` before it is interpolated into `CREATE DATABASE`,
which takes an identifier and cannot be parameterised.

### Why the module holds the startup promise, not the container

Review finding on this PR. The first revision assigned the module-level
`container` only once `await …start()` had resolved, which left it `null` for
the whole duration of `start()` — image pull, container create and the wait
strategy, the longest single stretch of the run and exactly when a developer
reaches for Ctrl-C. A signal in that window found `stopContainer`'s
`if (!container) return`, and the process exited with a Postgres container that
nothing held a reference to. Ryuk was the only thing left to reap it, and
`TESTCONTAINERS_RYUK_DISABLED=true` is a real setting.

`startup` now holds the promise instead, assigned synchronously in the same
statement that calls `.start()` — before any await point, so the window closes
rather than merely narrows. `stopContainer` awaits it, swallowing a rejected
start (there is nothing to stop, and rethrowing would replace the real failure
with a teardown one) before calling `stop()` on whatever it resolved to.

The trade-off, stated rather than hidden: a signal arriving mid-`start()` no
longer exits immediately, because the handler waits for the start to settle so
it has something to stop. A few seconds against a leaked container is the right
default, and a second Ctrl-C reaches the default handler as before.

## Measurements

Same machine, same command, cold Nx cache both times.

| | Before (`9cf36a8`) | After |
| -- | -- | -- |
| Postgres containers started | 8 | **1** |
| Databases created | 1 per container | 8, one per e2e file |
| `nx run tedrisat:test` wall clock | 38.48 s | **24.66 s** |
| Vitest reported duration | 34.27 s | 21.11 s |
| Test files | 22 passed | 22 passed |
| Tests | 377 passed | 377 passed |

13.8 s, or 36%, off the target that every tedrisat change has to run.

Acceptance criteria, each against the command that establishes it:

- **Exactly one container, visible in the run output** — `grep -c "Shared
  PostgreSQL container started"` returns `1`; the eight `Using database
  tedrisat_<stem>_<digest> in the shared container` lines are the per-file
  databases.
- **Suites pass in any order and alone** — `vitest run --config
  ./vitest.integration.config.ts --sequence.shuffle.files --sequence.seed=1` and
  `--sequence.seed=42` both reported `8 passed (8)` / `167 passed (167)` from
  one container. `kosk`, `app` and `throttler` each pass run on their own
  (`1 passed (1)`), `app.e2e.spec.ts` being the suite that does no cleanup at
  all.
- **Before/after wall clock on the same machine** — the table above.

## Not verified

**The suite has a pre-existing intermittent failure, and this change was not
shown to leave its rate alone.** Measured by running the full
`nx run tedrisat:test --skip-nx-cache` repeatedly:

| | Full runs | Failed |
| -- | -- | -- |
| `9cf36a8` with no changes applied | 8 | 1 |
| This branch | 6 | 2 |

Three distinct tests were involved across those three failures — two in
`course.e2e.spec.ts > enrollment approval`, one in `flashcard-bulk.e2e.spec.ts >
deck ownership` — and in two of them the request that failed was a `POST` in a
`beforeEach`, answered `403` (`POST /kosks`) and `400` (`POST /flashcard/decks`)
where `201` was expected. Neither route carries `@Authz` metadata, and no run
logged a connection-pool error, so neither status is yet explained.

Neither file reproduces it alone: `course.e2e.spec.ts` passed 8 runs out of 8
and `flashcard-bulk.e2e.spec.ts` 3 out of 3, run on their own on this branch.

One thing is established and one is not. It is **not introduced by this change**
— it happens on the base commit with none of this applied, where every file had
its own container, so neither the shared container nor the per-file databases
can be what creates it. What that does **not** show is that sharing a container
leaves the rate alone: 2-in-6 against 1-in-8 is far too small a sample to
separate, and this record deliberately does not claim the rate is unchanged.

One candidate worth checking first is that every app boot makes a real network
call — `Failed to pre-load JWKS keys during module initialization: JWKS fetch
failed` appears in every run, on both commits, because the test environment
points `KEYCLOAK_JWKS_URL` at the live `auth.medaris.app`.

This needs its own issue and its own measurement, on a machine that can afford
the runs to make a rate meaningful.

**Not attempted:** turning `fileParallelism` back on. Per-file databases make it
safe from the data side, but each e2e file boots one or two full Nest
applications with their own `pg` pools, and nobody has sized the shared
container's `max_connections` against eight of those at once. It is a separate
change with a separate measurement.
