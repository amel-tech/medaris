# MDRS-203 — Who reads the talebe list and e-mails by default (the revisit stays the owner's)

Stacked on MDRS-136 (`taha/mdrs-136-open-scopes-with-their-admins`). MDRS-203 is the owner's own "revisit
later" item and he has not revisited it. This change therefore builds the default only: it changes no rule,
no endpoint, no permission code, no column, no screen, no copy and no generated file. It adds one e2e spec
that pins what is true today and this note, which records the standing rule, where the addresses leave the
API, and the plan if the owner flips the rule. MDRS-203 stays open. Every number below sits next to the
command that printed it; commands run from the repository root unless a `cd` says otherwise.

## The standing rule and where it comes from

- **d-1001-28 (1 October), the owner's answer** to "who sees the talebe list and the e-mails": options "ad
  listesi varsayılan, e-posta izinle ve denetimli" / "ikisi de izinle" / "ikisi de varsayılan"; he chose
  **"ikisi de varsayılan"** and said **"şimdilik böyle, sonra bakacağız"**. Course staff see the list and the
  addresses with no separate permission.
- **d-1003-09 (3 October), "Kayda alınsın"**: a roster read is written to `audit_log` like a content read;
  the course's own müderris and an enrolled talebe are not written, everyone else who may read is.

How the catalogue says it: `course.staff_read` is an implicit code. Whoever holds enrollment work in a course
(`enrollment.decide`, `enrollment.remove` or `enrollment.complete`, the `ROSTER_WORK` set in
`libs/common/src/authz/effective-permissions.ts`) holds it, and nothing else implies it (a grant of
`week.hide`, `ban.course` or `course.edit` opens details and content at most, never the roster).
`ROLE_DEFAULT_PERMISSIONS` gives all three codes to MUDERRIS, KOSK_NAZIM and MEDRESE_BASMUDERRIS, so those
roles read the roster with no grant; DERS_NAZIR has no defaults and reads it only through a grant of one of the
three. The screens say so (`account.defaultsNote.MUDERRIS`: "bu ayrı bir izin değildir").

