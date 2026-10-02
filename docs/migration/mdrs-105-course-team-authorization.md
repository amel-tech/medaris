# MDRS-105 — the course team works from the matrix, and müderris are accounts

## Problem

Every write to a course went through `CourseService.assertCourseOwner`, which
narrowed it to the parent köşk's manager. The matrix already gave MUDERRIS
`EDIT` and `MANAGE_ENROLLMENTS`, so the guard let a müderris through and the
service refused them. `course.e2e.spec.ts` pinned that mismatch (MDRS-43 AC-6).
The müderris themselves could not be chosen either: nizam took a free-text
name, `course_muderris.user_id` stayed empty, and MUDERRIS could only be
reached by a direct insert.

The owner's decisions of 1 October, recorded in the task notes:

- Only the course team marks a course COMPLETED. The talebe cannot do it
  through `PUT /courses/:id/progress`.
- Removing a talebe is its own action, needs a reason, and is not a ban. The
  talebe may apply again.
- A talebe may withdraw a pending request and may leave a course.

## What changed

### `apps/tedrisat`

**Authorization.** `assertCourseOwner` is gone. The matrix decides everything
below, and the matrix itself did not change.

| Action | Scope | Who |
| -- | -- | -- |
| `PATCH /courses/:id`, `PUT /courses/:id`, the MDRS-95/109 session routes | `EDIT` | köşk manager, müderris |
| The müderris list inside `PUT /courses/:id` | `ASSIGN_MUDERRIS` | köşk manager |
| Roster, approve, reject, complete/reopen, remove | `MANAGE_ENROLLMENTS` | köşk manager, müderris |

SYSTEM_ADMIN bypasses all of these through the realm role, as before.

**Müderris list (`CourseService.replace`).**
- `domain/muderris-list.ts` compares the payload against the stored rows the
  same way the replace would write them: same ids at the same positions, and
  no field the payload carries (`userId`, `name`, `title`, `bio`,
  `avatarHue`) differs from what is stored. Fields the payload leaves out are
  not compared, because the replace does not write them.
- Any difference from a caller without `ASSIGN_MUDERRIS` gets
  `403 MUDERRIS_ASSIGNMENT_FORBIDDEN` before anything is written, so a
  müderris's whole save is refused. An unchanged list saves.
- Links are checked on create and on replace:
  - the same account twice → `400 MUDERRIS_DUPLICATE_USER`;
  - an account with no `users` row (never signed in) →
    `404 MUDERRIS_UNKNOWN_USER`, the same rule MDRS-126 applies to köşk
    managers;
  - an account the course already linked is not re-checked, so old rows keep
    saving.
- No schema change: `course_muderris.user_id` has existed, nullable, since
  migration 0008. Name-only rows stay as they are and grant nothing. No
  drizzle migration was needed, so none was written.
- The detail reads and `findMuderris` both order by `(order_index, id)`. Two
  rows sharing an index therefore come back in the same order from both, and
  an untouched list never reads as reordered. This was a review finding.

**Visibility for the people who now edit.**
- A DRAFT course is visible to holders of `EDIT`: the köşk manager, the
  course's müderrisler and SYSTEM_ADMIN. Before, only the köşk manager could
  see it, and a müderris could not open the draft they were editing.
  `course.e2e.spec.ts`'s MDRS-103 DRAFT test was changed to match.
- `update` and `replace` first check that the caller can see the course. A
  müderris holds `EDIT` but not `ARCHIVE`, so a write to a hidden course is a
  404 before anything is written. Before this check, the write went through
  and the answer was a 404.

**Enrollments.**
- `GET /courses/:id/enrollments`: the roster, sorted requests first, then
  active seats, then completions (Postgres enum order).
- `PATCH /courses/:id/enrollments/:userId` `{status: ENROLLED|COMPLETED}`:
  complete or reopen. A pending request → `409 ENROLLMENT_STATE_CONFLICT`
  (approve it instead).
- `POST /courses/:id/enrollments/:userId/remove` `{reason}`:
  - works on ENROLLED only; a request or a completion → 409;
  - the reason is required, not blank, and at most 500 characters;
  - the row is deleted and an `enrollment.remove` row is written to
    `audit_log` (actor, `userId`, reason, previous status, progress,
    enrolled-at) in one transaction;
  - not a ban: the talebe may enroll again.
