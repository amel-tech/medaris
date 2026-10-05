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
- the course read fails or is refused → the shell's retry state ("Görevleriniz okunamadı").
- anyone else → `none`, and today's path: 404 for a scope not theirs, `/erisim-yok` with none. No course
  is read for them.
- a course that does not exist → the portal's 404 (`readOnce`'s `notFound()`), as for anyone.
- a `/medrese/<id>` page is never opened this way.

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
   the course in the picker for that page; before, a 404 (or `/erisim-yok` with no seat at all). Each such
   page costs one more `GET /courses/:id`, a content read: for the başnazım it writes one more
   `course.content_read` audit row than the page itself does (he is audited as `systemAdmin: true`).
3. Nobody else gains a scope; `/` behaves as before for everyone, the başnazım included.

## Decided by default, owner may overrule

1. **Single codes only, no course permission groups** (design rule 16): MDRS-270's text lists list,
   appoint, change and end; d-1004-11's course groups stay with MDRS-123.
2. **The başnazım enters nazar's course pages by address only** (rule 26; d-1001-06 "medaris başnazımı
   nazir'e girebilir ama nazir bir partner portalı gibidir"). `/` still sends him to `/erisim-yok`; no
   list of every course is built for him. A başmüderris who is not the course's müderris, and a köşk
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
- The browser spec leaves out `/ders/<id>/ayarlar` from the "nothing else" check: on this branch it is still
  the placeholder. The settings branch's spec checks that page.

## Tests

New: `test/course-nazirs.spec.ts` (21), `test/course-nazirs-page.spec.tsx` (14),
`test/course-nazir-dialog.spec.tsx` (26), `test/course-nazir-actions.spec.ts` (10); 8 more in
`test/access.spec.tsx` (19 → 27). Changed: `test/messages.spec.ts` (the run-time keys of
`courseNazirErrorKey`, `CourseNazirs.dialog.endProblems.*`, `Roles.SYSTEM_ADMIN`; `CourseNazirs` among the
formatted sections; `date` among the values), `test/course-permissions.spec.ts` (`PAGE_CODES.nazirs`),
`test/placeholder.spec.tsx` (`nazirlar` among the built sections). Browser: `e2e/course-nazirs.e2e.ts`
(written, not run).

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

## Verified

- `./node_modules/.bin/vitest run` (whole nazar suite): **Test Files 57 passed (57), Tests 1226 passed
  (1226)**; on the base `1da339fe`: 53 files, 1147 tests.
- `./node_modules/.bin/tsc --noEmit`: 0 errors (it covers `test/` and `e2e/` in nazar: checked with
  `--listFiles`). The speccheck config of port-common: 1 line, the known `vitest.config.ts` TS2307.
- `libs/i18n`: `tsc -b` exit 0; the lib has no test files. Key parity and formatting are
  `test/messages.spec.ts` (green above).
- `./node_modules/.bin/biome check` on every touched file: no errors. `node tools/ci/biome-ratchet.mjs`
  (root): errors 0, warnings 70, infos 21, as on the base.

## Not verified

- `e2e/course-nazirs.e2e.ts` was not run (no stack, no dev realm here); it is for the browser phase. It
  needs `MEDRESE_BASMUDERRIS`, `TALEBE`, `DERS_NAZIR` and `SISTEM_ADMIN` accounts and skips without them.
- The page against the real API: every read and write here is a stub; the routes' behaviour is the API
  branch's e2e. The `NO_END` stand-in is checked against the generated serializer, not a running server.
- The başnazım's admission in a running app: the access spec stubs `getPortal`, `GET /me` and the course read.
- That the dev realm's TALEBE account holds no other nazar scope (the browser spec's last step on `/`
  assumes it).
