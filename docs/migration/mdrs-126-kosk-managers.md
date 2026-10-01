# MDRS-126 — A köşk can have more than one manager

## What was done

**tedrisat**

- New table `kosk_managers(kosk_id, user_id, added_by, created_at)`, primary
  key `(kosk_id, user_id)`, `kosk_id` → `kosks.id` `ON DELETE CASCADE`, index
  on `user_id` — the shape of MDRS-106's `madrasah_nazirs`. Migration
  `0021_kosk_managers` was generated with `drizzle-kit generate`; one statement
  was appended by hand: every existing köşk's `owner_id` becomes its first
  manager (`added_by` = the owner, `created_at` = the köşk's). Hand rollback:
  `src/database/rollbacks/0021_kosk_managers.down.sql` (drops the table; every
  manager but the creator is lost, and running 0021 again reseeds from
  `owner_id`).
- **`kosks.owner_id` is kept, as "who created the köşk".** It no longer grants
  anything. Dropping it would have touched every test and fixture that inserts
  a köşk, and the response field the web apps' generated client carries; the
  issue allowed either.
- **Every reader of management reads the membership now:**
  `KoskService.isOwner` → `isManager`, `assertOwner` → `assertManager`
  (renamed, since "owner" now means the creator), `findManagedBy` and
  `managesAny` (`GET /me` role summary, the user lookup gate), the resolver's
  `resolveKoskRole` and the parent-köşk branch of `resolveCourseRole`,
  `CourseService.findSummariesByKosk` (draft and archive visibility), and the
  calendar feed's "courses I manage" branch (MDRS-120).
- `POST /kosks` inserts the köşk and its creator as manager in one transaction.
- `POST /kosks/:id/managers/:userId` (`addKoskManager`, 201, idempotent) and
  `DELETE /kosks/:id/managers/:userId` (`removeKoskManager`, 200). Both return
  the köşk. Removing a user who is not a manager is 404
  `KOSK_MANAGER_NOT_FOUND`; removing the last one is 409 `KOSK_LAST_MANAGER`;
  adding someone with no `users` row (never signed in, MDRS-104) is 404
  `KOSK_MANAGER_UNKNOWN_USER`, so a mistyped id cannot become the manager
  that lets the last real one leave. User ids are stored lowercase.
- Both run in one transaction that locks the köşk row (`FOR NO KEY UPDATE`,
  which does not block foreign-key inserts under the köşk) and re-checks
  that the caller is still a manager (SYSTEM_ADMIN excepted) — the guard
  checked before a concurrent removal could take that away. Two managers
  removing each other at the same moment therefore cannot leave the köşk
  with none.
- `purge` (SYSTEM_ADMIN's delete, MDRS-124) deletes the köşk's managers
  explicitly and names them in the audit entry (`details.managers`).
- `KoskRepository.isManager` answers false for a non-UUID id instead of
  reaching Postgres with it (22P02); the old owner check compared in
  JavaScript and never did.
- `KoskResponse` gains `managerIds: string[]` (oldest first, never empty);
  `ownerId`'s description now says it is the creator. `KOSK_FORBIDDEN`'s
  message says "not a manager" instead of "not the owner".

**common**

- New scope `MANAGE_KOSK_MANAGERS`, on the köşk matrix's `KOSK_MANAGER` row
  only. Not `EDIT`: a nazır of the köşk's medrese holds `EDIT` (MDRS-106), and
  a nazır who could add themselves as a manager would become `KOSK_MANAGER` on
  the köşk's courses, which PRD §4.1 keeps from a nazır. SYSTEM_ADMIN passes
  through the realm bypass. A matrix test pins that no other row grants it.

**services** — spec and typed client regenerated (`pnpm run openapi:tedrisat`):
`KosksApi` gains the two operations and `KoskResponse` the field. Generated
files whose only change was the document-version header were left untouched,
as in MDRS-95/104/106.

**nizam-web** — not changed; see follow-up.

## What was verified

- `nx affected -t typecheck test build lint module-boundaries --base=75a1e58
  --skip-nx-cache`: exit 0 — common, env, icons, nizam-web, services,
  tedrisat, tedris-web, teskilat, tokens, ui, utils (targets as each defines
  them). tedrisat: 40 suites, 548 tests, 0 failures; common: 62 tests, 0
  failures (each from its `coverage/junit.xml` after the run). Run twice:
  before review (546 tedrisat tests) and after the review fixes (548).
- `test/e2e/kosk-managers.e2e.spec.ts` (real `AuthGuard`, minted tokens), the
  three acceptance criteria:
  - two managers can both manage: after the first adds the second, each can
    `PATCH` the köşk, read pending enrollments, see a draft course, and finds
    the köşk under `GET /me` `roles.manages`;
  - removing one leaves the other: the second removes the first, keeps
    editing, and the first gets 403; a manager may remove themselves while
    another remains;
  - the last manager cannot be removed: 409 `KOSK_LAST_MANAGER` for the
    manager themselves and for SYSTEM_ADMIN, and when the last two remove each
    other concurrently exactly one request succeeds, the other is 403, and one
    manager remains.
  - Also: a stranger and a nazır of the köşk's medrese get 403 (the nazır can
    still `PATCH`), SYSTEM_ADMIN may add, a user who never signed in is 404,
    an upper-case id is the same manager, a missing köşk is 404, a malformed
    user id 400.
- The existing "someone else's köşk" fixtures in `course.e2e.spec.ts` and
  `kosk.e2e.spec.ts` now give that köşk its manager row, so they still test a
  köşk another user manages rather than one nobody manages.
- `test/e2e/kosk-managers-migration.e2e.spec.ts`: applies 0000–0020, writes
  three köşks for two owners, runs 0021 — no köşk row changes, each owner is
  its köşk's only manager — then the rollback and 0021 again.
- `node tools/ci/assert-openapi-spec-fresh.mjs`: green (50 paths).

## What was not verified

- No browser check: there is no screen for this yet.
- The migration was not run against the development or production database.

## Follow-up

- Review findings left as they are: `added_by` takes the caller's `sub`
  unchecked, so a SYSTEM_ADMIN with a non-UUID `sub` would get a 500 — the
  same as `madrasahs.created_by` (MDRS-106); `assertManager` makes two
  parallel queries where one could do; `UUID_REGEX` now has a seventh copy
  (a shared `isUuid` helper would replace all of them).

- **nizam "Yöneticiler" list** in the köşk settings, with add and remove
  through the user picker (C12). nizam has no köşk settings page and no user
  picker on this branch; MDRS-107/108 build those screens, and the API they
  need is here (`addKoskManager`, `removeKoskManager`, `managerIds`).
- MDRS-107's `managerId` becomes a list and MDRS-108's `managedBy=me` joins
  `kosk_managers` — neither exists on this branch yet.
- `tools/ci/biome-baseline.json` could be lowered (the ratchet reports 75
  warnings against a baseline of 79); left for whoever owns the baseline.