- Approve now only promotes PENDING. Approving ENROLLED is a no-op. Approving
  COMPLETED → 409, because approve used to demote a completion silently, and
  every müderris can approve now.
- `DELETE /courses/:id/enrollment`: the caller withdraws a pending request or
  leaves an active course. A completion → 409. No enrollment → 404. It is
  authorized with `VIEW`, which every course role holds; `ENROLL` is on
  PUBLIC only.
- `PUT /courses/:id/progress` records progress only:
  - reaching 100 no longer sets COMPLETED;
  - a COMPLETED status set by the team survives later progress writes;
  - a `status` other than the current one → `403 ENROLLMENT_STATUS_FORBIDDEN`;
  - the `status` field is marked deprecated in the spec.

**Contract.** Four routes and three schemas are new
(`RemoveEnrollmentDto`, `SetEnrollmentStatusDto`,
`TeamSettableEnrollmentStatus`). The spec and client were regenerated with
`pnpm run openapi:tedrisat`. As in MDRS-95 and MDRS-103, generated files
whose only change was the document-version header were left out.

### `libs/services`

`createTedrisatAPIs` now returns `users` (`UsersApi`, MDRS-104). It also
re-exports `MeResponse`, `UserSummaryResponse`, `RemoveEnrollmentDto`,
`SetEnrollmentStatusDto` and `TeamSettableEnrollmentStatus`.

### `apps/nizam`

- **Müderris picker** (`muderris-picker.tsx`):
  - new rows come only from an exact e-mail lookup (`GET /users?email=`);
  - a picked row is saved with its `userId` and shows "Hesaba bağlı";
  - legacy rows are still listed, with "Yalnız isim" and their name editable.
- **Who may change the list.** The edit page decides with `mayAssignMuderris`
  (`course-team.ts`): `GET /me` `roles.systemAdmin`, or `roles.manages`
  containing the course's köşk. For anyone else (a müderris) the list is
  read-only and a note says the köşk manager changes it.
- **Error messages.** API refusals map to `nizam.CourseTeam.*` messages.
- **Roster** (`/kosks/:id/courses/:courseId/students`, linked from the editor
  header):
  - a table of every enrollment;
  - approve/reject for requests, complete/remove for seats, reopen for
    completions;
  - the remove dialog requires a reason.
  - It is built from the `design-system/` mirror rules: hairline table, the
    row action always visible, `Field`-style label/help/error wiring, and the
    status badges. No drawing exists for it.

### `apps/tedris`

The course page now has two new controls:

- "Başvuruyu geri çek" under a pending request. It needs no confirmation,
  because nothing is lost.
- "Dersten ayrıl" for an active seat, with a confirmation, because progress is
  deleted.

There is no leave control on a completed course.

### `libs/i18n`

- `nizam.CourseTeam.*`: 52 keys.
- `tedris.CoursePage.*`: 7 new keys.
- Both are in tr, en and ar.

## What was verified

Every gate used the prefix
`env -u NODE_ENV -u DB_PORT -u POSTGRES_DB -u POSTGRES_USER -u POSTGRES_PASSWORD -u DATABASE_URL pnpm nx run-many -t <target> --skip-nx-cache`.

| Gate | Result |
| -- | -- |
| typecheck | 17 projects green |
| lint | 17 projects green |
| module-boundaries | 17 projects green |
| build | 8 projects green |
| test | 9 projects, 81 files, 1359 tests green. tedrisat: 47 files / 690 tests (Docker Testcontainers). nizam-web: 4 / 20. tedris-web: 6 / 37. Counts are from each project's `coverage/junit.xml`. |
| `tools/ci/biome-ratchet.mjs` | warnings 75 / infos 24, equal to baseline |
| `tools/ci/assert-openapi-spec-fresh.mjs` | 55 paths, identical |

