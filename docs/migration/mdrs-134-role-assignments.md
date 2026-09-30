# MDRS-134 — Role assignments, the course → medrese link, and hosting rights

Role model v2 (MDRS-133), data layer. Built on PR #99 (MDRS-78 launch wave 1,
including MDRS-104/106/126) and migrates what it created.

## What was done

**Schema (tedrisat)** — `src/database/schema/role-assignment.schema.ts`

- `role_assignments(id, user_id, role, scope_type, scope_id, is_imam,
  granted_by, created_at, expires_at, revoked_at, revoked_by)`.
  - `role` is the enum `assigned_role`: `MEDARIS_NAZIM`, `KOSK_NAZIM`,
    `MEDRESE_BASMUDERRIS`, `MEDRESE_NAZIR`, `MUDERRIS`, `DERS_NAZIR`.
    `scope_type` is the enum `scope_type`: `platform`, `kosk`, `madrasah`,
    `course` — named for reuse by MDRS-135's `permission_grants`. The
    başnazım stays the Keycloak `SYSTEM_ADMIN` realm role.
  - Check constraints: each role only in its own kind of scope
    (`role_assignments_scope_matches_role`), `scope_id` null exactly for the
    platform, `is_imam` only on `MUDERRIS`, `revoked_at`/`revoked_by` set
    together.
  - Partial unique indexes: one held row per (user, role, scope)
    (`revoked_at is null`; a second index for the platform, where `scope_id`
    is null), and **one imam per course**
    (`role_assignments_one_imam_per_course_idx` on `scope_id` where
    `is_imam and revoked_at is null`).
  - `scope_id`, `user_id`, `granted_by`, `revoked_by` are not foreign keys:
    `scope_id` points at three different tables, and users rows are written
    lazily (MDRS-104).
- `madrasah_kosk_hosting(id, madrasah_id, kosk_id, granted_by, created_at,
  revoked_at, revoked_by)`; both ends `ON DELETE CASCADE`; one held row per
  pair (partial unique index). The issue lists no `id`: a surrogate key was
  added because revoked rows stay as history, so the pair cannot be the key.
  MDRS-137 builds the grant/revoke flows.
- `courses.madrasah_id` (nullable, → `madrasahs.id` `ON DELETE SET NULL`:
  deleting a medrese leaves its courses as köşk courses, as it used to leave
  its köşks standalone).
- `passive_since timestamptz`, `passive_reason text` on `courses`, `kosks`
  and `madrasahs`. Separate from hiding (`courses.archived_at`, MDRS-124).
  Nothing sets or reads them yet (MDRS-136).
- Dropped: `kosk_managers`, `madrasah_nazirs`, `kosks.madrasah_id`.
  `course_muderris` stays unchanged — it is what the course page shows.

**Migrations** — three, so that nothing generated was edited by hand:

| File | How made | What |
| -- | -- | -- |
| `0022_role_assignments.sql` | `drizzle-kit generate` | new enums, tables, columns, indexes |
| `0023_role_assignments_data.sql` | `drizzle-kit generate --custom`, then written | the data move and the review print |
| `0024_drop_superseded_role_tables.sql` | `drizzle-kit generate` | drops the old tables and column |

0023 moves:

- `kosk_managers` → `KOSK_NAZIM` (`granted_by` = `added_by`, `created_at` kept);
- `madrasah_nazirs` → `MEDRESE_BASMUDERRIS` (`granted_by` = the medrese's
  `created_by`: the old table never recorded who added a nazır);
- `course_muderris` rows with a `user_id` → one `MUDERRIS` per (course,
  account) — an account listed twice gets one row — and the account with the
  lowest `order_index` is the imam (ties by row id). `granted_by` = the
  course's `author_id`, `created_at` = the course's: `course_muderris`
  records neither;
