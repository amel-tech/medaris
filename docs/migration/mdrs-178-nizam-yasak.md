# MDRS-178 — Yasaklamalar for Medaris administration, Talebeler → Kayıtlı and Erişimi kaldırılanlar

Screens: nizam/40 "Yasaklamalar (C13, köşk nazımı)", nizam/48 "Yasaklamalar,
Medaris yönetimi görünümü", nizam/58 "Dersten çıkar" (the Talebeler page's
Kayıtlı tab).
Base: `release/stack-42-nizam-kapsam-izinleri`. This is the Mac lane
(nizam/nazır packages); it is not linked to stack #130 until the tedris lane
(26, 29–36) is merged in. Packages 45 and 46 are stuck and are **not** in this
branch's history (stack-42 does not contain them); this package depends on
47 (the ban foundation, #142), which it does contain.

**Migration numbering:** this package adds no migration, so it cannot clash
with a number the Linux lane takes. The removal record is read from the
existing `audit_log`.

## What was done

**nizam/40** needed no code. The köşk nazımı's list, its "Yasağı kaldır" and
"Köşkten de yasakla", the kademe rule and the "Bu yasağı yalnız Medaris
yönetimi kaldırabilir." line were all delivered by 47 at
`/kosks/[id]/yasaklamalar` (the screen is nizam/42's twin). It was compared
with the canvas again; the two things nizam/40 shows that stay undrawn are the
ones 47 already left out (see Not done).

**tedrisat**

- `GET /bans?status=&scope=&q=&limit=&offset=` (`operationId: listAllBans`):
  every köşk's bans, newest first, one page (default 50, at most 100) with
  `total` and platform-wide `activeCount`/`liftedCount`/`recentCount`.
  Allowed: the başnazım (SYSTEM_ADMIN) and a Medaris nazımı; anyone else gets
  403 `BAN_FORBIDDEN`. `q` matches name or e-mail (`ILIKE`, wildcards
  escaped); a bad `scope`/`status`/`limit` is 400.
- `POST /bans/:banId/extend` `{ scope: "KOSK", reason }` (`extendBan`): opens a
  KOSK ban for the same person beside the course ban, with its own reason, the
  caller's tier and `extended_from_course_id`; the course ban stands. The
  köşk's nazım and above may; a müderris or another köşk's nazım gets 403, a
  köşk ban 400 `BAN_TARGET_INVALID`, a lifted ban 409. The audit row is
  `ban.extend` (carrying `extendedFromBanId`), not `ban.create`. A person
  already barred from the köşk gets the standing ban back, as `POST …/bans`
  does.
- `BanResponse.koskName` (new) so the Medaris-wide list can name the köşk.
- `GET /courses/:id/enrollments/removed` (`getRemovedEnrollments`): who the
  course team took out, newest first, with reason, progress at removal, when
  and by whom. Read from `audit_log` (`enrollment.remove`); `@Authz`
  `MANAGE_ENROLLMENTS`, like the rest of the team's routes. From now on the
  `enrollment.remove` row also keeps the talebe's name and e-mail (the seat is
  deleted); rows written earlier fall back to the `users` table.
- The widening key is now person **and köşk** (`userId:koskId`), so one person
  barred in two köşks is not mistaken for "already widened".
- The generated client (`libs/services`) is regenerated.

**nizam-web**

- `[locale]/yasaklamalar` (+ loading): the Medaris view, `AllBansView`. The
  menu entry of Medaris roles already pointed at `/yasaklamalar` (the spec
  suggested `/bans`), so the page lives there. Tabs Etkin/Kaldırılan with
  platform-wide counts, a search, the Kapsam chips (Tümü, Ders, Köşk), the
  "N etkin yasak" sentence, the table of nizam/42 plus the köşk's name under a
  course, "Yasağı kaldır" (the existing `LiftDialog`) and "Yasağı genişlet"
  (new `ExtendDialog`), 20 rows a page with "Daha fazla göster". 403 shows
  nizam/06's screen.
- Talebeler page: Kayıtlı and Tamamlayanlar are `RosterTable` now (the old
  shadcn `CourseRoster` is gone): search by name/e-mail, the talebe's own
  progress as a `Progress` bar, "Tamamladı say" / "Dersten çıkar" / "Yasakla"
  (or "Yasağı kaldır" for a barred talebe), six rows at a time with "28
  talebeden 6 tanesi gösteriliyor" and "Daha fazla göster". The new fourth tab
  Erişimi kaldırılanlar is `RemovedTable`. `RemoveDialog` is nizam/58's window.
- `libs/ui` `Progress` got `labelHidden` (keeps the accessible name, draws no
  text) for a table cell whose column header says what it is.
- i18n `AllBansPage`, `ExtendDialog`, `RemoveDialog`, `StudentsRoster`, the
  `StudentsPage.tabs.removed` key, in tr, en and ar.

## Decisions

- **Scopes.** The ban model has two scopes, COURSE and KOSK. The Medrese and
  Platform chips, "Hesap kapalı", "Platformdan yasakla" (nizam/49) and the
  platform row without "Yasağı genişlet" are not drawn: there is nothing
  behind them. A KOSK row is the widest scope and has no widening
  (criterion 5 holds in that sense). Widening only goes COURSE → KOSK.
- **"Yasağı genişlet" window.** The canvas has none (spec: "pencere tuvalde
  yok"), so it is the lift window's sibling: a `Dialog` with a `Form`, a
  required reason ("Genişletme gerekçesi"), focus on the field, the scrim does
  not close it. No reason is prefilled: the wider ban answers to its own.
- **"Dersten çıkar" is a `Dialog`, not an `AlertDialog`** (the open question in
  _kurallar madde 23): it carries a reason field, so madde 13 puts the focus on
  the field, not on "Vazgeç" as the canvas shows. Nothing is written under the
  empty field (madde 14: only Yasakla has a drawn error); the button stays off.
- **Paging.** The Medaris list pages on the server (`limit`/`offset`, 20 rows).
  The Kayıtlı table pages in the browser over the list the page already reads
  (the endpoint answers the whole roster): the spec's `cursor`/`q` query on
  `GET /courses/:id/enrollments` was not added, since a course's roster is a
  few dozen rows.
- **"28 talebeden 6 tanesi".** The canvas says "6’sı"; a Turkish possessive
  cannot be glued to a number that is a variable, "tanesi" works for every n.
- **Removal record** is `audit_log`, not a new table (stack-38 noted "kaldırma
  kaydı modeli yok"; the audit row already had reason, actor and time).
- Completing a course for a talebe and removing one reuse the MDRS-105 routes
  (`PATCH …/enrollments/:userId`, `POST …/remove`); nothing was rewritten.

## Not done

- Nizam/40 and nizam/48: the **Cihaz olayları** tab and the "yeni olay" count
  (no device trace in the backend, as in 47); the **Kalıcı yasak talebi** and
  **İtiraz edildi** badges (no request/appeal model, nazır packages).
- nizam/48: Medrese and Platform scope rows, "Platformdan yasakla" (see above).
- nizam/58: "Erişimi kaldırılanlar" lists removals only; a talebe who applied
  again after being removed stays in it (the row is the record of the removal).
- The sentence "ders kayıtlarına ve ders destesine erişimi kalkar … Kendi
  destesine kopyaladığı kartlar kendisinde kalır" is the canvas's. Removing the
  enrollment ends the seat (the calendar feed reads enrollments), but access to
  course recordings and the deck was not exercised end to end here.
- Phone width (390 px) was not measured; the tables use the kit's
  `responsive="stack"`.

## Verified

Against the base `release/stack-42-nizam-kapsam-izinleri` in this worktree,
all five gate commands with `--skip-nx-cache`, plus the ratchet:

- `typecheck` 17 projects, `build` 8 projects (+ their dependencies), `lint`
  17 projects, `module-boundaries` 17 projects: green.
- `test`: 11 projects green. tedrisat 82 files, 1189 tests. The first full run
  had one red, `permission-admin.e2e` "refuses a blank or repeated name…",
  `405 Method Not Allowed` instead of 400; it passes alone (24/24) and on a
  second full run, and touches nothing of this package (Nx called the task
  flaky). nizam-web 23 files, 355 tests (two new spec files, 34 tests).
- tedrisat: `ban.service.spec` 23 unit tests (listAll, extend), `ban.e2e.spec`
  24 (Medaris list and its filters, 403/400, widen incl. the `ban.extend` audit
  row, kademe, 409/400), `course-team.e2e.spec` +1 (the removed list).
- Playwright (nizam e2e, own throw-away Postgres, real tedrisat and nizam-web,
  real Keycloak sign-ins with e2e-sistem-admin, e2e-medaris-nazim,
  e2e-kosk-nazim): `bans-medaris.e2e.ts` 8, `students.e2e.ts` 7, and the
  existing `bans.e2e.ts` 9 — 24 green in one run. `shell.e2e.ts` and
  `kosks.e2e.ts` were run too (31 of the 33 passed in the first pass; the two
  reds were the old roster text "Bu ders", now kept in the new badge, and a
  timing flake that passed on rerun). `biome-ratchet`: 0 errors, 72 warnings
  (baseline 72), 23 infos (baseline 23).
- Screens were compared with the canvas by screenshot at 1440 px (the list, the
  window, the Kayıtlı table, Erişimi kaldırılanlar).

## Size

About 36 hand-written files plus this note; the regenerated client (10 files)
and the OpenAPI document are generated. Under the 60 the plan allows, so no
screen was moved to another package.