- **`test/e2e/course-team.e2e.spec.ts`** (new). It runs the real `AuthGuard`
  with minted tokens, one identity per role. It covers:
  - the müderris edits fields, the whole course with an unchanged list,
    sessions and the draft;
  - the müderris is refused (and nothing is written) when the save adds,
    drops, reorders or renames a müderris, or links an account to a row;
  - the manager links a signed-in account, the linked person then edits and
    sees the roster, and removing the row removes the role;
  - unknown and duplicate accounts are refused, on create too;
  - a hidden course refuses the müderris's PATCH and PUT, and its version is
    unchanged;
  - an index tie saves;
  - the roster, approve, reject, complete/reopen and remove (with its audit
    row and re-enroll) all work, and their refusals are covered;
  - for the talebe: progress at 100 stays ENROLLED, `status` is refused,
    withdraw, leave, and leaving a completion is refused.
- **Mutation check.** With the `ASSIGN_MUDERRIS` comparison and the status
  check disabled, 7 of its tests fail.
- **`course.e2e.spec.ts`.** The old negative ("refuses a müderris … though the
  matrix grants EDIT") is now a positive. "completing at 100%" now asserts
  that it does not complete.
- **Unit tests.** `test/unit/course/muderris-list.spec.ts` covers the
  comparison, newly linked ids and duplicates. `apps/nizam/test/course-team.spec.ts`
  covers who may assign, the display name, the error-key mapping (every key
  present in tr/en/ar), the roster actions and catalogue parity.
- **Reviews.**
  - `/code-review` (medium) found 1 issue, the order tie-break. It was fixed
    and is covered by a test.
  - The security review was done by hand on the worktree diff, because the
    skill sees the main checkout's empty diff. No high-confidence issue was
    found.

## What was not verified

- **No browser run.** Nothing was seen in a browser and no dev server was run
  against a live Keycloak. That covers the nizam picker, the roster page and
  the tedris withdraw/leave controls. They typecheck, build and lint, and the
  pure parts are unit-tested.
- **Production data.** It was not checked how many production rows have a
  non-null `course_muderris.user_id`, or whether any of them points at an
  account without a `users` row. Such a row still saves, because only new
  links are checked.
- **Translations.** The ar and en strings were written without native-speaker
  review.

## Follow-ups

- **Ban (MDRS-113).** Removal deletes the seat and nothing stops
  re-enrolment, by decision. When bans land:
  - `enroll` must refuse a banned caller;
  - the resolver must place a banned caller below `VIEW_DETAILS` (as
    MDRS-103 already notes);
  - "remove and ban" can become an option on the remove dialog. The
    `enrollment.remove` audit row is where a ban would point.
- **Hidden courses and enrollment actions.** The müderris still reaches the
  roster and the enrollment actions of a course the köşk manager has hidden,
  because the session routes (MDRS-95/109) authorize on `EDIT` alone. Only
  PATCH and PUT check visibility first. Decide whether a hidden course
  freezes its team.
- **No entry point for a müderris in nizam.** A müderris has no route into
  their own courses: the köşk page lists DRAFT courses for managers only, and
  `GET /me` `teaches` is not used by nizam yet.
- **The köşk-level pending list.** `GET /kosks/:id/enrollments/pending`
  stays köşk-manager-only (`MANAGE_COURSES` on the köşk). A müderris works
  from the course roster instead.
- **Privacy notice (MDRS-102).** The removal reason is free text in
  `audit_log`, and the roster shows each talebe's e-mail to the course's
  müderrisler. The notice should list both.
- **`PUT /courses/:id/progress` `status`.** It is deprecated and refused
  unless unchanged. Drop it from the DTO once no caller sends it. tedris
  already sends only `progress`.
- **Out-of-date counts in `CLAUDE.md`.** It still says tedrisat has 45 suites,
  23 of them e2e. It now has 47 and 24. `README.md` was updated; `CLAUDE.md`
  was left for the owner.

## Role model v2 hook (MDRS-134/135/142)

Three places read today's roles and will move to v2:

| Place | Today | v2 |
| -- | -- | -- |
| `CourseService.replace` | `ASSIGN_MUDERRIS` | MDRS-135's müderris-assignment permission |
| `CourseService.getDetail` DRAFT rule | `EDIT` | MDRS-135's content-edit permission |
| nizam `mayAssignMuderris` | `GET /me` `roles` (`manages`, `systemAdmin`) | the effective permissions `GET /me` will return (MDRS-142) |

The imam and ders-nazırı roles are not modelled here.
