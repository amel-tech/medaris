# MDRS-143 — Hide and restore under role model v2

Stacked on MDRS-142 (`taha/mdrs-142-me-effective-permissions`), which carries MDRS-135 (#177) at its reviewed head
`d19b5148`, MDRS-205 (#197), #214 to #217 and MDRS-148. Wave 2; no migration (the reserved number stays unused: every column this needs,
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
  default (it is a course-scoped code) and `POST /courses/:courseId/weeks/:weekId/hide` asks it. **Not built: the
  switch that turns it off** (the owner is asked how, d-1004-26: the engine only adds permissions, it cannot subtract
  a role default, so "off" needs a per-course setting and a migration). **Not built either: `week.hide` on a
  whole-course save that drops a week.** The reviewed MDRS-135 decides that save: dropping a session needs
  `session.manage` (`CourseService.assertMayChangeSessions`), dropping a week with no session in it needs only
  `course.edit`, and `week.hide` is a rung of the restore ladders; see "Decided by default".
- **d-1004-12 and d-1004-13** (peer nazım management by permission, never leaving a scope with nobody) are
  MDRS-136/201's. This issue adds, removes and resigns no nazım, so there was nothing to apply; no file of that flow
  was touched.
- The plan note's rule that PR #203's `session.manage` check on `PUT /courses/:id` is kept apart is moot: the
  reviewed MDRS-135 carries that check (`assertMayChangeSessions`, `session-work.ts`) and it is the only check a
  whole-course save makes on the weeks and sessions it drops.

## Decided by default, owner may overrule

1. **A müderris hides no course** (dossier D1, default (a)). The plan note read d-1004-26's first option as
   "`week.hide` and course hiding default on for a müderris"; d-1004-14's chosen option says the opposite for a
   course, and no course-scoped code hides a course (`course.hide` is köşk-scoped, `madrasah.course_hide`
   medrese-scoped, `platform.course_hide` platform-scoped), so building it is a catalogue change this wave does not
   own. A müderris POSTing `/courses/:id/archive` is 403 (`week-hide.e2e.spec.ts`, "is refused to a müderris"). If
   the owner answers d-1004-26 with "course hiding on too", it is `COURSE_HIDE_LADDER` plus one course-level code,
   in `archive/hide-level.ts` and `permissions.ts`.
2. **`DELETE /lessons/:id` takes `week.hide` or `session.manage`** (D2), so no role loses a way to hide a session.
   The reviewed ladder agrees: its course rung for a session is `[week.hide, session.manage]`, so whoever can hide
   a session can bring it back. A week is brought back by that rung too when its restore brings sessions back, and by
   `course.edit` as well when it brings none (`SECTION_HIDE_LADDER`, `BARE_WEEK_HIDE_LADDER`, decided under the
   week's row lock).
3. **A whole-course save that drops a week or a session asks what the reviewed MDRS-135 decided, no more.** A
   session (alone, or inside a dropped week) needs `session.manage`; a week with no session in it needs only
   `course.edit`. d-1004-14 reads "kayıtla düşürmek week.hide ister"; the first pass of this issue built that (403
   `COURSE_HIDE_FORBIDDEN`) and the merge with the reviewed MDRS-135 dropped it, since the two decide the same save
   and the reviewed one wins. Putting it back is one check in `CourseService.replace`: a ders nazırı holding
   `course.edit` alone would then lose the bare-week drop.
4. **A Medaris nazımı reads the köşk's and the medrese's Arşiv** by `platform.kosk_edit` / `platform.madrasah_edit`
   (D4); the platform-wide Arşiv, impact and the real delete stay the başnazım's. A Medaris nazımı brings back a
   course, a week or a session only by `platform.course_hide` (the platform rung of the reviewed ladders), so a
   reader holding only `platform.kosk_edit` sees those rows with `canRestore: false`. A köşk is brought back on its
   own route (`POST /kosks/:id/restore`, `platform.kosk_edit`); the Arşiv's restore leaves a köşk and a medrese to
   the başnazım.
5. **Week and session "Gizle" in nazir is a minimal page** (D5): `/ders/:id/mufredat` lists the live weeks and
   sessions with a button on each, behind a question; the editor is MDRS-123's and absorbs it. The menu entry is
   not gated by permission (nazir's nav is data, with no permission filter yet); the page offers the buttons to
   whoever opens the course and a refusal is a toast, as the API refuses it (tested).
6. **A medrese's real delete is audit-only** (D6): `madrasah.delete` is written in the same transaction, naming the
   actor, the medrese's name and handle, the nazırs whose role rows went and how many courses were left without a
   medrese. Deleting a shown medrese still works (`madrasah.e2e.spec.ts`); no "hidden first" rule.
7. **A deck's restore** is its köşk's nazımı's (`KoskService.isManager`, as the reviewed MDRS-135 decides it); the
   köşk archive row says so in `canRestore`. MDRS-148 owns the rest of decks.
8. **The calendar feed keeps a hidden köşk's sessions for its own nazımı** (they are the people above it and still run
   it); everyone else's feed drops them.
9. **`canRestore` and `hiddenLevel` are on every Arşiv row** (köşk, medrese, course and the platform list), not
   only the medrese's, so no screen has to re-derive the rule. `hiddenLevel` is never null on a row: a row with no
   recorded level counts as the lowest level that could have hidden it.
10. **One extra read per signed-in route on a course, and per `getDetail`**: whether the köşk is hidden is read from
    the köşk's own state with one join (`findHideState`), by `AuthzGuard` in front of the decision. Not measured
    (`authz-query-count.e2e.spec.ts` pins no count).
11. **The closure is one rule in the guard, and it answers 404, not 403** (review of the first pass found it only in
    `getDetail`). `RoleResolver.closure` says a course of a hidden köşk is closed and which codes keep it open
    (`course.hide`, `platform.kosk_edit`, the başnazım always); `AuthzGuard` asks it of every signed-in caller before
    it decides, so a route added later is closed too and a müderris is told what a stranger is told. A 403 would
    have confirmed to the müderris that the course exists. Services that decide without a guard on the course
    (`ArchiveService.restore` of a course, week or session, the two medrese routes that take a course id, `getDetail`)
    ask the same thing before they write.
12. **Which lists leave a hidden köşk's courses, beyond the first pass** (review): the public medrese page
    (`GET /madrasahs/:id/overview`), the başmüderris's course list and the Pano's course count and upcoming sessions.
    The Pano's talebe list and pending applications are not narrowed (see "What was not verified"). `GET /kosks/:id/decks`
    answers the köşk's own 404. (The dossier said the hosting list already filters hidden köşks: true of the hosting
    list, not of `findCourseList` or `findOverview`.)

## Where the reviewed MDRS-135 decides the same thing

The reviewed MDRS-135 (#177) built the kademe, the restore decision and the hidden-course read on its own pieces
while this issue built them on the first head. Where both decide one thing, the reviewed code decides it and this
issue builds on it:

- **The ladders and who acts at which level** are `hide-level.ts`'s (`COURSE_HIDE_LADDER` with its platform rung,
  `SECTION_HIDE_LADDER`, `BARE_WEEK_HIDE_LADDER`); this issue added `KOSK_HIDE_LADDER` and `MADRASAH_HIDE_LADDER` beside
  them and `mayRestoreHidden`, the question a screen asks, built from `actingLevel` and `mayRestoreAt`. There is no
  second table.
- **A restore** is `ArchiveService.restoreRoute` and the repository's row-locked kademe check, for a course, a week, a
  session and a deck; `POST /courses/:id/restore` and the Arşiv answer alike (`restoreCourseIn`). This issue adds the
  closure's `assertOpen` in front of it and `canRestore` and `hiddenLevel` on every row.
- **What is recorded:** the reviewed rows for `course.hide|restore` and `<type>.restore` (title, level, `fromArchive`)
  are kept as they are; this issue's `recordHide` writes only the rows no route wrote (week, session, köşk, medrese).
- **A whole-course save** asks `session.manage` for a dropped session and `course.edit` alone for a dropped week with
  none (decided by default above).
- **A köşk's Arşiv** is read by the route's `@Authz` (this issue's addition, `kosk.manage | platform.kosk_edit`), so
  `ArchiveService` no longer asks `isManager` to read it; it asks it only for a deck's restore.

## Who hides, who restores

The ladders live in one table, `apps/tedrisat/src/archive/hide-level.ts`, the shape `ban-codes.ts` gave the bans; the
reviewed MDRS-135 drew the course, week and session ladders there and this issue adds the köşk's and the medrese's.
`actingLevel` takes the highest rung the caller holds on the item's resource (the başnazım is always the platform),
and the kademe (`mayRestoreAt`, course < medrese < köşk < platform) then decides who may bring back what.
`mayRestoreHidden` is the same question asked for a screen (`canRestore`).

| Item | Asked on | Rungs (any code of a rung = acting at that level) |
| --- | --- | --- |
| köşk | the köşk | platform `platform.kosk_edit`, köşk `kosk.manage` (`KOSK_HIDE_LADDER`) |
| medrese | the medrese | platform `platform.madrasah_edit`, medrese `madrasah.hide` (`MADRASAH_HIDE_LADDER`) |
| course | the course | platform `platform.course_hide`, köşk `course.hide`, medrese `madrasah.course_hide` (`COURSE_HIDE_LADDER`) |
| session, and a week that brings sessions back | its course | the course's rungs, and course `week.hide` or `session.manage` (`SECTION_HIDE_LADDER`) |
| a week that brings none back | its course | the same, and course `course.edit` (`BARE_WEEK_HIDE_LADDER`) |
| deck | its köşk | its köşk's nazımı (`KoskService.isManager`) |

By role defaults (pinned in `test/unit/archive/hide-codes.spec.ts` against the engine's own computation): a müderris
acts at the course for a week and a session and at no level for a course; a köşk nazımı at the köşk for everything
of its köşk; a başmüderris at the medrese for a medrese's course, week and session (and at no level for a course the
köşk keeps for itself, nor for a köşk); a ders nazırı and a medrese nazırı hold nothing until granted
(`week.hide` on the course, `madrasah.course_hide` on the medrese); a Medaris nazımı acts at the platform for a
köşk or a medrese with `platform.kosk_edit` or `platform.madrasah_edit`, for a course, week and session with
`platform.course_hide`, and for nothing else.

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
  course resource) and the başnazım; a medrese is not above a köşk. **The closure is not a check in `getDetail`
  alone but `TedrisatRoleResolver.closure`, asked by `AuthzGuard` before every signed-in decision on a course** (the
  roster, the live streams, the course Arşiv, week hide, every lesson route, enroll, the lot), so a müderris is told
  404 on all of them; the Arşiv restore of a course, week or session and the medrese's `PUT …/muderrises` and
  `POST …/hide` ask it themselves before they write. The medrese's public page, its course list and Pano, and
  `GET /kosks/:id/decks` leave a hidden köşk's courses too.
- **`week.hide` is wired.** `POST /courses/:courseId/weeks/:weekId/hide` (`hideCourseWeek`) hides the week and its live
  sessions at one instant, at the level the caller acts at, taking the course row lock first and bumping `version`
  (an editor holding the old one gets 409). A session hidden earlier keeps its own stamp, so restoring the week
  brings back exactly what went with it. `DELETE /lessons/:id` takes `week.hide | session.manage`.
- **Restore and the Arşiv are decided from the catalogue** (`ArchiveService` knows `isManager` only for a deck, as the
  reviewed MDRS-135 decides it, and no longer `isNazir` or a role list). Reading a köşk's, a medrese's or a course's
  Arşiv is the route's `@Authz`. `POST /archive/:type/:id/restore` stays `@AuthzExempt` (which codes count depends on
  the item); the controller now sits behind `AuthzGuard` so the inventory names each route.
- **Audit.** Every hide and restore writes one row, in the change's own transaction, with `<entity>.hide` /
  `<entity>.restore` as its action and `details.title` and `details.level` (the level the actor acted at). The
  reviewed MDRS-135 already wrote `course.hide|restore` for the course's own routes (`{title, level}`) and
  `<type>.restore` for every restore through the Arşiv (`{title, level, fromArchive: true}` and where it sat, the
  entity `session` for a session); this issue adds the rows no route wrote: `week.hide` (`POST …/weeks/:weekId/hide`,
  and one per week a whole-course save drops, with the number of sessions that went), `session.hide` (for `DELETE
  /lessons/:id` and for each session a whole-course save drops from a week that stays, `via: "course.replace"`),
  and the köşk's and the medrese's own hide and restore rows, which keep their fields and gain `title`, `level`
  and, on a restore, `hiddenLevel`. They are written by `recordHide` (`archive/hide-audit.ts`) and carry `koskId`,
  `madrasahId`, `courseId` and `weekId` where they apply. MDRS-139 reads this shape.
- **Hidden medrese.** `GET /madrasahs/:id` and `/overview` open for the başmüderris (`madrasah.hide`), a Medaris
  nazımı holding `platform.madrasah_edit` and the başnazım; everyone else, anonymous included, keeps the 404. The
  medrese Arşiv response carries `madrasah: { hidden, hiddenAt, hiddenLevel, hiddenBy, canRestore }`, because the nazir
  page cannot read a hidden medrese anywhere else.
- **Screens that stop guessing.** Köşk, medrese and köşk-overview responses gain `hiddenLevel` and `canRestore`.
  nizam: "Geri al" on the köşk and medrese tables and in the Arşiv is each row's `canRestore`; where a higher level
  hid it the row says "Bunu {Medaris yönetimi} gizledi; yalnız o kademe ya da üstü geri alabilir." (new namespace
  `nizam.HideLevel`); `ARCHIVE_RESTORE_LEVEL` has its own message; the köşk page opens for a Medaris nazımı holding
  `platform.kosk_edit`, with the hide and a new "Köşkü geri al"; the copy that said only Medaris yönetimi restores is
  corrected. nazir: a hidden medrese shows a banner with "Medreseyi geri getir" (or the sentence naming the level) and no
  "Medreseyi gizle"; `/ders/:id/arsiv` (weeks and sessions of one course, tabs, "Geri al" by the same rule);
  `/ders/:id/mufredat` (hide a week or a session).

## Behaviour changes the owner will notice

1. **A hidden köşk now closes its courses to signed-in people, on every route.** `GET /courses/:id`,
   `POST /courses/:id/enroll`, `GET /kosks/:id`, `GET /kosks/:id/courses`, `GET /kosks/:id/decks` and every other
   route on one of its courses (roster, live streams, the course Arşiv, week and lesson writes, an Arşiv restore of
   its week or session) answer 404 to the enrolled talebe, a müderris, a başmüderris of a hosted medrese and a
   stranger (before: 200 to every signed-in caller). Their enrolled list, calendar feed, profile and `GET /me`
   `teaches` lose those courses, and so do the public medrese page, the başmüderris's course list and the Pano's
   course count and upcoming sessions. Restoring the köşk brings them back; nothing is deleted. A başmüderris who
   archives or restores a hosted course of a hidden köşk is told 404 before anything is written (the first pass
   wrote, then answered 404).
2. **A hidden köşk opens for a Medaris nazımı holding `platform.kosk_edit`** (before: 404 on `GET /kosks/:id`).
3. **A hidden medrese opens for its başmüderris, `platform.madrasah_edit` holders and the başnazım** (before: 404 to
   everyone, the başnazım included; `madrasah-directory.e2e.spec.ts` is changed for it).
4. **More people may restore, nobody fewer.** A müderris restores the week or session they hid, and so does a ders
   nazırı holding `week.hide` or `session.manage` (the reviewed ladders; before this issue's `week.hide` route and
   `DELETE /lessons/:id` change, only the session route could have hidden them); each is refused what a higher level
   hid (`ARCHIVE_RESTORE_LEVEL`). A Medaris nazımı holding `platform.kosk_edit` reads the köşk's Arşiv and brings a
   hidden köşk back on its own route. Rows hidden before migration 0048 have no level: a week or session counts as
   course level, so the müderris of that course can bring back an old row a köşk nazımı hid. This is a loosening for
   old rows only.
5. **Arşiv reads open to more:** the köşk's to `platform.kosk_edit`, the medrese's to `madrasah.hide` and
   `platform.madrasah_edit` holders; `GET /courses/:id/archive` is new (`week.hide`). A non-manager asking
   `GET /kosks/:id/archive` still gets 403, now `AUTHZ_FORBIDDEN` from the guard instead of `ARCHIVE_FORBIDDEN`, and a
   missing köşk answers 404 first.
6. **`DELETE /lessons/:id` also opens to `week.hide` alone.**
7. **New routes:** `POST /courses/:courseId/weeks/:weekId/hide`, `GET /courses/:id/archive`. Response fields added:
   `ArchiveItemResponse.hiddenLevel` and `.canRestore`, `PaginatedMadrasahArchiveResponse.madrasah`,
   `hiddenLevel` and `canRestore` on the köşk and medrese directory items, the köşk overview and the köşk's course
   roster rows (`KoskCourseRowResponse`). The generated
   client no longer has `MadrasahArchiveItemResponse` (it is `ArchiveItemResponse`).
8. **`DELETE /madrasahs/:id` writes a `madrasah.delete` audit row**; `week.hide` and `session.hide` rows appear where
   none were written, all under "Gizleme" / "Kalıcı silme" of the audit page with no change to `audit-types.ts`.
9. **nizam:** a köşk nazımı sees "Geri al" for a köşk they hid; the başnazım no longer sees it on a row it cannot
    restore (none exists today). **nazir:** two new pages, a banner, corrected copy.
10. A medrese course hosted in a hidden köşk is closed to its başmüderris and müderrisler too (the medrese is not
    above the köşk), on every route that names the course; the medrese's Arşiv still lists its hidden rows (below).
11. **nizam Dersler table:** "Geri al" on a hidden course is the row's `canRestore`; where a higher level hid it the
    row says so, and a refusal for the level reads as that sentence. `KoskCourseRowResponse` gains `hiddenLevel` and
    `canRestore`.

## Tests, and each one failing with the source change put back

Criteria of the issue and the dossier's table, one by one. "Red" is the failing test seen with the change put back,
from a run of the named spec. The merge with the reviewed MDRS-135 replaced some of the code the first pass
mutated (the ladders and the restore decision are MDRS-135's now), so the rows name the change that still exists;
the mutation runs after the merge are listed below the table.

| Criterion | Test | Red with the change put back |
| --- | --- | --- |
| köşk nazımı hides their köşk (route, level, audit) | `kosk-admin.e2e.spec.ts`, `hide-kademe.e2e.spec.ts` (existing); `hide-restore-catalogue.e2e.spec.ts` "writes the hide and restore audit rows with the level" | audit row without the level: the new rows fail with `recordHide` off |
| its courses leave every list | `hidden-kosk.e2e.spec.ts` "leaves every list" (enrolled, upcoming sessions, `GET /me`, profile), "drops the sessions from the feed…" | enrolled filter off: "the talebe's enrolled courses"; `findTaughtBy` join off: "what the müderris teaches"; profile join off: "the course titles"; feed filter off: the feed test; upcoming sessions were already filtered (`schedule.repository`), so that test passes without any change of mine |
| …and answer 404 to talebe | `hidden-kosk.e2e.spec.ts` "closes the köşk's courses to the enrolled talebe, a stranger, a müderris and an anonymous visitor", "refuses to enroll…", "closes a course opened after…" | the hidden-köşk closure out of `TedrisatRoleResolver.closure` (it is what `getDetail` and the guard both ask): those three and "stays closed to a Medaris nazımı without the code…" and "keeps the köşk closed…" fail |
| the köşk nazımı restores it | `hidden-kosk.e2e.spec.ts` (every read returns after the restore), `kosk-admin.e2e.spec.ts` | covered by the same |
| a başmüderris hides their medrese and cannot hide or restore a köşk | `hide-restore-catalogue.e2e.spec.ts` "who may not hide" (both halves, and a köşk nazımı cannot hide a medrese) | pins behaviour the engine already had: no change to put back (`kosk.manage` is köşk-scoped and absent from the başmüderris default); the test fails if the code is ever added to its defaults |
| a müderris hides a week | `week-hide.e2e.spec.ts` "a müderris hides a week" (level `course`, one instant, earlier session keeps its stamp, version bump, talebe's read, no row deleted, audit) | route `@Authz` back to `course.edit`: "refuses a ders nazırı granted only course.edit", "lets the köşk's nazımı, the başnazım and a ders nazırı…" fail |
| …and cannot hide the course | `week-hide.e2e.spec.ts` "hiding the course itself" | a müderris has no course permission to take away (default 1); the medrese nazırı half fails with the medrese rung out of `COURSE_HIDE_LADDER` (first pass) |
| a hidden köşk's courses are closed on every route, not on the page only (review) | `hidden-kosk.e2e.spec.ts` "closes the routes the course team and the medrese use, not only the page": the müderris is 404 on the course Arşiv, roster, live streams, week hide, add, edit, cancel and drop of a session with no row, version or audit row changed; a talebe and a stranger are 404 on the roster and live streams; the köşk's nazımı and the başnazım are still let in; a müderris's Arşiv restore of a week is 404 and leaves it hidden until the köşk is back; the başmüderris's archive and restore of a hosted course are 404 before the write | on the first-pass tree: 5 of the 20 tests of the spec failed (`Tests  5 failed \| 15 passed (20)`); guard call out of `AuthzGuard`: `authz.guard.spec.ts` "answers the closure's 404 to a signed-in caller…" fails (1 of 18) and 3 of the 24 in `hidden-kosk.e2e.spec.ts` (the rest still pass: the restore and the medrese routes ask for themselves); `ArchiveService`'s call out of `restore`: 3 of 36 in `archive.service.spec.ts` fail |
| a hidden köşk leaves the medrese's lists and the decks (review) | `hidden-kosk.e2e.spec.ts` "leaves the medrese's lists and routes, and the köşk's decks": the public medrese page for anonymous, talebe and başmüderris, the başmüderris's course list, the Pano's `courseCount` and `upcomingSessions`, the başmüderris's `PUT …/muderrises` and `POST …/hide` (404, nothing written), `GET /kosks/:id/decks` (404 to talebe, müderris and stranger, 200 to the köşk's nazımı, the başnazım and `platform.kosk_edit`) | the four source changes put back at once: `Tests  4 failed \| 20 passed (24)` |
| the Dersler table says who hid a course and offers Geri al by `canRestore` (review) | `kosk-overview.e2e.spec.ts` "who hid a course and who may bring it back" (the level, `canRestore` for the nazımı and the başnazım, the 403 `ARCHIVE_RESTORE_LEVEL` the row predicts); nizam `kosk-overview.spec.tsx` "a row's buttons", "a refused restore", "offers no Geri al on a course a higher level hid…" | roster without the fields: `Tests  3 failed \| 14 passed (17)`; rowActions ungated, error key forced generic, locked sentence off: `Tests  3 failed \| 43 passed (46)` |
| nothing deletes a row | `hidden-kosk.e2e.spec.ts` "deletes nothing", `week-hide.e2e.spec.ts` "deletes no row" | row counts before, while hidden, after restore |
| a hidden medrese's page stays open to the people above | `hide-restore-catalogue.e2e.spec.ts` "keeps a hidden medrese's page open…" | `findOpenById` and `findOverview` back to 404-for-all: that test fails (each half alone) |
| week/session restore by whoever hid it or above | `week-hide.e2e.spec.ts` "bringing it back…" (müderris restores, refused what the köşk hid with `ARCHIVE_RESTORE_LEVEL` naming both levels, stranger 403 `ARCHIVE_FORBIDDEN`, ders nazırı, `session.manage` for a session and for a week whose sessions come back with it) | `session.manage` out of the course rung of `SECTION_HIDE_LADDER`: "lets whoever holds session.manage bring back…" fails; `DELETE /lessons/:id` back to `session.manage`: "is open to week.hide alone…" (first pass) |
| Arşiv and restore from the catalogue | `test/unit/archive/hide-codes.spec.ts` (the ladders and the Arşiv read codes against the engine's role defaults), `archive.service.spec.ts`; `hide-restore-catalogue.e2e.spec.ts` "a köşk's Arşiv", "a course's Arşiv", "a medrese's Arşiv…" | `platform.kosk_edit` out of the köşk Arşiv codes and the course Arşiv code widened to `course.view`: 3 of 18 in `hide-restore-catalogue`; the medrese's own `canRestore` forced true: 1 of 75 in `test/unit/archive` |
| every hide and restore is audited | `week-hide.e2e.spec.ts` "every hide and restore leaves one row of the right action", "writes course.hide and course.restore…", "writes one week.hide…", "writes one session.hide…"; `hide-restore-catalogue.e2e.spec.ts` | the `session.hide` row of `archiveLesson` and the drop rows of `course.replace` off: "writes one session.hide audit row", the whole-course save's row tests and "counts each act once" fail |
| real delete is audited | `hide-restore-catalogue.e2e.spec.ts` "the medrese's real delete" | `recordDeletion` off: fails |
| whole-course save asks what the reviewed MDRS-135 decided | `week-hide.e2e.spec.ts` "a whole-course save that drops a week or a session" (a ders nazırı holding only `course.edit` is refused a dropped session with 403 `AUTHZ_FORBIDDEN` before any write and may drop a week with no session in it; `course.edit` with `session.manage` drops a week with its sessions; a save that drops nothing passes; the müderris drops and restores; 409 on an old version) | the reviewed check, `assertMayChangeSessions`, is MDRS-135's: its own specs (`session-work.spec.ts`, `course.e2e.spec.ts`) fail without it; the drop's audit rows are the ones named above |
| nizam / nazir screens | `apps/nizam/test` (`kosk-views`, `madrasahs`, `archive`, `kosk-entry`, `kosk-page`, `kosk-overview`, `kosk-admin`), `apps/nazir/test` (`archive-page`, `archive`, `actions`, `course-archive`, `curriculum-hide`, `messages`) | the directory gate back to `chief`; the madrasah and Arşiv rows gated by nothing; `koskEntry` without the held code; the management page's restore ungated; both error maps without `ARCHIVE_RESTORE_LEVEL`; the nazir banner off; `HideMadrasah` shown while hidden; the weeks' hide calling the session action; the course Arşiv without `types`: each fails 1 to 5 of the named specs |


Hiding a button is not protection: every action a screen offers has a tested API refusal (the 403 rows above), and a
nazir "Gizle" that the API refuses is a toast (`curriculum-hide.spec.tsx`).

Commands run on the merged tree, with the counts read off each summary:

```
$ cd libs/common && ../../node_modules/.bin/tsc -p tsconfig.json          # rebuilt before any tedrisat test
$ cd libs/common && ./node_modules/.bin/vitest run
 Test Files  12 passed (12)
      Tests  172 passed (172)
$ cd apps/tedrisat && ./node_modules/.bin/vitest run test/unit
 Test Files  68 passed (68)
      Tests  887 passed (887)
$ cd apps/tedrisat && /home/taha/medaris-wt/.bin/e2e-slot.sh ./node_modules/.bin/vitest run \
    test/e2e/{archive,hide-kademe,hide-restore-catalogue,week-hide,hidden-kosk,kosk-overview}.e2e.spec.ts
   (archive 31, hide-kademe 31, hide-restore-catalogue 18, week-hide 33, hidden-kosk 24, kosk-overview 17 tests: all passed)
$ ... test/e2e/{hide-instead-of-delete,madrasah-archive,madrasah,madrasah-directory,madrasah-course,madrasah-portal,\
    kosk-admin,kosk,hosting}.e2e.spec.ts
 Test Files  9 passed   (with week-hide: 10 files, 257 tests, all passed)
$ ... test/e2e/{course,session,schedule,calendar-feed,profile,public-pages,nizam-dashboard,archived-level-migration,\
    inactive-scope,kosk-dashboard,platform-admin,course-team,user}.e2e.spec.ts
 Test Files  13 passed (13)
      Tests  265 passed (265)
$ ... test/e2e/{authz-engine,assignments,self-grant,grant-ceiling-cascade,madrasah-head-change,madrasah-nazir,\
    course-staff,muderris-assignments,roster-read-audit,authz-query-count,live-stream}.e2e.spec.ts
 Test Files  11 passed (11)
      Tests  243 passed (243)
$ ... test/e2e/authz-route-inventory.e2e.spec.ts -u                       # the snapshot, read line by line (below)
$ cd apps/nizam && ./node_modules/.bin/vitest run
 Test Files  41 passed (41)
      Tests  695 passed (695)
$ cd apps/nazir && ./node_modules/.bin/vitest run
 Test Files  37 passed (37)
      Tests  697 passed (697)
$ cd libs/services && ./node_modules/.bin/tsc -b tsconfig.json
$ cd apps/{tedrisat,nizam,nazir,tedris} && ./node_modules/.bin/tsc --noEmit   # no output
$ cd libs/common && ./node_modules/.bin/tsc --noEmit -p tsconfig.json         # no output
$ biome check <every touched ts, tsx and json file>
$ cd apps/tedrisat && ./node_modules/.bin/ts-node --project tsconfig.json src/openapi/export-openapi.ts ../../libs/services/swagger-docs/tedrisat.json
 export-openapi: wrote 169 paths to .../libs/services/swagger-docs/tedrisat.json
$ cd libs/services && ./node_modules/.bin/openapi-generator-cli generate -i swagger-docs/tedrisat.json -g typescript-fetch -o src/tedrisat/generated ...
$ node tools/ci/assert-openapi-spec-fresh.mjs
✔ openapi spec freshness: 169 paths, identical to what the exporter writes today (info.version excluded by design).
```

New specs of this issue: `hidden-kosk.e2e.spec.ts`, `week-hide.e2e.spec.ts`, `hide-restore-catalogue.e2e.spec.ts`,
`test/unit/archive/hide-codes.spec.ts`; `archive.service.spec.ts` is the reviewed MDRS-135's with this issue's tests
added (the course Arşiv, the medrese itself, the closure asked before a restore); `libs/common` `authz.guard.spec.ts`
and `authz.service.spec.ts` (the closure); nizam `kosk-views`, `madrasahs`, `archive`, `kosk-entry`, `kosk-page`,
`kosk-overview` (the Dersler table), `kosk-admin`; nazir `course-archive.spec.tsx` and `curriculum-hide.spec.tsx`,
`archive-page`, `archive`, `actions`. Existing specs edited only where behaviour forced it:
`madrasah-directory.e2e.spec.ts` (a hidden medrese is open to the başnazım), `madrasah.e2e.spec.ts` (the delete takes
the actor), `nizam-kosk-buttons.spec.ts` (`DELETE /lessons/:id` carries two codes).

Red-then-green on the merged tree: eight source changes put back at once in `apps/tedrisat/src` and reverted
(`git status` clean after, the files restored from saved copies): the week-hide route back to `course.edit`,
`platform.kosk_edit` out of the köşk Arşiv codes, `session.manage` out of the course rung of `SECTION_HIDE_LADDER`,
the course Arşiv code widened to `course.view`, the `session.hide` audit row off, the drop rows of a whole-course
save off, `TedrisatRoleResolver.closure` answering nothing, and `ArchiveService.restore` not asking `assertOpen`.

```
tedrisat e2e, 8 changes at once, 3 specs:       21 failed of 75  (hidden-kosk 10 of 24, week-hide 8 of 33, hide-restore-catalogue 3 of 18)
tedrisat unit, 3 changes (assertOpen out of restore, the medrese's canRestore forced true, the course Arşiv unscoped):
                                                5 failed of 75   (test/unit/archive)
nizam, 3 changes (restore gate, the köşk Arşiv's mayRestore, the Dersler row's canRestore) in 3 specs:
                                                5 failed of 161  (archive 2, madrasahs 1, kosk-overview 2)
nazir, 2 changes (HideMadrasah while hidden, the banner's refusal words), archive-page.spec:
                                                3 failed of 29
```

The first pass of this issue saw each new test red before its source change as well (on the tree before the merge
with the reviewed MDRS-135): 21 of 61, 3 of 14, 10 of 50 and 6 of 18 in the new e2e specs, 8 of 183 in nizam and 11
of 79 in nazir, and after the review 5 of 20, 4 of 24, 3 of 24, 3 of 17, 1 of 18 in `authz.guard.spec`, 3 of 36
in `archive.service.spec` and 3 of 46 in nizam's `kosk-overview.spec`.

The route inventory (`authz-route-inventory.txt`) differs from the reviewed MDRS-135's by 18 lines (10 added, 8 removed), read one by one:
the four platform Arşiv routes (`DELETE /archive/:type/:id`, `GET /archive`, `GET /archive/:type/:id/impact`, `GET
/archive/scopes`) and `POST /archive/:type/:id/restore` went from "no AuthzGuard" to `exempt`; `GET /kosks/:id/archive`
and `GET /madrasahs/:id/archive` name their codes; `GET /courses/:id/archive` and `POST
/courses/:courseId/weeks/:weekId/hide` are new; `DELETE /lessons/:id` is `week.hide | session.manage`.

## What was not verified

- **The Playwright specs** (`apps/nizam/e2e`, `apps/nazir/e2e`) need a running stack with Keycloak and were not run; two
  were edited to match the new copy and buttons (`nazir/e2e/archive.e2e.ts`, `nizam/e2e/kosks.e2e.ts`).
- **The whole tedrisat suite** is the integrator's; only the specs listed above were run, with the slot wrapper.
- Real Keycloak, Bunny and YouTube are not reachable from here; nothing in this issue needs them.
- **What the closure does not reach.** It is asked on every route whose resource is a *course*, and by the Arşiv
  restore and the two medrese routes that take a course id. Routes whose resource is the köşk or the medrese and that
  list or count courses are narrowed one by one, and only these are: the köşk's own lists, the medrese page,
  `GET /madrasahs/:id/courses`, the Pano's course count and upcoming sessions, the decks route. **Not narrowed:** the
  Pano's talebe list and pending applications, `MadrasahRepository.findTalebeIds`, the badge counts, and the medrese's
  own Arşiv (`GET /madrasahs/:id/archive`), which still lists the hidden weeks, sessions and courses of a hidden
  köşk's course to the başmüderris with `canRestore: true`; the restore itself answers 404 (read from the code, not
  probed). Hosting routes of a hidden köşk (`byExistingKosk`) were not looked at.
- **The nazir menu is not gated by permission**; a person without `week.hide` sees the Müfredat and Arşiv entries and
  the API's refusal.
- **Nothing was timed**: the extra `findHideState` read per signed-in course route is not measured.

## For MDRS-208 and MDRS-123

- `week.hide` is asked by `POST /courses/:courseId/weeks/:weekId/hide`, `DELETE /lessons/:id` (with `session.manage`),
  `GET /courses/:id/archive` and the course rung of the week and session ladders. The "grantable codes nobody asks"
  list of `docs/migration/mdrs-135-permission-catalogue.md` already counts it as asked, by the ladder; that file is
  MDRS-208's and was not edited here.
- `/ders/:id/mufredat` is a stand-in for MDRS-123's editor: its address and menu entry are the editor's to take over.