One closure the default has: `course.staff_read` is content-flagged, so a **passive course** (every MUDERRIS
assignment of the course revoked: the engine's passive-scope rule) is closed by the engine to every reader but
the başnazım's realm bypass, **with one exception the reviewed MDRS-135 made (owner, 4 October): a köşk nazımı
keeps a passive course of their köşk open**. So the köşk nazımı still reads its roster (pinned in
`authz-engine.e2e.spec.ts`, "a passive course stays closed to its enrolled talebe ... and open to its köşk
nazımı", and in the spec of this change); the other readers' closure was not exercised here. The köşk-wide
pending list agrees with the roster for that reader, see "The köşk-wide pending list and a passive course".

## What changed

Only `apps/tedrisat/test/e2e/roster-contact.e2e.spec.ts`, new. No file under `apps/*/src` or `libs/*/src`.

## Behaviour changes

None. `git diff 377d4b6e --stat` shows the spec and this note.

## Where a talebe's e-mail leaves the API on this base

Where the address comes from differs per surface, so read the "Source" column before assuming a surface
carries only the enrolment snapshot (`enrollments.student_email`, taken at enrolment from the token, so it can
be null or stale). "Snapshot" is that column; "user row" is `users.email`.

| Route | Field | Source | Guard | Audit row today |
| --- | --- | --- | --- | --- |
| `GET /courses/:id/enrollments` | `studentEmail` | snapshot only | `course.staff_read` on the course | `course.roster_read`, via `enrollments` |
| `GET /courses/:id/enrollments/removed` | `email` | the snapshot the removal wrote into `audit_log`, then the user row | `course.staff_read` on the course | `course.roster_read`, via `removed` |
| `GET /kosks/:koskId/enrollments/pending` | `studentEmail` | snapshot only | `course.manage_all` on the köşk (köşk nazımı only; the başnazım is refused); **not closed by a passive course** | `course.roster_read` against the köşk, via `pending`, every read |
| `POST …/enrollments/:userId/approve`, `PATCH …/enrollments/:userId` | `studentEmail` of the row changed | snapshot only | `enrollment.decide` / `enrollment.complete` | none (a write by the team that already holds the work) |
| `GET /kosks/:id/dashboard` | `studentEmail` of pending applications | snapshot, then the user row (`coalesce(e.student_email, u.email)`) | `kosk.manage` or `platform.kosk_edit` | none |
| `GET /madrasahs/:id/dashboard` | `studentEmail` | snapshot, then the user row | `madrasah.students_view` | none |
| `GET /madrasahs/:id/students` | `email`; `q` also matches it (user row first, snapshot as fallback) | the user row, then the snapshot | `madrasah.students_view` | none |
| `GET /bans`, `GET /kosks/:koskId/bans`, `GET /madrasahs/:id/bans` | `email` | the user row, then the seat snapshot (the seat of the ban's course, then any seat of the user) | no `AuthzGuard` on the first two, decided in `BanAuthority`; the medrese route `madrasah.ban` or `platform.ban_scoped` | none |

### The köşk-wide pending list and a passive course

`GET /kosks/:koskId/enrollments/pending` resolves `course.manage_all` on the köşk (`listed([KOSK])`, no
`content` flag), so the engine does not look at the course's passive state, and
`CourseRepository.findPendingByKosk` filters on `koskId`, `archivedAt` and `status` only. Before the review of
MDRS-135 that disagreed with the roster, which a passive course closed to the köşk nazımı. The reviewed engine
keeps a passive course of their köşk open to the köşk nazımı, so the two now agree: the köşk nazımı reads the
course's names and e-mails from both, and the read is audited (`course.roster_read`, and the engine's
`scope.passive_open` on the roster). It is pinned in `roster-contact.e2e.spec.ts` ("keeps the roster and the
köşk-wide pending list open to the köşk nazımı, whose course it still is"). The pending list is still not
closed for anyone else, because only the köşk nazımı holds `course.manage_all` there.

`course.roster_read` is written by `CourseService.auditRosterRead` for four course routes and by `findPendingEnrollments` for the
köşk-wide list: five routes in all, three of them in the table (the stats and `badge-counts` routes write it
as summaries of the same list). `grep -n "auditRosterRead(" apps/tedrisat/src/course/course.controller.ts`
printed four calls (stats, enrollments, removed, badge-counts); the pending route's own `recordRosterRead` is
in `course.service.ts`.
The students list and the two dashboards write nothing on this base. MDRS-141 Phase 1 is planned to audit
them; it is not in this branch's history (`git log --oneline | grep 141` finds only unrelated older commits),
so when it merges, the dashboard and students rows of this table change and the "audit row today" column must be updated.
Out of scope here: `/users/lookup` and `GET /users?email=` (`user.lookup`, MDRS-206), the audit page
(`platform.audit_read`), and the köşk-application contact read (`kosk_application.contact_read`).

## What the new spec pins

`apps/tedrisat/test/e2e/roster-contact.e2e.spec.ts`, 21 tests, real Postgres, real guard, minted tokens. It
seeds three talebe in two courses (ENROLLED, PENDING, COMPLETED, each with a name and an address) and asserts
the exact strings, never `toBeDefined`.

| Criterion | Test | Fails without the rule |
| --- | --- | --- |
| A müderris reads every name and e-mail, requests included, and is not written | "the müderris reads every talebe's name and e-mail, requests included, and leaves no row" | yes, mutations 1 and 4 |
| A ders nazırı holding `enrollment.decide`, `.remove` or `.complete` alone reads the same, once on the record (`via enrollments`, `permission course.staff_read`) | three cases of "reads the same names and e-mails with X alone, on the record" | yes, mutations 1 and 7 |
| A ders nazırı with no grant, `week.hide` alone, `course.edit` alone or an expired enrollment grant gets 403, no name or address in the body, no row | four cases of "is refused with …" | yes, mutations 5 and 6 |
| A grant is held for its own course only | "holds the grant for its own course only" | yes, mutation 6 |
| An enrolled talebe and a stranger get 403 on the roster and the removed list; a talebe's course page carries their own seat's address and nobody else's | "refuses an enrolled talebe and a stranger, …" | yes, mutation 6 |
| The removed list gives the müderris and a ders nazırı holding `enrollment.remove` the removed talebe's address; `week.hide` alone is refused | three "GET …/enrollments/removed" tests | yes, mutations 2 and 7 |
| The köşk-wide pending list carries addresses for the köşk nazımı and refuses a müderris and a ders nazırı even with enrollment work | two "GET /kosks/:koskId/enrollments/pending" tests | yes, mutation 3 |
| A passive course stays open to the köşk nazımı on the roster and on the köşk-wide pending list (the reviewed engine rule) | "keeps the roster and the köşk-wide pending list open to the köşk nazımı, whose course it still is" | pins the reviewed rule: it fails if the engine closes the roster to them again |
| The köşk nazımı, a başmüderris of the course's medrese and the başnazım read the addresses, each on the record; a başmüderris is refused a course outside the medrese | four tests under "the köşk nazımı, the başmüderris and the başnazım" | yes, mutation 1 |

### Red-then-green

Each mutation was applied to the source on its own, the spec run, and the file restored with
`git checkout -- <file>` (the tree was clean afterwards). Output files under the wave scratch directory,
`mdrs-203-mut-<name>.out`. Spec green without any mutation: `Tests  21 passed (21)`. Mutations 1 to 7 were run when the spec had 20 tests and are not re-run; their failure counts are of 20.

| # | Mutation | Result |
| - | - | - |
| 1 | `CourseService.findEnrollments` adds `studentEmail: null` to each row | `Tests  7 failed | 13 passed (20)`: the müderris test, the three `enrollment.*` cases, the köşk nazımı, the başmüderris and the başnazım |
| 2 | `findRemovedEnrollments` returns `email: null` | `Tests  2 failed | 18 passed (20)`: the müderris and the `enrollment.remove` ders nazırı reads of the removed list |
| 3 | `findPendingByKosk` selects `null` for `studentEmail` | `Tests  1 failed | 19 passed (20)`: the köşk nazımı pending list |
| 4 | `readerIsAudited` returns true for the müderris | `Tests  1 failed | 19 passed (20)`: the müderris leaves no row |
| 5 | `grantHeld()` accepts a grant that ended up to a day ago | `Tests  1 failed | 19 passed (20)`: the expired-grant refusal |
| 6 | `rosterWork` is true for any held code (libs/common rebuilt, then rebuilt again after restoring) | `Tests  8 failed | 12 passed (20)`: the no-grant, `week.hide`, `course.edit`, expired, own-course-only, talebe/stranger, removed `week.hide` and başmüderris-outside refusals |
| 7 | `ENROLLMENT_REMOVE` taken out of `ROSTER_WORK` (libs/common rebuilt) | `Tests  2 failed | 18 passed (20)`: the `enrollment.remove` alone case and the removed-list read |


The refusal cases for a talebe, a stranger and the başmüderris outside the medrese ride on the same
engine mutation (7) because a guard mutation specific to them would only restate it.

## Decided by default, owner may overrule

These are the dossier's open decisions with the default taken (none is built):

1. **Do the e-mails stay a default for course staff, or become a catalogue permission with every read
   audited?** Default: they stay a default (option "ikisi de varsayılan", the owner's own answer twice).
   Recommended for the same reason: since #177 every non-müderris roster read is already audited, which was the
   KVKK worry behind the permission option, and staff need the address to contact their talebe.
2. **Does the talebe list itself change?** Default: no.
3. **If e-mails become a permission, who holds it without a grant?** Default: the role defaults of müderris,
   köşk nazımı and başmüderris like every course-scoped code, so a ders nazırı and a medrese nazırı need a grant.
   Note: the issue's "a müderris without the permission gets the list without e-mails" cannot happen under
   this, because the role default is computed from the scope tag and every course-scoped code lands in the
   müderris default; the natural "without" case is the ders nazırı.
4. **Is the müderris's own read audited under the permission rule?** Default: the exemption stays (d-1003-09).
5. **Should the medrese students list, the two dashboards and the ban lists be audited like the roster?**
   Default: no change here; it is MDRS-141's question (see the table).

6. **Does the köşk-wide pending list close on a passive course?** Settled by the reviewed engine: a köşk nazımı
   keeps a passive course of their köşk open, so no.

The Linear comment the planner asked for (quote d-1001-28 and d-1003-09 on MDRS-203 and say the revisit is
open) was not posted: the wave rules forbid writing to Linear. The text for the coordinator is in the PR
description.

## If the owner flips the rule (not built)

Size M, and it needs decisions 1 to 4 first. In order:

1. **Catalogue** (`libs/common/src/authz/permissions.ts`): one new course-scoped code, content-flagged so it
   closes on a passive scope, picked up by the müderris, köşk nazımı and başmüderris defaults by tag. It must
   be consumed by a handler in the same PR (MDRS-208), and the hand-frozen row and counts in
   `libs/common/test/authz/catalogue-golden.spec.ts` change with it, as do the pinned counts in the
   nizam/nazir/tedris/tedrisat specs; `COURSE_CATALOG` in `apps/tedrisat/src/assignment/permission-catalog.ts`
   and `PERMISSION_META` carry it.
2. **Engine unit tests** in `libs/common/test/authz/effective-permissions.spec.ts`: defaults, a ders nazırı with
   `enrollment.decide` alone does not hold it (and still reads the list), with the grant does, expired does not.
3. **API**: decide the permission once per request in the roster, removed, pending and approve/PATCH handlers
   and map `studentEmail` / `email` to null in `CourseService` when it is not held. Also the other routes in
   the table above, or record them as deliberately out, and drop the `q` match on the address for a caller
   without it (`madrasah-portal.repository.ts`, `ban.repository.ts`), and decide the user row too, since the
   students list and the ban lists lead with `users.email` rather than the snapshot, otherwise the search is an oracle for
   the hidden address.
4. **Audit**: keep `course.roster_read`, add whether addresses were returned to `details`; if decision 4 says
   audit the müderris too, take the müderris short-circuit out of `readerIsAudited` for these routes only. The
   row must stay awaited before the read (the failure tests in `roster-read-audit.e2e.spec.ts` stay green).
5. **Contract and generated files**: describe the null in the DTO fields, regenerate the spec and the client in
   their own last commit; the route inventory should not change (`course.staff_read` stays the route guard).
6. **Screens and copy**: the nizam roster and pending list must tell "hidden" from "no address on file" (today
   both render nothing), tr/en/ar keys for the new code in the three account maps, and reword
   `defaultsNote.MUDERRIS`, whose "bu ayrı bir izin değildir" stops being true for a ders nazırı.
7. **e2e**: this spec flipped: the müderris sees addresses; a ders nazırı with `enrollment.decide` gets the list
   with null addresses and, after a grant, the addresses; every address read has an audit row.
8. **No migration**: permission codes are `text` in `permission_grants` and `permission_group_items`.

## Not verified

- Anything past the API: the nizam and nazir screens that print the address column were not run (Playwright
  needs a running stack).
- `GET /madrasahs/:id/students`, the two dashboards and the ban lists were read, not exercised by this spec;
  the table lists their guards and address sources from the source.
- The expiry refusal is proven with a grant already past its end, read by the loader's `grantHeld()` filter;
  the 2-second live-expiry case is `authz-engine.e2e.spec.ts`'s.
