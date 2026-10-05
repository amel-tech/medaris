# MDRS-270 — Ders nazırları from the course itself (API)

Base: `origin/main` = `0ca50a3d`. Branch `taha/mdrs-270-course-nazir-api`. This is the API half of
MDRS-270 ("ders ayarları ve ders nazırı atama", asked for by the başnazım in nazar): four routes on
`/courses/:id/nazirs` that list, appoint, change and end a ders nazırı, for a medrese's course as well
as a köşk's own. Nazar's "Ders nazırları" page is built on them in a branch of its own; "Ders ayarları"
needs no API change (the routes it uses exist, see the last test below). Every number here was read off
the command next to it; commands run from `apps/tedrisat` unless a path says otherwise.

## What changed

New `apps/tedrisat/src/course/nazir/`: `CourseNazirController`, `CourseNazirService`,
`CourseNazirRepository`, the pure `courseStandingOf` (`course-standing.ts`), two errors, the DTOs.
`planPostGrants` joins `planGrants` in `assignment/admin/grant-plan.ts`, and `longestRunning` moved
there unchanged from the medrese repository (which imports it back). `KADEME` is exported from
`madrasah-permission.service.ts` instead of being copied. Three error classes take an optional message
(codes and today's messages unchanged): `GrantCourseInvalidError`, `CourseNazirNotFoundError`,
`PermissionNotGivableError`. The köşk route's `postHolder` and `lockPost` gain
`isNull(courses.madrasahId)`. No migration, no catalogue change (`libs/common` untouched).

Every route carries `@Authz(PERMISSIONS.COURSE_NAZIR_ASSIGN, byExistingCourse)`; `:postId` goes through
`ParseUUIDPipe`. Names as generated in `libs/services` (`CoursesApi`):

| Method and path | operationId | Request | Answer | Refusals |
| --- | --- | --- | --- | --- |
| `GET /courses/:id/nazirs` | `getCourseNazirs` | `GetCourseNazirsRequest { id }` | 200 `CourseNazirsResponse` | 403 `AUTHZ_FORBIDDEN`; 404 `COURSE_NOT_FOUND` |
| `POST /courses/:id/nazirs` | `createCourseNazir` | `CreateCourseNazirRequest { id, createCourseNazirDto }` | 201 `CourseNazirsResponse` | 400 `VALIDATION_ERROR`, `PERMISSION_UNKNOWN`, `GRANT_EXPIRY_INVALID`, `GRANT_COURSE_INVALID`; 403 `AUTHZ_FORBIDDEN`, `SELF_GRANT_REFUSED`, `PERMISSION_NOT_GIVABLE`, `GRANT_EXCEEDS_GIVER`; 404 `COURSE_NOT_FOUND`, `COURSE_NAZIR_UNKNOWN_ACCOUNT`; 409 `COURSE_NAZIR_EXISTS`, `COURSE_NAZIR_HOLDS_SEAT`; 503 `KEYCLOAK_ADMIN_UNAVAILABLE` |
| `PATCH /courses/:id/nazirs/:postId` | `updateCourseNazir` | `UpdateCourseNazirRequest { id, postId, updateCourseNazirDto }` | 200 `CourseNazirsResponse` | 400 `VALIDATION_ERROR`, `PERMISSION_UNKNOWN`, `GRANT_EXPIRY_INVALID`; 403 `AUTHZ_FORBIDDEN`, `SELF_GRANT_REFUSED`, `PERMISSION_NOT_GIVABLE`, `GRANT_EXCEEDS_GIVER`; 404 `COURSE_NOT_FOUND`, `COURSE_NAZIR_NOT_FOUND` |
| `DELETE /courses/:id/nazirs/:postId` | `revokeCourseNazir` | `RevokeCourseNazirRequest { id, postId }` | 204 | 403 `AUTHZ_FORBIDDEN`, `PERMISSION_NOT_GIVABLE`, `NAZIR_NOT_APPOINTED_BY_YOU`; 404 `COURSE_NOT_FOUND`, `COURSE_NAZIR_NOT_FOUND`; 409 `DISMISS_SEAT_HANDED_ON` |

Models (generated field names):

- `CourseNazirsResponse { course: CourseNazirCourseResponse; items: CourseNazirResponse[]; catalog: string[]; grantable: string[]; mayAppoint: boolean }`
- `CourseNazirResponse { id; user: KoskPersonResponse; permissions: string[]; endsAt?: Date | null; grantedBy: KoskPersonResponse; grantedAt: Date; mayEdit: boolean; mayEnd: boolean }`
- `CourseNazirCourseResponse { id; title; madrasahName?: string | null }`
- `CreateCourseNazirDto { userId; permissions: string[]; endsAt?: Date }` (0 to 40 codes; `[]` appoints with none)
- `UpdateCourseNazirDto { permissions: string[]; endsAt: Date | null }` (`endsAt` is required: a body without it is 400)

The person is the existing `KoskPersonResponse` (`{ id, name, email }`), so the client gains five models.
`endsAt` and `madrasahName` are optional-nullable in the client as on the köşk route's DTOs; the server
always sends both keys.

## Who stands where

`courseStandingOf` asks the engine's own `rolesConferring` (each role alone, with the grants under it):

| Caller | Standing | Gives at |
| --- | --- | --- |
| başnazım (realm role) | giver | `platform`, the whole `COURSE_CATALOG` |
| the course's müderris | giver | `course` |
| the medrese's başmüderris, in a medrese course | giver | `madrasah` |
| a köşk nazımı, in a köşk's own course | giver | `kosk` |
| a köşk nazımı alone, in a medrese course | outside: reads the list, every write 403 `PERMISSION_NOT_GIVABLE` | — |
| a köşk nazımı who is also the müderris of that medrese course | giver | `course` |
| a ders nazırı, medrese nazırı or Medaris nazımı holding `course_nazir.assign` by a grant | appointer: appoints with `[]`, ends own appointees | nothing |
| anyone else | refused by the guard (403) | — |

A giver with several giving seats gives at the highest (course < medrese < köşk). A giver hands on only
the `COURSE_CATALOG` codes in `authz.effective(user, course).codes`; the stored authority is the giver's
seat level, never higher.

## Rules and where they come from

Recorded by the owner (decision box, Linear, memory):

1. The four routes are decided by `course_nazir.assign` on the course. MDRS-270 item 1 and AC2.
2. Giving needs `permission.grant` through a role (müderris, başmüderris, köşk nazımı) or the başnazım; a
   holder of `course_nazir.assign` by grant appoints with no permission and changes nothing. d-1001-07
   ("atanan nazıra izin verilemez"), MDRS-133 "No re-delegation", the AC test at
   `authz-engine.e2e.spec.ts` "a ders nazırı cannot grant anything, whatever they hold".
3. Such an appointer ends only the posts they appointed (`NAZIR_NOT_APPOINTED_BY_YOU`). d-1004-28.
5. Ceiling: a giver hands on what they hold in the course now; the başnazım the whole catalog. d-1004-27
   "tavan kazanır", MDRS-135 §4.
6. The authority stored on a given row is the giver's seat level. d-1004-27.
7. In a medrese course the köşk nazımı alone neither appoints, changes nor ends. d-1001-35, d-1001-05.
8. The köşk route can no longer reach a post in a medrese course (404 `COURSE_NAZIR_NOT_FOUND`). d-1001-35.
9. Works for medrese courses and for a köşk's own. MDRS-270 item 1.
10. Self-appointment and editing one's own post are refused for all but the başnazım (403
    `SELF_GRANT_REFUSED`, one `permission.self_grant_refused` row, `entity: "course"`). MDRS-270 AC2;
    memory "self-grant and self-appointment stay refused for everyone but SYSTEM_ADMIN".
