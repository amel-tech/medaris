# MDRS-270 — Ders nazırları in nazar

Branch `taha/mdrs-270-nazar-nazirs`, based on the API branch `taha/mdrs-270-course-nazir-api` (tip
`1da339fe`, which regenerated the client this page calls). This is the nazar half of MDRS-270 for the
ders nazırı ("nizam'da bulamadım başnazım olarak, nazar'a … ders nazırı atama şeyini"): the page
`/ders/<id>/nazirlar` and the shell change that lets the başnazım reach it. The routes, their rules and
their refusal tests are in `mdrs-270-course-nazir-api.md`; "Ders ayarları" is a branch of its own. Every
number below was read off the command next to it, run from `apps/nazar` unless a path says otherwise.

## What changed

**The başnazım reaches a course by its address** (`features/shell/admin-scope.ts`,
`features/shell/components/portal-layout.tsx`). Before, nazar answered 404 for `/ders/<id>` of a course
in which the caller holds no seat, and sent a person with no seat at all to `/erisim-yok`; the başnazım
holds none. Now, when a `/ders/<id>/…` page names a course outside the caller's scopes, the layout asks
`adminCourseScope(id)` before that verdict:

- `GET /me` says `roles.systemAdmin` → the course is read (`GET /courses/:id`) and becomes a one-course
  scope for that page (role label "Medaris başnazımı", the course's own id and title). The frame gets his
  own scopes plus this one, his own roles (or `SYSTEM_ADMIN` when he holds none), and `remember={false}`,
  so `/` is never sent back to it: `/` still answers `/erisim-yok` for a başnazım with no seat.
- the course read fails or is refused, or `GET /me` itself fails → the shell's retry state ("Görevleriniz
  okunamadı"): a failed read is never a verdict about access.
- anyone else → `none`, and today's path: 404 for a scope not theirs, `/erisim-yok` with none. No course
  is read for them.
- a course that does not exist, or an address that names no course id → the portal's 404, as for anyone
  (the malformed id is not read: the route would answer 400, which no retry mends).
- a `/medrese/<id>` page is never opened this way.

The frame of such a course links to "Bildirimler" and, from his name, to `/hesap`. Those pages sit outside
any scope, where a person with no scope was sent to `/erisim-yok`; for the başnazım
(`adminOutsideScopes`) they now open in the frame without a scope (brand and person, as on nazir 02),
and the retry state answers a `GET /me` that failed. Anyone else with no scope is sent on as before.

From nizam: the course overview (nizam/53) offers the başnazım "Nazar’da aç", a link to the course's
Ders nazırları in nazar, in a new tab (`nazarCourseHref`; drawn only for `roles.systemAdmin` and only
while `NAZAR_URL` is set). This is design rule 27 (S6), added by the review: the request was "nizam'da
bulamadım". It points at `/ders/<id>/nazirlar` rather than `/ders/<id>`, whose genel bakış is still the
placeholder.

**The page** (`app/ders/[dersId]/nazirlar/{page,loading}.tsx`, `features/course-nazirs/`), which wins
over the placeholder `[bolum]` for `nazirlar`. The menu entry existed (`nav.ts`, untouched).

- `course-nazirs.ts` (pure): the rows (`courseNazirRows`), what the dialogs need (`courseNazirsContext`),
  `appointsOnly`, `boxState`, `chosenCodes`, `pickProblem`, `unchangedPost`, `courseNazirErrorKey`,
  `listMoved`. `personName`, `permissionLabel`, `isEmailLike` and `PickedPerson` are the medrese nazırs'
  (`~/features/nazirs/nazirs`), imported, not copied.
- `actions.ts` (`"use server"`): `appointCourseNazir`, `changeCourseNazir`, `endCourseNazir`, each one
  call through `authenticatedAction` + `outcomeOf`, `ActionOutcome<null>` (the page reads the list again),
  `console.error` on failure, only the code reaches the browser. The search is `lookupPerson` of
  `~/features/nazirs/actions`.
- `components/course-nazirs-page.tsx` (server): reads the viewer, the locale and
  `GET /courses/:id/my-permissions`; gates on `PAGE_CODES.nazirs = ["course_nazir.assign"]`; only then
  reads `GET /courses/:id/nazirs`.
- `components/course-nazirs-table.tsx`, `course-nazir-dialog.tsx` (appoint and edit in one, plus the
  "Ders nazırı ata" button), `end-course-nazir.tsx` (the dismissal): client components on the kit's
  `Table`, `Dialog`, `Field`, `Input`, `Checkbox` (through the medrese's `PermissionSection`, reused as
  it is), `Avatar`, `Alert`, `useToaster`.
- `features/account/course-permissions.ts`: `CODES.courseNazirAssign`, `PAGE_CODES.nazirs`.
- `libs/i18n/src/locales/{tr,en,ar}/nazar.json`: `Roles.SYSTEM_ADMIN` and one block `CourseNazirs`
  (77 keys), before `Groups`. Turkish first, in the owner's words from nizam's köşk İzinler page and
  nazar's Medrese nazırları; en and ar for parity.

## What decides what on the page

| Control | Drawn when | The API's refusal (tested in `course-nazirs.e2e.spec.ts` on the API branch) |
| --- | --- | --- |
| the page | `my-permissions` holds `course_nazir.assign`; otherwise "Bu sayfaya izniniz yok", and the list is not read. A failed read is the retry state, never "izniniz yok". A refused list read is "izniniz yok". | 403 `AUTHZ_FORBIDDEN` on all four routes |
| "Ders nazırı ata" | the list's `mayAppoint` | 403 `PERMISSION_NOT_GIVABLE` (köşk nazımı in a medrese course), 400 `GRANT_COURSE_INVALID` (hidden course) |
| a box on | the code is in the list's `grantable`, or (edit) the post holds it already: unticking is no gift | 403 `GRANT_EXCEEDS_GIVER`, 400 `PERMISSION_UNKNOWN` |
| no boxes, "Atadığınız kişi izinsiz başlar" | appointing with `grantable` empty (one who holds `course_nazir.assign` by a grant); `[]` is sent | 403 `PERMISSION_NOT_GIVABLE` for any code |
| "İzinleri düzenle" | the row's `mayEdit` (false on the viewer's own post and for one who appoints only) | 403 `SELF_GRANT_REFUSED`, `PERMISSION_NOT_GIVABLE` |
| "Görevden al" | the row's `mayEnd` (one who appoints only: their own appointees); off, with "Önce bu kişinin atadığı N ders nazırını görevden alın.", while posts in the list name this person as appointer | 403 `NAZIR_NOT_APPOINTED_BY_YOU`, 409 `DISMISS_SEAT_HANDED_ON` |
| Kaydet on a picked person | not the viewer, not a current holder (refused in the dialog before sending) | 403 `SELF_GRANT_REFUSED`, 409 `COURSE_NAZIR_EXISTS` |

