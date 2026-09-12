# MDRS-41 — the authz port, after review

Pull request #61 ports the `@Authz` mechanism from `madrasah-backend` PR #80
into `libs/common` (see the PR body and `docs/migration/mdrs-40-pr-80-authz-assessment.md`
for what moved and why). This record covers what the review of #61 changed.

## Review findings and what they changed

| # | Finding | Outcome |
|---|---|---|
| 1 | `@Authz` is inert unless the author also remembers `@UseGuards(AuthGuard, AuthzGuard)`; a decorator without the guard reads as protection and grants none. | **Fixed, with the boot-time assertion rather than `APP_GUARD`.** A global guard runs before controller-scoped ones, so registering `AuthzGuard` globally would run it before `AuthGuard` has set `request.user` and fail every annotated route — the ordering the guard's own docblock depends on. `AuthzWiringAssertion` (`libs/common/src/authz/authz-wiring.assertion.ts`, provided by `AuthzModule` via `DiscoveryModule`) walks every controller at `onModuleInit`, and throws — naming `Controller.method` and the fix — for any `@Authz` handler with no `AuthzGuard` in its class- or handler-level `@UseGuards`. Six unit cases in `libs/common/test/authz/authz-wiring.assertion.spec.ts`. |
| 2, 4 | The köşk resolver's docblock said returning `PUBLIC` for a non-UUID id makes `CREATE_KOSK` apply. It does not — `CREATE_KOSK` is on no kosk row by design — and the "fix" the comment invited is a privilege escalation. | **Fixed.** The docblock now states the matrix fact and says not to add `CREATE_KOSK` to the PUBLIC row. |
| 3 | `resolveDeckRole` tested `isPublic` before `authorId`, so the author of a public deck resolved to `PUBLIC` and lost every owner scope on their own deck. | **Fixed.** Ownership first; `isPublic` decides only between `PUBLIC` and deny for non-authors. Pinned by a new unit case. |
| 5 | `resolveCourseRole` ran four dependent-looking queries in series; the most common caller (PUBLIC) paid all four. | **Fixed.** The parent-köşk, müderris and enrollment lookups run in `Promise.all` once the course row is known — two round trips instead of four. Priority is applied to the results. |
| 6 | The new `course_muderris (course_id, user_id)` lookup had no index; neither column is indexed and Postgres does not index the referencing side of a FK. | **Fixed.** `course_muderris_course_id_user_id_idx` on the schema and migration `0012_course_muderris_course_user_idx.sql`. The migration was written by hand: `drizzle-kit generate` stops on an interactive table-rename prompt against the current snapshot, which cannot be answered in CI or from a script. Applied by the e2e suites' migrator on every run. |
| 7 | The resolver injected `DatabaseService` and re-implemented lookups that exist on the repository interfaces — a layering inversion that left ownership with two readers. | **Fixed.** The resolver injects `KoskRepository`, `CourseRepository` and `FlashcardDeckRepository` (`findOwnerId`, `findKoskId`, `findEnrollment`, `findById`, plus the new `CourseRepository.isMuderris`). `AuthzBindingsModule` imports the three feature modules, which now export those repositories. |
| 8 | Four of the five new specs tested `@medaris/common` code but lived in `apps/tedrisat`. | **Fixed.** `libs/common` has a `test` target (`vitest.config.ts` with the shared `nestSwcPlugin`); `auth-matrix`, `authz.guard`, `authz.service` and `resolvers` specs moved to `libs/common/test/authz/`, importing from `../../src`. `tedrisat-role-resolver.spec.ts` stays in tedrisat and now stubs the repositories. |
| 9 | `export * from "./authz"` published `MATRIX`, `ROLES`, `Entity`, `Role` and ~20 more generic names into the package's only entry point. | **Fixed.** `libs/common/src/index.ts` names the authz exports explicitly (values and `export type` separately), so a future collision is a visible duplicate rather than a silently dropped re-export. |

## What was verified

- `libs/common`: typecheck, lint, module-boundaries, and `test` (5 files, 47 tests) green.
- `tedrisat`: typecheck green; the resolver spec (20 cases) green; full `test` in the PR.
- Merged `origin/main` (MDRS-31's `RateLimitModule` alongside `AuthzModule` in `app.module.ts`).

## What was NOT verified

- **The migration was not applied against a snapshot-consistent `drizzle-kit`
  run** — see finding 6. It is a single `CREATE INDEX IF NOT EXISTS`, applied by
  the Testcontainers migrator in every e2e suite, which is the evidence.
- **No route carries `@Authz` yet** (MDRS-43), so `AuthzWiringAssertion` is
  exercised by its unit spec and by booting tedrisat's test apps with zero
  annotated routes, not by a live refusal.

## Follow-ups (not opened as issues)

1. The `0011` snapshot and the current schema disagree enough for
   `drizzle-kit generate` to prompt; whoever next generates a migration should
   reconcile the snapshot first, or the hand-written `0012` has no snapshot to
   follow it.
2. `libs/common`'s coverage is scoped to `src/authz/**`; the rest of the library
   still has no unit suite.