12. One held post per person per course (409 `COURSE_NAZIR_EXISTS`). MDRS-270 item 1.
13. Post and permissions end together at one optional `endsAt`; at or before now is 400. d-1001-24,
    d-1004-31, d-1004-33 parked at its default `bugunku-gibi` (no cap by the giver's own end).
14. The account must exist in the app or the realm (404 `COURSE_NAZIR_UNKNOWN_ACCOUNT`); a directory that
    does not answer is 503, never "unknown". MDRS-270 "a person with an account".
19. Ending a ders nazırı whose appointees still hold their posts is refused (409 `DISMISS_SEAT_HANDED_ON`,
    through `assertNothingLeftUnder`), nothing written. d-1001-23, d-1004-13 "Reddet ve listele".
21. Every appoint, change and end writes one audit row in the same transaction (`course_nazir.assign`,
    `.update`, `.revoke`, `details.via = "course"`, with the standing and the authority). MDRS-133/135 §8.
    A Medaris nazımı's appointment shows in the başnazım's `GET /nizam/medaris-nazims/:id/given` with no
    extra code (it reads `role_assignments.granted_by`).

### Decided by default, owner may overrule

4. A giver changes and ends any post in the course, whoever made it. Dropping a code or moving an end
   earlier is no gift; adding one or moving it later is, and is held to the ceiling. A later end on a row
   stored with an authority the actor does not reach (a başnazım-made row lengthened by a müderris) is a
   new row of the actor's authority beside it; the higher row stays as it was.
11. A person who already holds a seat over the course (its müderris; a başmüderris or nazır of its
    medrese; a nazımı of its köşk; any platform role) cannot be made its ders nazırı: 409
    `COURSE_NAZIR_HOLDS_SEAT`. A post and its grants are tied only by person and course, so changing or
    ending the post would otherwise reach that seat's own course grants.
12 (part). A new post first revokes every still-open course grant of the person in the course, so a
    re-appointment never revives what an earlier post left open (the ids go into the audit row).
15. The codes offered are `COURSE_CATALOG` (20), not `MADRASAH_COURSE_CATALOG`; anything else is 400
    `PERMISSION_UNKNOWN` whoever holds it.
16. No course permission groups in this issue; single codes only.
17. A hidden course takes no new post (400 `GRANT_COURSE_INVALID`, "Course <id> is hidden"); change and
    end stay open to those who see a hidden course. `mayAppoint` is false on a hidden course, so the flag
    means "POST would pass" (the design had standing only).
18. A passive course adds no refusal of its own: both codes are no content; the ceiling already keeps a
    non-opener from handing on content codes.
20. Removing a müderris who appointed ders nazırları is MDRS-201; every post keeps `granted_by` and every
    row its authority for it.
- `UpdateCourseNazirDto.endsAt` is required (a date-time or `null`), so an edit that forgets it cannot
  silently lift an end.

## Behaviour changes callers will see

1. Four new routes under `/courses/:id/nazirs` (route inventory: four added lines, nothing else).
2. `PATCH` and `DELETE /kosks/:id/grants/:grantId` answer 404 `COURSE_NAZIR_NOT_FOUND` for a post in a
   medrese course. No such post could exist before this change.
3. A grantee of `course_nazir.assign` (ders nazırı, medrese nazırı, Medaris nazımı with an every-course
   grant) can now appoint a ders nazırı with no permission, and read the course's list. It was inert.
4. Three error classes take an optional message; their codes and default messages are unchanged.
5. The regenerated client's header line reads "The version of the OpenAPI document: 0.2.1" in every
   generated file: release 0.2.1 (#137) bumped `apps/tedrisat/package.json` after the last
   regeneration, and the exporter writes that version. Apart from that line the client changes only in
   `CoursesApi` (four operations), five new models, `models/index.ts`, `FILES` and the README.

## Tests

Specs added or changed (all run through `/home/taha/medaris-wt/.bin/e2e-slot.sh ./node_modules/.bin/vitest run`):

| Spec | What it pins | Result |
| --- | --- | --- |
| `test/e2e/course-nazirs.e2e.spec.ts` (new) | every rule and refusal of the four routes | 30 passed (30) |
| `test/e2e/authz-engine.e2e.spec.ts` | the AC block: the course route refuses a ders nazırı's gift and change; a new `it` "may appoint with no permission when granted course_nazir.assign, and nothing more" | 66 passed (66) |
| `test/e2e/self-grant.e2e.spec.ts` | new describe "POST and PATCH /courses/:id/nazirs" (3 tests) | 18 passed (18) |
| `test/e2e/kosk-grants.e2e.spec.ts` | "cannot change / cannot end a post in a medrese course (404), which the course route made" | 20 passed (20) |
| `test/e2e/course-my-permissions.e2e.spec.ts` | "lists the settings abilities a müderris holds, and drops the one a policy closes" (the settings page's locks) | 33 passed (33) |
| `test/e2e/authz-route-inventory.e2e.spec.ts` | snapshot: exactly four added lines, 232 → 236 | 1 failed before `-u`, then 1 passed |
| `test/unit/course/course-standing.spec.ts` (new) | `courseStandingOf`, and that `COURSE_CATALOG` sits in all three giver roles' defaults and only they hold `permission.grant` | 9 passed (9) |
| `test/unit/assignment/grant-plan.spec.ts` | describe "planPostGrants (MDRS-270)", 7 tests | 18 passed (18) |

Regression (no edits): `vitest run test/unit` 81 files, 1098 passed (1098). E2E in three batches:
`authz-route-inventory`, `authz-query-count`, `course`, `course-team`, `course-staff` 120 passed (120);
`grant-ceiling-cascade`, `permission-admin`, `madrasah-permission`, `madrasah-nazir` 89 passed (89)
(`longestRunning` moved, `KADEME` exported, `PermissionNotGivableError` changed);
`platform-admin`, `assignments`, `role-assignments-migration`, `madrasah-head-change`, `kosk-managers`,
`roster-read-audit`, `muderris-assignments` 122 passed (122). `test/unit/kosk/kosk-grants-rules.spec.ts`
5 passed (5).

Gates: `tsc --noEmit` in `apps/tedrisat` exit 0; spec type check (temporary speccheck tsconfig) 0
name-resolution errors and no error in a file this branch touches (38 type errors, all in spec files
it does not touch); `libs/services` `tsc -b` exit 0; `node tools/ci/assert-openapi-spec-fresh.mjs`
"186 paths, identical"; `node tools/ci/biome-ratchet.mjs` errors 0, warnings 70, infos 21; Biome clean on
every touched file.

### Red, then green

Each line: the source change put back (a mutation applied by a script, the files restored from git
afterwards), the tests that went red, and one failing assertion. Groups were chosen so that no two
mutations in one run touch the same test.

| # | Source line put back | Red tests | Failing assertion (one) |
| --- | --- | --- | --- |
| R0 | the controller left out of `CourseModule` | all 30 of `course-nazirs` | `expected 201 "Created", got 404 "Not Found"` |
| R1 | rule 11 seat check; rule 12 leftover revoke; rule 19 `assertNothingLeftUnder`; rule 3 own-appointee check; the past-end check | "refuses the course's müderris, a nazır of its medrese and a Medaris nazımı (409 COURSE_NAZIR_HOLDS_SEAT)", "does not revive a permission left open from an earlier post", "refuses to end a ders nazırı whose appointees still hold their posts (409 DISMISS_SEAT_HANDED_ON) and writes nothing", "lets them end a post they appointed and refuses one they did not (403 NAZIR_NOT_APPOINTED_BY_YOU)", "refuses an end in the past, …", "takes the end away with null and refuses a missing end" (6 of 30) | `expected [ Array(5) ] to not include 'course.edit'`; `expected 409 "Conflict", got 204 "No Content"` |
| R2 | ceiling = whole catalog for any giver; account check; `mayEnd` for an appointer; one post per person | "refuses a başmüderris on a passive course a content code he cannot hold …", "lets a başmüderris on a passive course shorten …", "refuses an end in the past, an unknown account, …", "lists the posts …", "refuses a second post …" (5 of 30) | `expected [ [ false, false ], [ false, false ] ] to deeply equal [ [ false, false ], [ false, true ] ]` |
| R3 | the köşk nazımı counted in a medrese course; the unknown-code check | "refuses the köşk nazımı every write there …", "lists the posts …", "refuses a code outside the course catalog …", "takes the end away …"; unit "leaves the köşk nazımı outside a medrese course", "takes the müderris role of a köşk nazımı who also teaches a medrese course" (6 of 39) | `expected { kind: 'giver', authority: 'kosk' } to deeply equal { kind: 'outside' }` |
| R4 | a grantee of `course_nazir.assign` made a giver (gate on the route's code alone) | the four "an appointer" tests, "lists the posts …"; authz-engine "is refused every route that gives permissions …" and "may appoint with no permission …"; unit "makes a ders nazırı granted course_nazir.assign an appointer, not a giver", "makes a Medaris nazımı with an every-course grant an appointer", "ignores a grant of permission.grant" (10 of 105) | `expected 'GRANT_EXCEEDS_GIVER' to be 'PERMISSION_NOT_GIVABLE'` |
| R5 | a later end always rewrites the row in place | "does not lengthen a row the başnazım made …"; unit "adds a row beside a lead stored above the actor" (2 of 48) | `expected [ { …(12) } ] to have a length of 2 but got 1` |
| R6 | the hidden-course refusal (service and transaction); `endsAt` optional on PATCH | "refuses a hidden course (400 GRANT_COURSE_INVALID)", "takes the end away with null and refuses a missing end" (2 of 30) | `expected 400 "Bad Request", got 200 "OK"` |
| R7 | the three audit inserts | 9 of 30, among them "appoints a ders nazırı … and one audit row", "replaces the set …", "ends the post …" | `expected [] to match object [ { …(5) } ]` |
| R8 | the self guard on create and on update | self-grant "a müderris cannot make themselves the course's ders nazırı", "a ders nazırı cannot widen or lengthen their own post through the course route" (2 of 18) | `expected 403 "Forbidden", got 409 "Conflict"` (rule 11 still stops it, unrecorded); `expected 403 "Forbidden", got 200 "OK"` |
| K1 | the köşk route without `isNull(courses.madrasahId)` | the two new kosk-grants tests (2 of 20) | `expected 404 "Not Found", got 200 "OK"` |
| A9a | the engine's derived-code loop (`libs/common`, rebuilt) | "lists the settings abilities a müderris holds …" (1 of 33) | `expected [ 'ban.course', …(26) ] to deeply equal ArrayContaining{…}` |
| A9b | the engine's policy close (`libs/common`, rebuilt) | the same test | `expected [ 'ban.course', …(29) ] to not include 'setting.approval_off'` |
| U1 | kademe (first level, not highest); riders not shortened; groups not revoked; riders not revoked; inserts dropped; a fourth role in `GIVER_LEVEL` | unit "makes the başmüderris a giver at the medrese's level …", "shortens a lead and every rider …", "revokes a group row", "revokes a code left out with the rows riding along", "inserts a new code", "holds every code of COURSE_CATALOG …" (6 of 27) | `expected { revoke: [ 'lead' ], …(4) } to deeply equal { revoke: [ 'lead', 'rider' ], …(4) }` |
| U2 | every lead retimed; the müderris's level set to the köşk's | unit "touches nothing when the end and the set are the same", "makes the müderris a giver at the course's level", and five more (7 of 27) | `expected { revoke: [], shorten: [ 'p' ], …(3) } to deeply equal { revoke: [], shorten: [], …(3) }` |
| U3 | the engine's drop of a granted `permission.grant` and the giver-level filter, together; the köşk nazımı dropped everywhere | unit "ignores a grant of permission.grant", "makes the köşk nazımı a giver at the köşk's level …" (2 of 27) | `expected { kind: 'giver', authority: 'course' } to deeply equal { kind: 'outside' }` |
| U4 | a later end never rewritten in place | unit "moves a lead later in place when the actor reaches its authority" (1 of 18) | `expected { revoke: [], shorten: [], …(3) } to deeply equal …` |

Two layers to know about: self-appointment on create is also stopped by rules 11 and 12 (R8 answers 409
instead of 403: the guard is what records the attempt); "ignores a grant of permission.grant" stays green
when only one of the engine's drop and the giver-level filter is removed (U3 removes both).

### Criterion → test

| MDRS-270 | Test |
| --- | --- |
| AC1 the ders nazırı gets exactly what was chosen | "gives the ders nazırı exactly what was chosen: my-permissions lists it and a route not given refuses" (R0) |
| AC2 nobody gives beyond what they hold; nobody appoints themselves; a grantee of `course_nazir.assign` appoints only | "the ceiling (criterion 2)" (R2), "an appointer (criterion 2)" (R4), authz-engine AC additions (R4), self-grant describe (R8) |
| AC3 change permissions and end | "PATCH … (criterion 3)" (R1, R5, R6) |
| AC4 end post and permissions together | "DELETE … (criterion 4)" (R0, R1) |
| every change in `audit_log` | audit assertions in POST, PATCH, DELETE (R7) |
| one post per person per course (409) | "refuses a second post of the same person (409 COURSE_NAZIR_EXISTS)" (R2) |
| a future end date | "refuses an end in the past, …" (R1) |
| a person with an account | same test, unknown account 404 and directory 503 (R2) |
| a medrese's course as well as a köşk's own | "a medrese course (rule 7)" (R3), kosk-grants rule 8 (K1) |
| settings page draws no button the API refuses | "lists the settings abilities a müderris holds …" (A9a, A9b) |

## Where the design note and the code differed

- "Keep `longestRunning`'s existing cases passing from its new home": it had no unit cases; the medrese
  e2e specs exercise it (89 passed above), and the new `planPostGrants` cases cover leads and riders.
- "Unit specs need no slot": every tedrisat vitest run starts the shared Postgres container in
  `test/global-setup.ts`, so the unit runs went through the slot as well.
- `mayAppoint` is also false on a hidden course (rule 17 above), so no button is drawn for a POST the
  route refuses.
- `CourseNazirResponse.endsAt` and `CourseNazirCourseResponse.madrasahName` follow the köşk DTOs
  (`ApiPropertyOptional`, nullable), so the client types them optional; the person is the existing
  `KoskPersonResponse`.

## Not verified

- A real Keycloak: the e2e specs replace the realm's directory with a fake fetch (a newcomer, an unknown
  id, a 500 for the 503 case).
- Nazar's page and Playwright: other branches and the browser phase.
- The whole tedrisat suite (about 17 minutes) is the integrator's; the specs run here are listed above.

## Risks that stay

- R1 Two write paths on one post: the köşk route still edits köşk-course posts with its old in-place
  retime (it can lengthen a başnazım-made row at the köşk's authority). Pre-existing, not fixed here.
- R2 No link column between a post and its grants: change and end act on every course grant of the holder
  in the course. Rule 11 makes those exactly the post's for every post this route creates; a seat given
  to the person later is ended with the post, the conservative direction.
- R3 A müderris's appointments survive his removal (MDRS-201).
- R4 A Medaris nazımı given `course_nazir.assign` for every course reads every course's list (names,
  e-mails, unaudited) and appoints anywhere with no permission; each appointment is listed to the
  başnazım.
- R5 Any role holder passes `GET /users/lookup` (d-1004-09 "şimdilik dursun"); an appointee with no
  permission can search e-mails (audited).
- R7 A Kaydet that lengthens a content code a başmüderris on a passive course no longer holds meets
  `GRANT_EXCEEDS_GIVER` (tested); the screen words it.