- `kosks.madrasah_id` → a `madrasah_kosk_hosting` row for the same pair
  (`granted_by` = the medrese's `created_by`, unknown otherwise).

Naive timestamps are converted with `AT TIME ZONE 'UTC'` both ways, so the
round trip is exact whatever the session time zone.

**The affiliated köşks' courses are not moved into the medrese.** 0023 prints
each one with `RAISE NOTICE` (`MDRS-134 review: course <id> "<title>" of köşk
"<name>", formerly affiliated with medrese <handle>, belongs to no medrese`)
and a closing count. `DatabaseService` now hands every `RAISE NOTICE`
(SQLSTATE `00000`) to the log at WARN, so the boot-time migrator's run puts
the list in the application log. Until a hosting right is revoked, the list
can be read again with:

```sql
select m.handle, k.name, c.id, c.title
  from madrasah_kosk_hosting h
  join madrasahs m on m.id = h.madrasah_id
  join kosks k on k.id = h.kosk_id
  join courses c on c.kosk_id = k.id
 where h.revoked_at is null and c.madrasah_id is null
 order by m.handle, k.name, c.title;
```

**Rollbacks** — `src/database/rollbacks/0024…`, `0023…`, `0022….down.sql`,
run in that order, then delete the three rows from
`"drizzle"."__drizzle_migrations"`. 0024's re-creates the old tables and
column empty with their original constraint names; 0023's moves held
`KOSK_NAZIM`/`MEDRESE_BASMUDERRIS` rows and one hosting right per köşk (the
oldest) back and empties the v2 tables; 0022's drops the rest. v2-only data
(revoked/expired rows, `MEDARIS_NAZIM`, `MEDRESE_NAZIR`, `DERS_NAZIR`,
a köşk's second hosting right, `courses.madrasah_id`, passive marks) is lost
on rollback.

**Code that read the old tables now reads `role_assignments`**

- Held means `revoked_at is null and (expires_at is null or expires_at > now())`,
  written once in `src/database/role-assignments.ts` (`isHeld`, `holdsIn`,
  `holderIdsOf`, `grantRole`, `revokeRole`, `deleteAssignmentsIn`,
  `syncMuderrisAssignments`). Expiry is checked at query time.
- Köşk managers (`KoskRepository`: `isManager`, `findManagedBy`,
  `managesAny`, `create`, `addManager`, `removeManager`, `purge`,
  `managerIds`) → `KOSK_NAZIM`. Removing a manager **revokes** the row in the
  remover's name instead of deleting it; adding them again opens a new row.
  Granting over a row that lapsed by `expires_at` revokes the lapsed row first.
- Medrese "nazırs" (`MadrasahRepository`, `MadrasahService`) →
  `MEDRESE_BASMUDERRIS`; the invite/remove endpoints record the caller as
  granter/revoker. The API keeps the word "nazır" until MDRS-144.
- Müderris authorization (`CourseRepository.isMuderris`, `findTaughtBy`,
  the calendar feed) → `MUDERRIS`. Course create and the whole-course PUT
  call `syncMuderrisAssignments` in the same transaction: bound accounts
  gain a row, dropped ones are revoked, the imam stays while still listed,
  and a course left without one gets the first listed account. Choosing the
  imam deliberately is MDRS-136.
- SYSTEM_ADMIN's real deletes remove the scope's role rows explicitly (köşk
  purge, course purge, medrese delete); hosting rows cascade.
- `MadrasahRepository.findTalebeIds` is the derived medrese talebe (§7):
  distinct users with an ENROLLED or COMPLETED enrollment in a course whose
  `madrasah_id` is the medrese. Nothing stores it.

**Affiliation removed**

- `resolveKoskRole` has no `MADRASAH_NAZIR` path; `MadrasahService.isNazirOfKosk`
  is gone; `MATRIX.kosk` has no `MADRASAH_NAZIR` row (libs/common).
- Endpoints removed: `POST`/`DELETE /madrasahs/:id/kosks/:koskId`
  (`affiliateMadrasahKosk`, `detachMadrasahKosk`) and
  `DELETE /kosks/:id/madrasah` (`leaveMadrasah`), with their errors
  `KOSK_ALREADY_AFFILIATED` and `KOSK_NOT_AFFILIATED`. `KoskResponse` loses
  `madrasahId` and `madrasah`. No web app called them (only the generated
  client). The OpenAPI spec and client were regenerated with
  `OPENAPI_EXPORT_ALLOW_PATH_REMOVALS=1`; the client diff also carries the
  document version header (`0.1.5` → `0.2.0`), which the committed client
  had not caught up with.
- `SCOPES.MANAGE_KOSK` stays on the medrese nazır row of the matrix but now
  guards no route; MDRS-135 replaces the matrix.

## Acceptance criteria → tests

Red proofs: each implementation file was copied to the job's tmp directory,
replaced, the test run, and the file copied back (no `git stash`). Script:
`/home/gedikas/.claude/jobs/c4f8e566/tmp/mdrs134-red.sh`.

| AC | test file:line | kind | red proof |
| -- | -- | -- | -- |
| Every former köşk manager is a `KOSK_NAZIM`, every former medrese nazır a `MEDRESE_BASMUDERRIS` | `apps/tedrisat/test/e2e/role-assignments-migration.e2e.spec.ts:275` | e2e (migration files on seeded 0021 data) | 0023 replaced by `SELECT 1;` → red; new migrations deleted and journal from the integration branch → suite red. Restored → green |
| Every bound müderris a `MUDERRIS`, exactly one imam per course that has one | `role-assignments-migration.e2e.spec.ts:306` | e2e | 0023 emptied → red. Restored → green |
| (runtime) the course's müderris list keeps `MUDERRIS` and the imam in step | `apps/tedrisat/test/e2e/muderris-assignments.e2e.spec.ts:98,120,142,160,189` | e2e (HTTP) | `course.repository.ts` from the integration branch → 4 red. Restored → green |
| A köşk affiliated before has a hosting right after, and no `kosks.madrasah_id` column remains | `role-assignments-migration.e2e.spec.ts:343` (and `:364` for the review print and no course moved) | e2e | 0023 emptied → red. Restored → green |
| (runtime) the medrese gets nothing on a köşk it is hosted in | `apps/tedrisat/test/e2e/madrasah.e2e.spec.ts:342`, `kosk-managers.e2e.spec.ts:303`, `test/unit/authz/tedrisat-role-resolver.spec.ts` ("gives a medrese's nazır nothing but PUBLIC on a köşk") | e2e + unit | resolver from the integration branch → unit red. Restored → green |
| A second imam for the same course is refused by the database | `role-assignments-migration.e2e.spec.ts:392` | e2e (asserts 23505 on `role_assignments_one_imam_per_course_idx`) | the index statement removed from 0022 → red, the other five green. Restored → green |
| Applying and reverting on production-shaped data leaves the schema and row counts identical | `role-assignments-migration.e2e.spec.ts:440` | e2e (columns, constraints, indexes, enum types, per-table counts and every row compared with the pre-0022 snapshot; then applied again) | the `UPDATE "kosks"` statement removed from `0023….down.sql` → red, the other five green. Restored → green |

"Production-shaped" here is the shape, not the volume, of production after
PR #99: 3 medreses (two nazırs, one, none), 24 köşks with one or two
managers, 3 of them affiliated (two with the same medrese), 96 courses with no
müderris / only unbound ones / a bound one behind an unbound one / the same
account listed twice, hidden and draft courses, and enrollments in all three
states. It was **not** run against a copy of the production database; that
rehearsal needs production access and is left to whoever deploys.

## Coverage

Measured with `vitest run --coverage` (v8) over the whole tedrisat suite,
then intersected with the lines this branch adds or changes
(`git diff -U0` against `origin/argedikas/medaris-team-wave-b`). Every added
or changed statement, branch and function is covered. Changed files also
carry older lines that were uncovered before this branch and are untouched by
it; they are not counted here. Excluded by the existing config and so not
measured: `src/**/index.ts`, `src/**/dto/**`.

## Review (code-review skill, medium)

- `MadrasahRepository.addNazir` granted without locking the medrese, so a
  grant racing SYSTEM_ADMIN's delete could leave a role in a medrese that is
  gone (`scope_id` has no foreign key) and break 0023's rollback. **Fixed:**
  the medrese row is locked `FOR NO KEY UPDATE` and read first; a missing one
  is 404. Test: `madrasah.e2e.spec.ts` ("answers 404 when SYSTEM_ADMIN
  deletes a medrese that does not exist, and removes no role row").
- `syncMuderrisAssignments` counted a lapsed imam as still imam, which would
  leave a course without one once anything sets `expires_at` (MDRS-135).
  **Fixed:** lapsed MUDERRIS rows of the course are revoked first. Test:
  `muderris-assignments.e2e.spec.ts:160`.

## Gate (this branch, 30 Sep 2026)

typecheck 17 projects, test 9 projects (tedrisat 47 files / 604 tests,
common 6 / 62), build 8 projects, lint 17, module-boundaries 17 — all green.
`assert-release-config`, `assert-openapi-spec-fresh` (50 paths) and
`biome-ratchet` (75 warnings, baseline 75) green.

## Not done here (by design)

- Granting, revoking and listing hosting rights: MDRS-137.
- Opening scopes with their admins, choosing the imam, adopting or dropping
  a removed admin's grants, making scopes passive: MDRS-136.
- The permission catalogue and effective-permission engine: MDRS-135.
- Renaming the API's "nazır" / `KOSK_MANAGER` / `MADRASAH_NAZIR`: MDRS-144.