The dialog: the e-mail is searched on Enter or when the field is left, never per key (every search is
audited); text that is no address is not searched, and Enter on it says "Geçerli bir e-posta adresi
yazın.". The end is a `datetime-local` read on the viewer's clock (the zone from `GET /me`, a prop: nazar's
`useTimeZone()` is always Istanbul), refused before sending when not after now or half typed; an untouched
end goes back as the stored instant, seconds and all. On appointment an empty end is left out (no end); on
a change it is sent as `null`. A change that leaves the codes and the end as they were closes without a
request. A refusal keeps the dialog and words the code; `COURSE_NAZIR_EXISTS` / `COURSE_NAZIR_NOT_FOUND`
close it and read the list again. The dismissal starts on "Vazgeç"; `DISMISS_SEAT_HANDED_ON` closes it and
reads the list again, which then shows who must go first.

## Behaviour changes callers will see

1. `/ders/<id>/nazirlar` is a page, not "Bu sayfa henüz hazır değil.".
2. The başnazım opens any `/ders/<id>/…` page by its address, with "Medaris başnazımı" on the user row and
   the course in the picker for that page; before, a 404 (or `/erisim-yok` with no seat at all). He is
   audited as `systemAdmin: true`, and each such page writes, beyond what the page itself writes, one
   `course.content_read` row (the layout's `GET /courses/:id`) and one `course.roster_read` row (the
   menu's `GET /courses/:id/badge-counts`, `via: "badge-counts"`). Ders nazırları itself writes none
   (its list reads no content), so a view of it is those two rows; Ders ayarları reads the course again,
   so a view of it is three (two `course.content_read`, one `course.roster_read`).
3. Nobody else gains a scope; `/` behaves as before for everyone, the başnazım included.
4. `/hesap` and `/bildirimler` open to the başnazım with no seat (they sent him to `/erisim-yok`).
5. nizam's course overview shows the başnazım "Nazar’da aç" (nobody else, and only with `NAZAR_URL`).
6. In the dialog and the list, `course_nazir.assign` reads "Ders nazırı ata; atadığı kişiye izin
   veremez", not the account page's "… izin ya da grup ver, kendi izinlerinizi aşmadan": given, it
   appoints only (d-1001-07, MDRS-133 "No re-delegation"), and the API refuses any code from such a
   holder (403 `PERMISSION_NOT_GIVABLE`). The account page and the medrese pages keep their sentence.
7. 409 `COURSE_NAZIR_BARRED` (an account an open ban bars from the course) is worded "Bu kişi bu
   dersten yasaklı; ders nazırı yapılamaz."; `COURSE_NAZIR_HOLDS_SEAT` now names the Medaris post too.

## Decided by default, owner may overrule

1. **Single codes only, no course permission groups** (design rule 16): MDRS-270's text lists list,
   appoint, change and end; d-1004-11's course groups stay with MDRS-123.
2. **The başnazım enters nazar's course pages by address** (rule 26; d-1001-06 "medaris başnazımı
   nazir'e girebilir ama nazir bir partner portalı gibidir"), and nizam's course overview gives him the
   address (rule 27). `/` still sends him to `/erisim-yok`; no list of every course is built for him. A başmüderris who is not the course's müderris, and a köşk
   nazımı, are not admitted by this change (they appoint through the API; the köşk nazımı works in nizam).
3. **The forbidden state keeps nazar's existing body** (`Problems.forbidden`, which names the medrese's
   başmüderris), as the MDRS-247 course pages do (rule 28); a course-scope wording is a follow-up.
