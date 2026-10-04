# MDRS-143 — Hide and restore under role model v2

Stacked on MDRS-142 (`taha/mdrs-142-me-effective-permissions`, tip `7533d432`), which carries MDRS-135 (#177),
MDRS-205 (#197) and MDRS-148. Wave 2; no migration (the reserved number stays unused: every column this needs,
`archived_at`, `archived_by`, `archived_level`, came with MDRS-135). Every number below sits next to the command
that printed it; commands run from the repository root unless a `cd` says otherwise.

The API half of hide and restore (köşk, medrese, course, the kademe, the Arşiv reads) was already built. What was
left were the holes that made the issue's own sentences untrue: a hidden köşk's courses stayed open to every
signed-in person, `week.hide` was asked by no route, the Arşiv decided restores by roles instead of the catalogue
(so a müderris could not bring back what they hid), a hidden medrese could not be seen by the people above it,
and the screens guessed at who may restore.

## Decided by the owner

- **Whoever hid something, or a level above, restores it** (3 Oct, the issue). Unchanged, and now true for weeks and
  sessions hidden by the course team.
- **d-1004-14** (answered): "Önerilen: müderris gizleyemez [bir kursu]; kayıtla düşürmek week.hide ister", his words
  "bu yetki müderrisler için default true olsun ama kapatılabilsin". Built: a müderris holds `week.hide` by role
  default (it is a course-scoped code), and a whole-course save that drops a week or a session needs it. **Not
  built: the switch that turns it off** (the owner is asked how, d-1004-26: the engine only adds permissions, it
  cannot subtract a role default, so "off" needs a per-course setting and a migration).
- **d-1004-12 and d-1004-13** (peer nazım management by permission, never leaving a scope with nobody) are
  MDRS-136/201's. This issue adds, removes and resigns no nazım, so there was nothing to apply; no file of that flow
  was touched.
- The plan note's rule that PR #203's `session.manage` check on `PUT /courses/:id` is kept apart: the `week.hide`
  check is its own method, `CourseService.assertMayDropFrom`, called right after the müderris-list check and
  before `assertMuderrisLinks`. **Whoever lands second reconciles the two** (the plan note says so; #203 adds a
  check for adding, moving and hiding a session, this one is for dropping a week or a session).

## Decided by default, owner may overrule

1. **A müderris hides no course** (dossier D1, default (a)). The plan note read d-1004-26's first option as
   "`week.hide` and course hiding default on for a müderris"; d-1004-14's chosen option says the opposite for a
   course, and no course-scoped code hides a course (`course.hide` is köşk-scoped, `madrasah.course_hide`
   medrese-scoped), so building it is a catalogue change this wave does not own. A müderris POSTing
   `/courses/:id/archive` is 403 (`week-hide.e2e.spec.ts`, "is refused to a müderris"). If the owner answers
   d-1004-26 with "course hiding on too", it is the `COURSE_HIDE_LADDER` plus one course-level code, in
   `archive/hide-codes.ts` and `permissions.ts`.
2. **`DELETE /lessons/:id` takes `week.hide` or `session.manage`** (D2), so no role loses a way to hide a session.
   For the same reason the session ladder's course rung is `[week.hide, session.manage]`: whoever can hide a
   session can bring it back. A week is `week.hide` alone.
3. **A whole-course save that drops a week or a session needs `week.hide`** (D3), refused whole with 403
   `COURSE_HIDE_FORBIDDEN` before anything is written. It changes nothing for a müderris, a köşk nazımı or a
   başmüderris (all hold it); only a ders nazırı granted `course.edit` without `week.hide` is now refused.
4. **A Medaris nazımı reads the köşk's and the medrese's Arşiv** by `platform.kosk_edit` / `platform.madrasah_edit`
   (D4); the platform-wide Arşiv, impact and the real delete stay the başnazım's. No platform code hides a course, a
   week or a session, so a Medaris nazımı reads those rows with `canRestore: false`; only the başnazım (and the
   köşk's or medrese's own levels) bring them back. A köşk is brought back by `platform.kosk_edit`.
5. **Week and session "Gizle" in nazir is a minimal page** (D5): `/ders/:id/mufredat` lists the live weeks and
   sessions with a button on each, behind a question; the editor is MDRS-123's and absorbs it. The menu entry is
   not gated by permission (nazir's nav is data, with no permission filter yet); the page offers the buttons to
   whoever opens the course and a refusal is a toast, as the API refuses it (tested).
6. **A medrese's real delete is audit-only** (D6): `madrasah.delete` is written in the same transaction, naming the
   actor, the medrese's name and handle, the nazırs whose role rows went and how many courses were left without a
   medrese. Deleting a shown medrese still works (`madrasah.e2e.spec.ts`); no "hidden first" rule.
7. **A deck's restore** rides the table as `kosk.manage` on its köşk: the same people as the old `isManager`
   (the köşk nazımı), now asked of the catalogue. MDRS-148 owns the rest of decks.
8. **The calendar feed keeps a hidden köşk's sessions for its own nazımı** (they are the people above it and still run
   it); everyone else's feed drops them.
9. **`canRestore` and `hiddenLevel` are on every Arşiv row** (köşk, medrese, course and the platform list), not
   only the medrese's, so no screen has to re-derive the rule. `hiddenLevel` is never null on a row: a row with no
   recorded level counts as the lowest level that could have hidden it.
10. **One extra read per `getDetail`**: whether the köşk is hidden is read from the köşk's own state with one join
    (`findHideState`). Not measured (`authz-query-count.e2e.spec.ts` pins no count).

## Who hides, who restores

`apps/tedrisat/src/archive/hide-codes.ts` is the table, as `ban-codes.ts` is for bans. `actingLevel` takes the highest
rung the caller holds on the item's resource (the başnazım is always the platform), and the kademe
(`hide-level.ts`, course < medrese < köşk < platform) then decides who may bring back what.

| Item | Asked on | Rungs (any code of a rung = acting at that level) |
| --- | --- | --- |
| köşk | the köşk | platform `platform.kosk_edit`, köşk `kosk.manage` |
| medrese | the medrese | platform `platform.madrasah_edit`, medrese `madrasah.hide` |
| course | the course | köşk `course.hide`, medrese `madrasah.course_hide` (no platform rung: the başnazım) |
| week | its course | course `week.hide`, köşk `course.hide`, medrese `madrasah.course_hide` |
| session | its course | course `week.hide` or `session.manage`, köşk `course.hide`, medrese `madrasah.course_hide` |
| deck | its köşk | köşk `kosk.manage` |

By role defaults (pinned in `test/unit/archive/hide-codes.spec.ts` against the engine's own computation): a müderris
acts at the course for a week and a session and at no level for a course; a köşk nazımı at the köşk for everything
of its köşk; a başmüderris at the medrese for a medrese's course, week and session (and at no level for a course the
köşk keeps for itself, nor for a köşk); a ders nazırı and a medrese nazırı hold nothing until granted
(`week.hide` on the course, `madrasah.course_hide` on the medrese); a Medaris nazımı acts at the platform for a
köşk or a medrese with the platform code and for no course.

Reading the Arşiv: the köşk's by `kosk.manage | platform.kosk_edit`, the medrese's by `madrasah.course_hide |
madrasah.hide | platform.madrasah_edit | madrasah.settings_edit` (`settings_edit` not narrowed), a course's
(`GET /courses/:id/archive`, new, with the tabs' counts and a `types` filter) by `week.hide`.

## What changed

- **A course is shown only while its köşk is.** `CourseService.getDetail`, the köşk's course list, the köşk page
  (`GET /kosks/:id`, which now asks `kosk.manage | platform.kosk_edit` of the engine instead of comparing
  `managerIds`), the enrolled list, the calendar feed, `GET /me` `teaches` and the public profile's course titles all
  read the köşk's own state. Not a cascade on purpose: a course opened after the hide is closed too, and a restore
  reopens exactly what it closed, with no column to keep in step. The people above are the köşk's nazımları
  (`course.hide` on the course by nesting), Medaris yönetimi holding `platform.kosk_edit` (verified to be found on a
  course resource) and the başnazım; a medrese is not above a köşk.
- **`week.hide` is wired.** `POST /courses/:courseId/weeks/:weekId/hide` (`hideCourseWeek`) hides the week and its live
  sessions at one instant, at the level the caller acts at, taking the course row lock first and bumping `version`
  (an editor holding the old one gets 409). A session hidden earlier keeps its own stamp, so restoring the week
  brings back exactly what went with it. `DELETE /lessons/:id` takes `week.hide | session.manage`.
- **Restore and the Arşiv are decided from the catalogue** (`ArchiveService` no longer knows `isManager`, `isNazir` or a
  role list). `POST /archive/:type/:id/restore` stays `@AuthzExempt` (which codes count depends on the item); the
  controller now sits behind `AuthzGuard` so the inventory names each route.
- **Audit.** Every hide and restore writes one row, in the hide's own transaction, of one shape: `<entity>.hide` /
  `<entity>.restore` (entity `course`, `week`, `lesson`, `kosk`, `madrasah`), with
  `details.title`, `details.level`, on a restore `details.hiddenLevel`, and `koskId`, `madrasahId`, `courseId`,
  `weekId` where they apply. New: `course.hide|restore` for `POST /courses/:id/archive|restore`, `week.hide`,
  `lesson.hide` (also for `DELETE /lessons/:id` and for the weeks and sessions a whole-course save drops, one row per
  week with the number of sessions that went and one per session dropped from a week that stays, `via:
  "course.replace"`), and every restore through the Arşiv. The existing `kosk.*`, `madrasah.*` and medrese-course
  rows keep their fields and gain `level`. MDRS-139 reads this shape.
- **Hidden medrese.** `GET /madrasahs/:id` and `/overview` open for the başmüderris (`madrasah.hide`), a Medaris
  nazımı holding `platform.madrasah_edit` and the başnazım; everyone else, anonymous included, keeps the 404. The
  medrese Arşiv response carries `madrasah: { hidden, hiddenAt, hiddenLevel, hiddenBy, canRestore }`, because the nazir
  page cannot read a hidden medrese anywhere else.
- **Screens that stop guessing.** Köşk, medrese and köşk-overview responses gain `hiddenLevel` and `canRestore`.
  nizam: "Geri al" on the köşk and medrese tables and in the Arşiv is each row's `canRestore`; where a higher level
  hid it the row says "Bunu {Medaris yönetimi} gizledi; yalnız o kademe ya da üstü geri alabilir." (new namespace
  `nizam.HideLevel`); `ARCHIVE_RESTORE_LEVEL` has its own message; the köşk page opens for a Medaris nazımı holding
  `platform.kosk_edit`, with the hide and a new "Köşkü geri al"; the copy that said only Medaris yönetimi restores is
  corrected. nazir: a hidden medrese shows a banner with "Medreseyi geri al" (or the sentence naming the level) and no
  "Medreseyi gizle"; `/ders/:id/arsiv` (weeks and sessions of one course, tabs, "Geri al" by the same rule);
  `/ders/:id/mufredat` (hide a week or a session).

## Behaviour changes the owner will notice

1. **A hidden köşk now closes its courses to signed-in people.** `GET /courses/:id`, `POST /courses/:id/enroll`,
   `GET /kosks/:id`, `GET /kosks/:id/courses` answer 404 to the enrolled talebe, a müderris, a başmüderris of a
   hosted medrese and a stranger (before: 200 to every signed-in caller). Their enrolled list, calendar feed,
   profile and `GET /me` `teaches` lose those courses. Restoring the köşk brings them back; nothing is deleted.
2. **A hidden köşk opens for a Medaris nazımı holding `platform.kosk_edit`** (before: 404 on `GET /kosks/:id`).
3. **A hidden medrese opens for its başmüderris, `platform.madrasah_edit` holders and the başnazım** (before: 404 to
   everyone, the başnazım included; `madrasah-directory.e2e.spec.ts` is changed for it).
4. **More people may restore, nobody fewer.** A müderris restores the week or session they hid (before: 403); a ders
   nazırı holding `week.hide` or `session.manage`, a medrese nazırı holding `madrasah.course_hide` (the course), a
   Medaris nazımı holding `platform.kosk_edit` (the köşk, through the Arşiv) likewise; each is refused what a higher
   level hid (`ARCHIVE_RESTORE_LEVEL`). Rows hidden before migration 0048 have no level: a week or session counts as
   course level, so the müderris of that course can bring back an old row a köşk nazımı hid. This is a loosening for
   old rows only.
5. **Arşiv reads open to more:** the köşk's to `platform.kosk_edit`, the medrese's to `madrasah.hide` and
   `platform.madrasah_edit` holders; `GET /courses/:id/archive` is new (`week.hide`). A non-manager asking
   `GET /kosks/:id/archive` still gets 403, now `AUTHZ_FORBIDDEN` from the guard instead of `ARCHIVE_FORBIDDEN`, and a
   missing köşk answers 404 first.
6. **A ders nazırı with `course.edit` and no `week.hide` can no longer drop a week or session in a whole-course save**
   (403 `COURSE_HIDE_FORBIDDEN`); they could before.
7. **`DELETE /lessons/:id` also opens to `week.hide` alone.**
8. **New routes:** `POST /courses/:courseId/weeks/:weekId/hide`, `GET /courses/:id/archive`. Response fields added:
   `ArchiveItemResponse.hiddenLevel` and `.canRestore`, `PaginatedMadrasahArchiveResponse.madrasah`,
   `hiddenLevel` and `canRestore` on the köşk and medrese directory items and the köşk overview. The generated
   client no longer has `MadrasahArchiveItemResponse` (it is `ArchiveItemResponse`).
9. **`DELETE /madrasahs/:id` writes a `madrasah.delete` audit row**; `course.hide|restore`, `week.hide|restore`,
   `lesson.hide|restore` rows appear where none were written, all under "Gizleme" / "Kalıcı silme" of the audit page
   with no change to `audit-types.ts`.
10. **nizam:** a köşk nazımı sees "Geri al" for a köşk they hid; the başnazım no longer sees it on a row it cannot
    restore (none exists today). **nazir:** two new pages, a banner, corrected copy.
11. A medrese course hosted in a hidden köşk is closed to its başmüderris and müderrisler too (the medrese is not
    above the köşk).

## Tests, and each one failing with the source change put back

Criteria of the issue and the dossier's table, one by one. "Red" is the failing test seen with the change put back,
from a run of the named spec (one change at a time, or several together where the failing test names the change,
then reverted; the tree was byte-identical to the commit afterwards).

| Criterion | Test | Red with the change put back |
| --- | --- | --- |
| köşk nazımı hides their köşk (route, level, audit) | `kosk-admin.e2e.spec.ts`, `hide-kademe.e2e.spec.ts` (existing); `hide-restore-catalogue.e2e.spec.ts` "writes the hide and restore audit rows with the level" | audit row without the level: the new rows fail with `recordHide` off |
| its courses leave every list | `hidden-kosk.e2e.spec.ts` "leaves every list" (enrolled, upcoming sessions, `GET /me`, profile), "drops the sessions from the feed…" | enrolled filter off: "the talebe's enrolled courses"; `findTaughtBy` join off: "what the müderris teaches"; profile join off: "the course titles"; feed filter off: the feed test; upcoming sessions were already filtered (`schedule.repository`), so that test passes without any change of mine |
| …and answer 404 to talebe | `hidden-kosk.e2e.spec.ts` "closes the köşk's courses to the enrolled talebe, a stranger, a müderris and an anonymous visitor", "refuses to enroll…", "closes a course opened after…" | the hidden-köşk check out of `getDetail`: those three and "stays closed to a Medaris nazımı without the code…" and "keeps the köşk closed…" fail |
| the köşk nazımı restores it | `hidden-kosk.e2e.spec.ts` (every read returns after the restore), `kosk-admin.e2e.spec.ts` | covered by the same |
| a başmüderris hides their medrese and cannot hide or restore a köşk | `hide-restore-catalogue.e2e.spec.ts` "who may not hide" (both halves, and a köşk nazımı cannot hide a medrese) | pins behaviour the engine already had: no change to put back (`kosk.manage` is köşk-scoped and absent from the başmüderris default); the test fails if the code is ever added to its defaults |
| a müderris hides a week | `week-hide.e2e.spec.ts` "a müderris hides a week" (level `course`, one instant, earlier session keeps its stamp, version bump, talebe's read, no row deleted, audit) | route `@Authz` back to `course.edit`: "refuses a ders nazırı granted only course.edit", "lets the köşk's nazımı, the başnazım and a ders nazırı…" fail; `week.hide` gone from the week ladder: "lets the müderris restore what they hid…" fails |
| …and cannot hide the course | `week-hide.e2e.spec.ts` "hiding the course itself" | a müderris has no course permission to take away (default 1); the medrese nazırı half fails with the medrese rung out of `COURSE_HIDE_LADDER` |
| nothing deletes a row | `hidden-kosk.e2e.spec.ts` "deletes nothing", `week-hide.e2e.spec.ts` "deletes no row" | row counts before, while hidden, after restore |
| a hidden medrese's page stays open to the people above | `hide-restore-catalogue.e2e.spec.ts` "keeps a hidden medrese's page open…" | `findOpenById` and `findOverview` back to 404-for-all: that test fails (each half alone) |
| week/session restore by whoever hid it or above | `week-hide.e2e.spec.ts` "bringing it back…" (müderris restores, refused what the köşk hid with `ARCHIVE_RESTORE_LEVEL` naming both levels, stranger 403 `ARCHIVE_FORBIDDEN`, ders nazırı, `session.manage`) | `session.manage` out of the session rung: "lets whoever hid a session with session.manage…"; `DELETE /lessons/:id` back to `session.manage`: "is open to week.hide alone…" |
| Arşiv and restore from the catalogue | `test/unit/archive/hide-codes.spec.ts` (15), `archive.service.spec.ts`; `hide-restore-catalogue.e2e.spec.ts` "a köşk's Arşiv", "a course's Arşiv", "a medrese's Arşiv…" | `platform.kosk_edit` out of the köşk Arşiv codes; `platform.madrasah_edit` out of the medrese codes; the course Arşiv code widened to `course.view`; `hideTargetOf` for a köşk returned null; `canRestore` forced true on the köşk table and the overview; the medrese platform rung out: each fails the test named for it |
| every hide and restore is audited | `week-hide.e2e.spec.ts` "every hide and restore leaves one row of the right action", "writes course.hide and course.restore…", "writes one week.hide…", "writes one lesson.hide…"; `hide-restore-catalogue.e2e.spec.ts` | the restore audit off: "writes course.hide and course.restore audit rows for both routes" and "counts each act once" fail |
| real delete is audited | `hide-restore-catalogue.e2e.spec.ts` "the medrese's real delete" | `recordDeletion` off: fails |
| whole-course save needs `week.hide` | `week-hide.e2e.spec.ts` "a whole-course save that drops a week or a session" (403 before any write, a save that drops nothing passes, the müderris drops and restores, 409 on an old version) | `assertMayDropFrom` out of `replace`: "is refused to a ders nazırı granted only course.edit…" fails |
| nizam / nazir screens | `apps/nizam/test` (`kosk-views`, `madrasahs`, `archive`, `kosk-entry`, `kosk-page`, `kosk-overview`, `kosk-admin`), `apps/nazir/test` (`archive-page`, `archive`, `actions`, `course-archive`, `curriculum-hide`, `messages`) | the directory gate back to `chief`; the madrasah and Arşiv rows gated by nothing; `koskEntry` without the held code; the management page's restore ungated; both error maps without `ARCHIVE_RESTORE_LEVEL`; the nazir banner off; `HideMadrasah` shown while hidden; the weeks' hide calling the session action; the course Arşiv without `types`: each fails 1 to 5 of the named specs |

Hiding a button is not protection: every action a screen offers has a tested API refusal (the 403 rows above), and a
nazir "Gizle" that the API refuses is a toast (`curriculum-hide.spec.tsx`).

```
$ cd apps/tedrisat && /home/taha/medaris-wt/.bin/e2e-slot.sh ./node_modules/.bin/vitest run test/unit \
    test/e2e/{hide-restore-catalogue,week-hide,hidden-kosk,kosk-admin,kosk-overview,kosk,kosk-managers,kosk-grants,hosting,\
    madrasah,madrasah-directory,madrasah-archive,madrasah-course,madrasah-portal,archive,hide-kademe,hide-instead-of-delete,\
    authz-route-inventory,authz-engine,course,course-staff,course-team,muderris-assignments,calendar-feed,schedule,profile,\
    user,session,session-batch,lesson-calendar,recordings,live-stream,nizam-dashboard,badge-counts,ban,public-pages,\
    discover,inactive-scope,archived-level-migration,throttler}.e2e.spec.ts
 Test Files  106 passed (106)
      Tests  1698 passed (1698)
   Duration  628.89s
$ ./node_modules/.bin/vitest run test/e2e/archive.e2e.spec.ts test/e2e/hide-restore-catalogue.e2e.spec.ts \
    test/e2e/authz-route-inventory.e2e.spec.ts test/e2e/madrasah-archive.e2e.spec.ts   # after the last cleanup (ArchiveModule imports)
 Test Files  4 passed (4)
      Tests  67 passed (67)
$ cd apps/nizam && ./node_modules/.bin/vitest run
 Test Files  40 passed (40)
      Tests  675 passed (675)
$ cd apps/nazir && ./node_modules/.bin/vitest run
 Test Files  37 passed (37)
      Tests  694 passed (694)
$ pnpm exec nx run-many -t typecheck --projects=nizam-web,nazir-web,tedris-web,landing-web   # builds libs first
 Successfully ran target typecheck for 2 projects and 8 tasks they depend on   (twice: nizam-web, nazir-web; tedris-web, landing-web)
$ cd apps/tedrisat && tsc --noEmit -p tsconfig.json     # rc 0
$ biome check apps/tedrisat apps/nizam apps/nazir libs/i18n     # no fixes, only warnings that were there
$ pnpm run openapi:tedrisat && node tools/ci/assert-openapi-spec-fresh.mjs
✔ openapi spec freshness: 169 paths, identical to what the exporter writes today (info.version excluded by design).
```

New specs: `hidden-kosk.e2e.spec.ts`, `week-hide.e2e.spec.ts`, `hide-restore-catalogue.e2e.spec.ts`, `test/unit/archive/hide-codes.spec.ts`
(new), `archive.service.spec.ts` (rewritten for the catalogue ladder); nizam `kosk-views`, `madrasahs`, `archive`,
`kosk-entry`, `kosk-page`, `kosk-overview`, `kosk-admin`; nazir `course-archive.spec.tsx` and `curriculum-hide.spec.tsx`
(new), `archive-page`, `archive`, `actions`. Existing specs edited only where behaviour forced it:
`madrasah-directory.e2e.spec.ts` (a hidden medrese is open to the başnazım), `madrasah.e2e.spec.ts` (the delete takes
the actor), `nizam-kosk-buttons.spec.ts` (`DELETE /lessons/:id` carries two codes).

Red-then-green, run on the new e2e specs with the source change put back and then reverted (`git status` clean
after):

```
batch A (10 changes at once, 3 specs):   21 failed of 61  (hidden-kosk, week-hide, hide-restore-catalogue)
batch B (enrolled, profile, taught-by):  3 failed of 14   (hidden-kosk, one test per list)
batch C (6 changes, 2 specs):            10 failed of 50  (ladders, lesson route, hide route, directory canRestore)
batch D (5 changes, 1 spec):             6 failed of 18   (Arşiv read codes, overview, medrese page, kosk target)
nizam (7 changes, 7 specs):              8 failed of 183
nazir (5 changes, 4 specs):              11 failed of 79
```

The route inventory (`authz-route-inventory.txt`) changed by 18 lines (10 added, 8 removed), read one by one: the four platform Arşiv routes and the
restore route went from "no AuthzGuard" to `exempt`; `GET /kosks/:id/archive` and `GET /madrasahs/:id/archive`
name their codes; `GET /courses/:id/archive` and `POST /courses/:courseId/weeks/:weekId/hide` are new;
`DELETE /lessons/:id` is `week.hide | session.manage`.

## What was not verified

- **The Playwright specs** (`apps/nizam/e2e`, `apps/nazir/e2e`) need a running stack with Keycloak and were not run; two
  were edited to match the new copy and buttons (`nazir/e2e/archive.e2e.ts`, `nizam/e2e/kosks.e2e.ts`).
- **The whole tedrisat suite** is the integrator's; only the specs listed above were run, with the slot wrapper.
- Real Keycloak, Bunny and YouTube are not reachable from here; nothing in this issue needs them.
- **Writes into a hidden köşk's courses** by a müderris through the session-level routes (`POST …/lessons`,
  `PATCH /lessons/:id`) do not go through `getDetail` and are not closed by the hidden köşk (they were not before);
  the whole-course `PUT` is (it reads `getDetail`). Not changed here.
- **The medrese's own course list** (`GET /madrasahs/:id/courses`) still lists a hosted course of a hidden köşk to the
  başmüderris; the course itself is closed to them. Not changed here.
- **The nazir menu is not gated by permission**; a person without `week.hide` sees the Müfredat and Arşiv entries and
  the API's refusal.
- **Nothing was timed**: the extra `findHideState` read per course detail is not measured.

## For MDRS-208 and MDRS-123

- `week.hide` is now asked by `DELETE /lessons/:id`, `POST /courses/:courseId/weeks/:weekId/hide`,
  `GET /courses/:id/archive`, the whole-course save and the week/session ladders. The "grantable codes nobody asks"
  list of `docs/migration/mdrs-135-permission-catalogue.md` loses it; that file is MDRS-208's and was not edited here.
- `/ders/:id/mufredat` is a stand-in for MDRS-123's editor: its address and menu entry are the editor's to take over.
