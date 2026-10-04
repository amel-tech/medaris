# MDRS-136 (part A) — Open scopes together with their admins

Stacked on MDRS-142 (`taha/mdrs-142-me-effective-permissions`, tip `7533d432`), which carries MDRS-135 (#177),
MDRS-205 (#197) and the earlier waves of the role-model v2 effort. This is the part of MDRS-136 that needs no
migration: how a köşk and a course are opened, who changes a köşk's nazımları, and what a whole-course save may
do to a team. The rest of the issue is not built here (see "What is NOT done"). Every number below sits next to
the command that printed it; commands run from `apps/tedrisat` unless a `cd` says otherwise.

## What changed

1. **A köşk is opened together with its nazımları, and the caller is never one of them.**
   `POST /kosks` takes `managerUserIds` (at least one, no duplicates). The branch that made the caller the
   köşk's first nazım when the list was left out is gone, with `KoskService.create` and `KoskRepository.create`
   (no other caller). A Medaris nazımı holding `platform.kosk_create` used to become the köşk's nazımı by
   omitting the list, which `SelfGrantGuard` never saw (it sat inside `if (managerUserIds)`); now the guard runs
   on every call, `always: true`. `kosks.owner_id` stays the caller.
2. **A course of the köşk's own is opened together with its müderrisler and one imam.**
   `POST /kosks/:koskId/courses` needs at least one müderris with an account (`userId`) and takes an optional
   `imamUserId`, one of those accounts (400 `COURSE_IMAM_NOT_LISTED`), the account listed first when absent.
   `CourseService.create` no longer calls `KoskService.assertManager` (a role check on top of the route's
   `course.open_standalone`), so the başnazım opens a course in any köşk, as the route's realm bypass always
   promised; it keeps the 404 for a köşk that does not exist. A Medaris nazımı still cannot (decision D2 below).
   With the service check gone, the route's permission was the only one left, so `CourseController.create` now
   asks `SelfGrantGuard` (MUDERRIS role, köşk scope) about every account in `muderris` and `imamUserId`: a
   grantee of `course.open_standalone` opens a course for others, not for themselves (403 `SELF_GRANT_REFUSED`,
   audited, nothing written), as `MadrasahCourseController.open` already did. The köşk nazımı holds every
   MUDERRIS code in the köşk and passes; the başnazım is not asked. The same hole on an existing course
   (`PUT /courses/:id/muderris`, the müderris branch of `PUT /courses/:id`) is recorded, not closed: see
   "Decided by default" 8.
3. **Köşk nazımları are changed by `platform.kosk_nazim_manage`, not by being a nazım** (owner decision
   d-1004-12, "role göre değil, yetkiye göre"). `POST|DELETE /kosks/:id/managers/:userId` ask that one code
   (the başnazım passes by the realm bypass). The köşk nazımı does not hold it by `ROLE_DEFAULT_PERMISSIONS`
   (it is tagged for the platform scope only) and no role exception was added, so a nazım no longer adds a
   peer, removes one or resigns. The repository's "actor must be a manager of the köşk" check and
   `IManagerActor.bypass` are gone.
4. **The last nazım leaves only with a successor** (owner decision d-1004-13: never leave a scope with nobody
   by accident, the başnazım takes the seat when it cannot be replaced). `DELETE …/managers/:userId` takes
   `successorUserId`: under the köşk lock the successor is seated (a known account, one `kosk.nazim.add` row)
   and then the nazım is revoked (`kosk.nazim.remove` with `details.successorUserId`). Without it the last
   nazım is still refused with 409 `KOSK_LAST_MANAGER` (message updated). The başnazım names themselves to take
   the seat; a Medaris nazımı naming themselves is refused by `SelfGrantGuard` (not `always`, like the add
   route), and the successor being the nazım removed is 400 `KOSK_SUCCESSOR_INVALID`.
5. **A whole-course save never empties the team.** `PUT /courses/:id` with `muderris` left out keeps the team as
   it is (it used to delete everyone and revoke their MUDERRIS rows); with a list that would leave the course
   with no müderris who has an account it is refused, 400 `MUDERRIS_LIST_INVALID`, before anything is written.
   A payload row that names a stored row by `id` and leaves `userId` out keeps the stored account, as the
   repository always did; a row that carries `userId: null` is counted as unbound, because the repository writes
   the NULL (an earlier version of the guard counted it as the stored account, so such a save passed the guard,
   unbound the last müderris and left the course passive with 200). `ReplaceCourseDto` is now `OmitType(CreateCourseDto, ["muderris", "imamUserId"])`
   plus an optional `muderris`; `UpdateCourseDto` also omits `imamUserId`.
6. **A whole-course save that hides a week or a session needs `week.hide`** (403 `WEEK_HIDE_FORBIDDEN`, checked
   against the stored syllabus before any write). The save already hid every week and session its payload
   leaves out; the müderris and the köşk nazımı hold the code by role default, so only someone holding
   `course.edit` without it (a grant) is refused. See "Decided by default" for the status of this rule.
7. **A refused self-seat on the opening routes answered 500, not 403** (found by the new spec). `SelfGrantGuard`
   audits the refusal with the resource id `"new"` (a köşk or medrese that does not exist yet), `audit_log.
   entity_id` is a `uuid`, and the insert failed. `TedrisatAuthzAudit` now writes the actor's id as `entity_id`
   for an id that is not a uuid and keeps the placeholder in `details.resourceId`. It hit `POST /madrasahs` when a
   Medaris nazımı named themselves its başmüderris, and `POST /kosks` when one named themselves in
   `managerUserIds`.
8. The stale doc comment of `MadrasahCourseService` ("nothing re-checks the caller… grants are not read") is
   replaced: since #177 the route's `@Authz` reads grants.

New helper `test/helpers/open-scopes.helper.ts` (`openKosk`, `seedAccounts`, `FIXTURE_MUDERRIS_ID`,
`FIXTURE_TEAM`): the specs that opened a köşk through `POST /kosks` and relied on the caller becoming its nazım,
or opened courses with no müderris, go through it.

## Behaviour changes callers will see

| Route | Before | Now |
| --- | --- | --- |
| `POST /kosks` | `managerUserIds` optional; omitted, the caller (a Medaris nazımı included) became the nazım | required, at least one: 400 without it; the caller is never seated (a Medaris nazımı naming themselves: 403 `SELF_GRANT_REFUSED`, was 500) |
| `POST /kosks/:koskId/courses` | `muderris` optional; the başnazım got 403 `KOSK_FORBIDDEN` from the service | `muderris` required with at least one account (400 `MUDERRIS_LIST_INVALID`), `imamUserId` optional; the başnazım opens in any köşk |
| `POST /kosks/:koskId/courses` | a holder of `course.open_standalone` who was not the köşk's nazımı got 403 from the service, whoever was named | such a holder (a grantee) may open a course for others; naming themselves as müderris or imam is 403 `SELF_GRANT_REFUSED`; the başnazım and the köşk's nazımı may list themselves |
| `PUT /courses/:id` | `muderris` omitted emptied the team; `[]` emptied it; a payload with no account left the course with no müderris | omitted keeps the team; `[]`, no account left, or the last account sent as `userId: null`: 400 `MUDERRIS_LIST_INVALID`, nothing written |
| `PUT /courses/:id` | dropping a week or a session needed only `course.edit` | also `week.hide` (403 `WEEK_HIDE_FORBIDDEN`); müderris and köşk nazımı hold it by default |
| `PATCH /courses/:id`, `PUT /courses/:id` | no `imamUserId` | the field is not accepted (400) |
| `POST /kosks/:id/managers/:userId` | `kosk.manage` or `platform.kosk_nazim_manage`: a köşk nazımı added peers | `platform.kosk_nazim_manage` only: a köşk nazımı gets 403 |
| `DELETE /kosks/:id/managers/:userId` | same guard; a nazım removed a peer or resigned while another remained | same new guard; 403 for a köşk nazımı; the last nazım needs `?successorUserId=` (else 409) |
| every screen | nizam calls none of the two manager routes (grep of `apps/nizam`); its course form already sends a team with the imam first and its köşk form already sends `nazimIds` | nothing hidden or renamed; the generated client changes types only (`createKoskDto.managerUserIds`, `createCourseDto.muderris` now required) |

The route inventory snapshot changes in two lines, read off `git diff`:
`DELETE|POST /kosks/:id/managers/:userId -> platform.kosk_nazim_manage on byExistingKosk` (was
`kosk.manage | platform.kosk_nazim_manage`).

## Decided by the owner (binding here)

- d-1004-12: köşk nazım peers by permission, not role (item 3).
- d-1004-13: never leave a scope with nobody by accident; the başnazım takes the seat (item 4). The per-row
  adopt / edit / drop flow of the removal itself is MDRS-201.
- 3 Oct (issue text): a köşk nazımı does not open a medrese course nor change its müderrisler; a başmüderris
  does not open a non-medrese course and files a request instead; both pinned by the new spec.
- d-1004-01 / d-1004-02 (memory): a Medaris nazımı seats nazımlar and başmüderrisler with the platform
  permissions, never themselves.

## Decided by default, owner may overrule

1. **Who sits above the köşk nazımı for a non-medrese course (dossier D2).** Default: the başnazım only (realm
   bypass); a Medaris nazımı cannot, the catalogue is frozen at 76 codes. Option (c), `platform.kosk_edit`,
   would be one more id in the route's `@Authz`.
2. **Imam default.** Without `imamUserId` the first listed account is the imam (the dossier's default; the
   medrese route instead demands the imam when there are several müderrisler). Stored by `setCourseImam`, so
   the partial unique index keeps exactly one.
3. **Whole-course save and `week.hide` (d-1004-14, still open as d-1004-26).** Default: the müderris holds
   `week.hide` by default and a save that drops a week or a session needs it. The check is
   `CourseService.assertMayHideWithSave`, in `replace`, after the müderris checks and before the write, and is
   separate from any `session.manage` check. PR #203 (another agent, not merged, not depended on) adds a
   `session.manage` requirement for a save that adds, moves or hides a session: the two checks must be
   reconciled when #203 lands (a save that hides a session would then need both).
4. **A save without `weeks`** still hides every week (the repository defaults `weeks = []`); it now needs
   `week.hide` like any other hiding. Left as it was; the issue concerns the team.
5. **Failure code of a save that would empty the team**: 400 `MUDERRIS_LIST_INVALID`, the code
   `PUT /courses/:id/muderris` already answers for an invalid list. The explicit "make it passive" choice and a
   409 `COURSE_LAST_MUDERRIS` are the dossier's PR B (MDRS-201 / API wave).
6. **A course already without an account on its team** (legacy) is not blocked from saving: the refusal is only
   for a save that takes the last account away.
7. **Resigning is refused to a köşk nazımı** (dossier D1(a)); a nazım who wants out asks the başnazım.
8. **Self-seat on an existing course is not closed here.** `PUT /courses/:id/muderris` and the müderris branch of
   `PUT /courses/:id` let a grantee of `course.open_standalone` (köşk scope, with a role on the chain) name
   themselves müderris. This part did not create the hole, and closing it needs the guard to see only the
   accounts the save adds: asking it about every listed account would refuse a grantee who re-saves a list
   they already sit in. Default: left as it was, recorded for the owner; the fix is a `SelfGrantGuard` call on
   `newlyLinkedUserIds(current, next)` inside `CourseService`.

## Tests, and what each is red without

New: `test/e2e/scope-opening.e2e.spec.ts` (53 tests), `test/unit/course/syllabus-drops.spec.ts` and three new
describes in `test/unit/course/muderris-list.spec.ts`. Rewritten (the old tests encoded the old rules):
`kosk-managers.e2e.spec.ts` (the creator test, peers adding and removing, resigning, the last-two race),
`course.e2e.spec.ts` ("replaces a course": the team is kept), `muderris-assignments.e2e.spec.ts` (name-only
team and the "no account left" save are refused), `course-team.e2e.spec.ts` ("takes the role away with the row"
names a successor), `schedule.e2e.spec.ts` (the passive course revokes its real müderris).

Final run (the review-fix pass re-ran these on the final tree, one spec file at a time, counts read off each
summary):

```
$ ./node_modules/.bin/vitest run test/unit
 Test Files  66 passed (66)
      Tests  848 passed (848)
$ …/e2e-slot.sh ./node_modules/.bin/vitest run test/e2e/<file>.e2e.spec.ts      (one file per run, every one passed)
 scope-opening 53, authz-route-inventory 1, kosk-managers 21, authz-query-count 11,
 course 56, course-staff 9, course-team 43, muderris-assignments 8, muderris-realm-account 4,
 kosk 36, kosk-admin 36, authz-engine 54, schedule 8, calendar-feed 13, session-batch 9, lesson-calendar 7,
 madrasah-course 38, hide-instead-of-delete 9, discover 25, public-pages 30, flashcard-study 14
```

Red-then-green, each by putting the pre-change source (`git show 7533d432:<file>`) or one mutation back and
running `scope-opening.e2e.spec.ts` (46 tests when the first three ran; 53 now), then restoring from `HEAD`. The review-fix rows at the end of the table were written test first: the new tests ran against the unfixed source, failed, and the fix made them pass:

| Put back | Result | Tests that went red |
| --- | --- | --- |
| all of `src/kosk` (create branch, manager guards, last-manager rule) | `Tests  6 failed \| 40 passed (46)` | "refuses no list at all with 400" (a Medaris nazımı became the nazım), "is not for a köşk nazımı" (peers and resigning), the three successor tests (seat first, başnazım takes the seat, Medaris naming themselves), "refuses a successor who has never signed in or who is the nazım removed" |
| `TedrisatAuthzAudit` as it was | `Tests  2 failed \| 44 passed (46)` | the two self-naming refusals on `POST /kosks` and `POST /madrasahs` (500 instead of 403) |
| all of `src/course` (service, repository, DTOs, domain) | `Tests  12 failed \| 34 passed (46)` | the başnazım opening a course, the imam named, an imam not listed, no / no-key / no-account müderris, the three whole-course-save tests, the three `week.hide` tests |
| only the `assertMayHideWithSave` call | `Tests  1 failed \| 3 passed \| 42 skipped (46)` (`-t week.hide`) | "refuses a saver holding course.edit without week.hide" |
| only the omitted-`muderris` guard in `CourseRepository.replace` (`muderris = []` default back) | `Tests  1 failed \| 7 passed \| 38 skipped (46)` (`-t "whole-course save"`) | "leaves the team as it is when the payload leaves the müderris out" |
| only the "no account left" refusal in `CourseService.replace` | `Tests  2 failed \| 6 passed \| 38 skipped (46)` | "refuses an empty team", "refuses a team left with no account…" |
| `UpdateCourseDto` as it was (`imamUserId` accepted) | `Tests  1 failed \| 46 skipped (47)` (`-t "does not take an imam"`) | "does not take an imam from a save or a patch" (PATCH answered 200) |
| route guards of `POST /kosks` (`platform.kosk_create` → `kosk.manage`) and `POST /madrasahs/:id/courses` (`madrasah.course_open` → `madrasah.course_hide`) | `Tests  6 failed \| 40 passed (46)` | the Medaris-with-grant opening, its self refusal, the omitted / empty list, "a nazır … opened by one holding madrasah.course_open", "refused … in a köşk that gave the medrese no right" |
| review fix 1: `boundAccountsAfterSave` as it was (`row.userId ??`) | e2e `Tests  4 failed \| 49 passed (53)` on the whole file (two of the four were my own miscount of the archived weeks after the fixture grew a third week, fixed in the test); unit `Tests  1 failed \| 25 passed (26)` on `muderris-list.spec.ts` | "refuses a stored row saved with userId null…" (expected 400, got 200), unit "drops the account of a row named by id that carries userId null…" |
| review fix 2: no `selfGrant.assertNotSelf` in `CourseController.create` | same e2e run | "is opened by a grantee of course.open_standalone for someone else, but not for themselves" (expected 403, got 201) |
| review fix 3: `assertMayHideWithSave` returns on `hidden.weeks === 0` (mutation, `-t week.hide`) | `Tests  1 failed \| 5 passed \| 47 skipped (53)` | "refuses a saver without week.hide who drops only a session of a week they keep" |
| review fix 3: the same line returns on `hidden.sessions === 0` (mutation, `-t week.hide`) | `Tests  1 failed \| 5 passed \| 47 skipped (53)` | "refuses a saver without week.hide who drops only an empty week" |

Honest limits of that table. These are red without the change, per criterion:

| Criterion | Test | Without the change |
| --- | --- | --- |
| A Medaris nazımı opens a köşk only once granted, never as its nazım | "lets a Medaris nazımı holding platform.kosk_create open it…", "refuses no list at all…" | red (rows 1 and 8) |
| A köşk nazımı cannot open a köşk or a medrese | "is refused to a köşk nazımı…" (köşk), "is refused to %s" (medrese) | **not shown red**: these pin existing behaviour. The route-guard mutation of the last row left the köşk case green because `KoskAdminService.requirePlatform` refuses as well; the medrese case was not mutated |
| A başmüderris opens a medrese course in a köşk with a hosting right, 403 where none | "opened by the başmüderris…", "refused … in a köşk that gave the medrese no right" | the second red with the guard mutation; both already held on `main` (AC2 was met) |
| A nazır holding `madrasah.course_open` opens one, without it 403 | "is refused to a nazır with no grant, and opened by one holding madrasah.course_open" | red (row 8) |
| A köşk nazımı does not open a medrese course nor change its müderrisler; a başmüderris does not open a non-medrese course and files the request | "is not opened, and its müderrisler not changed, by the köşk's nazımı", "is not opened by a başmüderris, who files a request…" | pins existing behaviour (`madrasah-course.e2e` and `authz-engine` already did) |
| The başnazım opens a non-medrese course | "is opened by the başnazım in any köşk" | red (row 3) |
| Exactly one imam before and after any change | "the one imam of a course" (open, add, remove non-imam, move, remove imam by a whole-course save, lapsed by `expires_at`) | the sweep passes without this change: the one-imam machinery (`syncMuderrisAssignments`, `setCourseImam`, the partial unique index) already held; the new part, an imam chosen when the course is opened, is the red "makes the imam named the imam" |
| Removing the last nazım needs a successor | the five tests of "a köşk's nazımları" | red (row 1) |

## What is NOT done

- **Adopt / drop of a removed person's grants (AC3), the explicit "make it passive" choice and the last-müderris
  409 with `makePassive` (AC4, B9), `DELETE /madrasahs/:id/head-muderris`, the derived directory status (B10).**
  The planner's cut leaves these to MDRS-201 and the API wave (dossier WP3 to WP5). Nothing writes
  `permission.take_over` rows yet.
- **Passive leaks (AC6, dossier WP6)**: the calendar feed's `manages` branch, the `.ics` route and PUBLIC
  recordings of a passive course. Wave 5.
- **One request flow (B14, WP7)** and its migration: the nazir app's offsite request still lands in
  `offsite_course_requests`, not in the köşk nazımı's list. Wave 5. No migration here.
- A Medaris nazımı opening a non-medrese course (D2) and Medaris management seeing course requests (D3).
- Screens (MDRS-107, MDRS-123) and i18n: API only; no catalogue code, no locale key was added.

## Not verified

- Playwright specs of nizam, nazir and tedris (need a running stack).
- Real Keycloak, Bunny and YouTube. The specs use the stubbed key provider; `assertKnownAccounts` was exercised
  through the `users` table only (the realm branch is `isConfigured()`, false in tests).
- The whole tedrisat suite (about 17 minutes) is the integrator's. Run here: `test/unit` (66 files), the specs
  named in the PR description, the route inventory, the OpenAPI freshness check, `nx run-many -t typecheck` for
  `nizam-web`, `nazir-web`, `tedris-web` and their dependencies, and `apps/nizam`'s vitest (40 files, 662 tests).
  `apps/nazir` and `apps/tedris` vitest were not run (the client change is types only and both typecheck).
- Concurrency of two removals of the last two nazımları runs in `kosk-managers.e2e.spec.ts` ("keeps exactly
  one when the last two are removed at once"); the successor path under that race is not separately tested.