4. **The user row lists the başnazım's own roles when he holds any**, `SYSTEM_ADMIN` only when he holds
   none (as the design wrote it); the picker's entry for the course always says "Medaris başnazımı".
5. **The dialog refuses picking oneself for everyone**, the başnazım too, whom the API would let through
   (he holds every course code without a post).
6. **A change that changes nothing is not sent**, so it does not add an audit row.
7. **Turkish counts are plain** (`"{count} izin"`, `"İzin yok"`), as every Turkish message of nazar is;
   the design note's ICU plural forms are in en only.
8. **"Görevden al" waits on appointees the list shows** (counted in the browser from `grantedBy`); the
   API's 409 stays the decision.
9. **en and ar sentences exist** for parity; the owner asked for Turkish only for now.

## Where the design note and the code differed

- **The generated client cannot send `endsAt: null`.** `UpdateCourseNazirDto.endsAt` is required and
  nullable (API rule 13); the typescript-fetch generator writes `UpdateCourseNazirDtoToJSON` as
  `(value['endsAt'] as any).toISOString()` with no null check, so a plain `null` throws a `TypeError`
  before the request leaves. `changeCourseNazir` passes a stand-in (`NO_END`) whose `toISOString()` is
  `null`, which the client puts on the wire as `"endsAt": null`. A spec puts every body through the real
  serializer, and one pins the generator's behaviour, so it fails the day a regenerated client sends null
  itself and the stand-in can go. The API's own specs use supertest and could not see this.
- The design note asked for ICU plurals in Turkish; nazar has none (decision 7).
- `test/messages.spec.ts` needs an import line the design did not name (`courseNazirErrorKey`, after the
  `bans` import, where Biome's import order puts it); the settings branch's import goes on the same spot.
- The browser spec's "nothing else" check, like the design's browser step 3, expected "Bu sayfaya izniniz
  yok" on Müfredat for a person given `recording.manage` and `session.manage`; `PAGE_CODES.curriculum`
  holds `session.manage`, so Müfredat opens for them, and in serial mode every later scenario would have
  been skipped. The review moved it to Talebeler and Ders nazırları, which neither code opens (Celseler,
  Müfredat and Ders ayarları open on `session.manage`); the role is read off the user row, and the unknown
  course must show the 404 heading.

## Tests

New: `test/course-nazirs.spec.ts` (21), `test/course-nazirs-page.spec.tsx` (14),
`test/course-nazir-dialog.spec.tsx` (26), `test/course-nazir-actions.spec.ts` (10); 8 more in
`test/access.spec.tsx` (19 → 27). Changed: `test/messages.spec.ts` (the run-time keys of
`courseNazirErrorKey`, `CourseNazirs.dialog.endProblems.*`, `Roles.SYSTEM_ADMIN`; `CourseNazirs` among the
formatted sections; `date` among the values), `test/course-permissions.spec.ts` (`PAGE_CODES.nazirs`),
`test/placeholder.spec.tsx` (`nazirlar` among the built sections). Browser: `e2e/course-nazirs.e2e.ts`
with `e2e/course-admin-seed.ts`, run against a real stack (below).

### Red, then green

Each line: the source change put back or broken (one at a time, the file restored after), the spec run, the
tests that failed. Run by a script that replaces one exact snippet, runs the named specs and restores.

| Rule | Put back / broken | Red |
| --- | --- | --- |
| the başnazım's admission (N1) | `portal-layout.tsx` as on the base | `access.spec.tsx`: 4 failed (opens a course to the başnazım…; …beside the scopes he holds…; does not remember…; is the retry state…) |
| only `roles.systemAdmin` is admitted | `if (!me)` instead of `if (!me?.roles.systemAdmin)` | `access.spec.tsx`: is nothing, and reads no course, for anyone /me does not call the başnazım |
| the page's gate | gate forced open unless failed | page: 3 failed (izniniz yok for every code set…; …refused…; reads no list…) |
| no list read before the gate | list read whatever the gate | page: 4 failed |
| a failed read is not a refusal | `refused` true on any non-ok read | page: is the retry state, never 'izniniz yok'… |
| "Ders nazırı ata" on `mayAppoint` | drawn whenever the list is read | page: draws 'Ders nazırı ata' only when the list says… |
| "İzinleri düzenle" on `mayEdit` | drawn on every row | page: 2 failed (…the viewer's own row included; …only on the rows the caller may end…) |
| "Görevden al" on `mayEnd` | drawn on every row | page: 2 failed |
| "Görevden al" waits on appointees | never disabled | page: …holds it while the row has appointees |
| appointees counted | count forced to 0 | pure: counts the posts each person appointed…; page: …holds it… |
| the appointer's sentence | left out | page: says an appointer appoints only |
| `PAGE_CODES.nazirs` | `[course.edit]` | `course-permissions.spec.ts` names the codes…; page: 11 failed |
| search on Enter only | a search on every key | dialog: searches an exact address on Enter, never on a key… |
| self and holder refused before sending | `pickProblem` dropped | dialog: refuses the viewer and someone who holds a post here already… |
| a box the caller may not give is off | every box on | pure: leave a code the caller may not give off; dialog: leaves a box the caller may not give off |
| a held code can be unticked | only `grantable` on | pure: let a held code…; dialog: lets a held code… be unticked… |
| one who appoints only gets no box | boxes always | dialog: draws no box for one who appoints only… |
| no end on POST is left out | `endsAt: null` sent | dialog: 2 failed (appoints with the codes ticked and no end…; draws no box…); actions (POST always carries the key): leaves the end out… |
| `null` on PATCH | the held end sent instead | dialog: sends `null` when the end is emptied on purpose |
| a past end refused | only a half-typed end refused | dialog: refuses a moment not after now… |
| a half-typed end read again on save | the state alone | dialog: refuses an end left half typed, even when the field was never left |
| the viewer's zone | Istanbul fixed | dialog: reads the end on the viewer's own zone, not Istanbul's |
| a moved list closes the dialog | `listMoved` ignored | dialog: 2 failed (…became a ders nazırı meanwhile; …the post is gone) |
| an unchanged post is not written | check removed | dialog: closes without writing when nothing changed |
| the dismissal starts on Vazgeç | `initialFocus` removed | dialog: asks first… and starts on 'Vazgeç' |
| a handed-on refusal reads the list again | not closed | dialog: says who must go first… |
| `null` reaches the wire | plain `null` passed to the client | actions: sends `endsAt: null` when the end is taken away… (TypeError) |
| ids compared without case | case-sensitive | pure: 3 failed |
| every refusal key exists | a key not in the catalogue | `messages.spec.ts`: has a message for every key … build at run time |
| the route renders the page | `page.tsx` without a default export | page: names the tab 'Ders nazırları' and renders the page for its course |

### Review fixes on the integrated branch

Each test was seen red before its fix (the source change stashed, or the clock moved), then green.

| Finding | Test | Red |
| --- | --- | --- |
| `/hesap` and `/bildirimler`, linked from the admitted frame, sent the başnazım with no seat to `/erisim-yok`; a failed `GET /me` counted as "not the başnazım"; a malformed course id met the route's 400 and showed the retry state | `access.spec.tsx` "opens /hesap and /bildirimler to the başnazım who holds no seat …", "is the retry state there, not the no-access page, when /me could not be read", "is the retry state, never a verdict, when /me could not be read", "is the portal's 404 for an address that names no course id, as for anyone", "tells the pages outside any scope whether /me calls the caller the başnazım" | 5 failed, 27 passed (32) with `admin-scope.ts` and `portal-layout.tsx` as before |
| the course_nazir.assign box promised "izin ya da grup ver" | `course-nazirs.spec.ts` "says that a ders nazırı given course_nazir.assign appoints only, and gives nothing"; dialog "says that course_nazir.assign appoints only, as it does when given …" | 2 failed, 47 passed (49) |
| no sentence for 409 `COURSE_NAZIR_BARRED`; `COURSE_NAZIR_HOLDS_SEAT` left out the Medaris post | `course-nazirs.spec.ts` "is worded from its code" | 1 failed each time, before each sentence |
| three dialog tests compared the fixture's 2026-12-31 end with the real clock | the "'İzinleri düzenle'" describe holds the clock at 2026-10-05 | with a setup file moving the clock (outside the worktree's files): at 2027-01-01T09:00Z and 2028-03-01T09:00Z 3 failed, 23 passed (26); after, 26 passed (26) at both, and the nine MDRS-270 nazar spec files 151 passed (151) at both |
| nothing in nizam led the başnazım to these pages | nizam `kosk-overview.spec.tsx` "offers the başnazım the course's Ders nazırları in nazar, in a new tab (MDRS-270)", "is the course's Ders nazırları in nazar, for the başnazım alone", "is nothing while nazar's address is not set" | 3 failed, 49 passed (52) without the component and helper |
| the browser spec expected Müfredat to refuse a `session.manage` holder | `e2e/course-nazirs.e2e.ts` | — (run since, below) |

## Verified

- `./node_modules/.bin/vitest run` (whole nazar suite): **Test Files 57 passed (57), Tests 1226 passed
  (1226)**; on the base `1da339fe`: 53 files, 1147 tests. On the integrated branch after the review fixes
  (both pages): **Test Files 61 passed (61), Tests 1287 passed (1287)**; nizam 46 files, 759 passed (759)
  (one earlier run of the same tree showed 1 failed, 758 passed; the two runs after it were all green).
- `./node_modules/.bin/tsc --noEmit`: 0 errors (it covers `test/` and `e2e/` in nazar: checked with
  `--listFiles`). The speccheck config of port-common: 1 line, the known `vitest.config.ts` TS2307.
- `libs/i18n`: `tsc -b` exit 0; the lib has no test files. Key parity and formatting are
  `test/messages.spec.ts` (green above).
- `./node_modules/.bin/biome check` on every touched file: no errors. `node tools/ci/biome-ratchet.mjs`
  (root): errors 0, warnings 70, infos 21, as on the base.

## In a browser (5 October)

`e2e/course-nazirs.e2e.ts` ran on this branch against tedrisat (`nest build`, migrations at boot, its own
Postgres), nazar on `next build` + `next start` and real sign-ins on the dev realm. nazar ran on port 4012
with the session minted from the direct grant (`accounts.ts`): there is no `nazar-dev` secret for its
form. **15 passed (15)**, twice. It needs `MEDRESE_BASMUDERRIS`, `TALEBE`, `DERS_NAZIR` and
`SISTEM_ADMIN` (`MUDERRIS` and `MEDARIS_NAZIM` for two refusals) and skips without them.

What the scenarios show beyond the stubbed specs: the menu opens the page; an appointment with two codes
and an end stores the post and both grants at that instant (also for an account whose zone is not the
browser's: a probe with the müderris in New York stored 18:00 as 23:00Z); the appointee opens Celseler,
Müfredat, Ders kayıtları and Ders ayarları and is refused Talebeler, Sorular and Ders nazırları; a change
that leaves the end sends the stored instant back unchanged, and `NO_END` reaches the API as `null`; the
API's 409 `COURSE_NAZIR_EXISTS`, 404 `COURSE_NAZIR_NOT_FOUND`, 409 `COURSE_NAZIR_HOLDS_SEAT`, 409
`DISMISS_SEAT_HANDED_ON` and 403 `GRANT_EXCEEDS_GIVER` are each met from the page (a dialog opened before
the list or the course changed) and worded, and the list is read again where it moved; oneself, a holder
and an unknown address are refused in the dialog and by the API (403, 409, 404); a ders nazırı without
`course_nazir.assign` gets "izniniz yok" and 403, with it he appoints with no box, ends only his
appointee, and his own row has no button (the API's 403 `SELF_GRANT_REFUSED` and
`PERMISSION_NOT_GIVABLE` checked too); in a passive course (the medrese's başmüderris gone) the content
boxes are off; the başnazım opens the course by its address, every box open, himself refused. TALEBE
holds no other nazar scope: `/` sends him to `/erisim-yok` after the dismissal. nizam's "Nazar’da aç"
is checked in nizam/53 (`kosk-view.e2e.ts`, 15 passed (15)).

Red: each scenario was run against a build with one source change put back, and failed.

| Put back | Scenario | Failing assertion |
| --- | --- | --- |
| the dialog's `pickProblem` returns nothing | holder; oneself; the başnazım | `Expected substring: "Kendinizi ders nazırı yapamazsınız."` |
| the dialog ignores `listMoved` | appointed elsewhere | the dialog still open: `toHaveCount(0)`, received 1 |
| the dismissal does not read the list again on `DISMISS_SEAT_HANDED_ON` | the appointer | "Görevden al" not found (the dialog stays) |
| both route files render the placeholder | the menu | "Bu sayfa henüz hazır değil." count 1 |
| nizam's `nazarCourseHref` returns null | nizam/53 "Nazar’da aç" | element(s) not found |

The whole nazar suite on the same stack: 136 passed, 3 failed, 1 did not run (140). `account.e2e.ts:189`
(sign-out) needs nazar's own client secret; `course-scope.e2e.ts:121` looks for "Burada yükleme yoktur",
which MDRS-114 (#246, on main) replaced with the upload note for a müderris who may upload, the same on
main; the third was this file's own strict-mode match on Next's hidden streamed copy, fixed in the spec.

## Not verified

- nazar's real Keycloak form and sign-out: the loader has no `nazar-dev` secret, so every nazar session
  was minted from the direct grant on port 4012.
- A person who has a realm account but no row in the app's `users`: every test account has one.
