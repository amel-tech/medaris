# MDRS-174 — Köşkler, Köşk aç, Köşk ayarları, Köşk nazımları, Köşk nazımı ekle

Screens: nizam/09 "Köşkler", nizam/10 "Köşk aç" (form), nizam/24 "Köşk
ayarları", nizam/25 "Köşk nazımları", nizam/21 "Köşk nazımı ekle" (dialog).
Base: `release/stack-41-nizam-izin-yonetimi`. This is the Mac lane (nizam/nazır
packages); it is not linked to stack #130 until the tedris lane (26, 29–36) is
merged in.

## What was done

**tedrisat** (`src/kosk/`)

- Migration `0034_kosk_policies` (rollback in `src/database/rollbacks`): two
  columns on `kosks`, `always_require_approval` and `recordings_never_public`,
  both `boolean not null default false`. **Numbering:** written as 0033; when
  this chain was stacked on top of the tedris lane (`0031_kesfet`) it became
  0034. Its snapshot was regenerated with `drizzle-kit generate`, which wrote
  the same SQL byte for byte.
- New `KoskAdminController` (declared before `KoskController` in the module, so
  `GET /kosks/directory` is matched before `GET /kosks/:id`):
  - `GET /kosks/directory` — the table of nizam/09: every köşk with its nazımları,
    field, level, listing, status (ACTIVE, PASSIVE, HIDDEN; hidden wins), course
    count (every course, drafts and hidden ones too), the per-status counts the
    tabs show (whatever the filters) and the fields the Alan chips offer. Filters
    `status`, `level`, `field`, `listing`, `q` (köşk, short name or a nazım's
    name), `page`, `limit` (default 12, at most 50). SYSTEM_ADMIN sees every
    köşk, a köşk nazımı only the ones they manage (hidden ones too), anyone else
    gets 403.
  - `GET /kosks/:id/nazims` — nizam/25: held KOSK_NAZIM rows with who gave the
    post, in what capacity, when, and until when. Köşk nazımları and SYSTEM_ADMIN.
  - `POST /kosks/:id/nazims` — nizam/21: `{ userIds, endsAt? }`, SYSTEM_ADMIN
    only. All or nothing: anyone who is a nazım already refuses the whole call
    (409 `KOSK_NAZIM_EXISTS`); an account neither the users table nor the realm
    knows is 404 (`KOSK_NAZIM_UNKNOWN_ACCOUNT`); a past end is 400. A passive
    köşk is active again. One `audit_log` row per person (`kosk.nazim.add`).
  - `POST /kosks/:id/hide` (köşk nazımları and SYSTEM_ADMIN, 409
    `KOSK_ALREADY_HIDDEN`) and `POST /kosks/:id/restore` (SYSTEM_ADMIN, 409
    `KOSK_NOT_HIDDEN`), with `kosk.hide` / `kosk.restore` audit rows. They use
    `kosks.archived_at/by` that migration 0028 made for the archive.
- `POST /kosks` takes `managerUserIds` (SYSTEM_ADMIN): the köşk and a KOSK_NAZIM
  grant per person, in the caller's name, with a `kosk.create` audit row, in one
  transaction; the caller is the köşk's `ownerId` and not one of its nazımları.
  Without it nothing changed: anyone signed in opens a köşk of their own.
  `PATCH /kosks/:id` and `POST /kosks` take the two policies; the update DTO
  refuses `managerUserIds`.
- A short name is one köşk's alone: 409 `KOSK_HANDLE_TAKEN` on create and on a
  `PATCH` that changes it. Compared without case and without a leading "@".
- Hidden köşk: left out of `GET /kosks` and `?managedBy=me`, a 404 for callers
  with no token (the köşk and its courses), and a 404 on `GET /kosks/:id` for
  anyone who is neither SYSTEM_ADMIN nor one of its nazımları.
- `alwaysRequireApproval` is enforced where enrollment is decided
  (`CourseService.enroll`): the köşk's rule joins `isPrivate` and the course's
  own `requiresApproval`.
- `grantRole` takes an optional `expiresAt` (the nazım's "Görev bitişi").
- The OpenAPI document and the generated client (`libs/services`) are
  regenerated.

**nizam-web**

- `[locale]/kosks` is the table (tabs with counts, search, Seviye select, Alan and
  Görünürlük chips, pager; the filters are in the URL as `?durum=&seviye=&alan=
  &gorunurluk=&q=&sayfa=`), with "Köşk aç" and "Geri al" for the başnazım. The old
  card grid (`kosks-page.tsx`) is gone; the courses a nazım teaches elsewhere
  stay under the table.
- The dialog of nizam/10 with a multi-select nazım picker (exact e-mail against
  the realm's directory), `[locale]/kosks/[id]/ayarlar` (Genel), the "Köşkü gizle"
  confirmation, `[locale]/kosks/[id]/ayarlar/nazimlar` and the dialog of nizam/21.
- i18n `KoskDirectory`, `OpenKoskDialog`, `KoskNazimPicker`, `KoskSettings`,
  `HideKoskDialog`, `KoskNazims`, `AddNazimDialog` in tr, en and ar.
- Playwright (`e2e/kosks.e2e.ts`, `e2e/kosk-seed.ts`), see below.

## Decisions

- **Paths.** `GET /kosks/directory` rather than the spec's `/admin/kosks`
  (the pattern of `/madrasahs/directory`), `/kosks/:id/nazims` rather than the
  Turkish `/nazimlar`, `POST /kosks/:id/hide|restore` as the spec has them.
- **Who.** Köşk aç, "Köşk nazımı ekle" and "Geri al" are the başnazım's
  (SYSTEM_ADMIN) alone, as the medrese screens are; a Medaris nazımı is a 403
  (the nizam/06 screen). The `platform.kosk_*` permissions of the catalog are
  not read yet.
- **Alan.** The API still takes free text (köşks and tests that exist hold
  values like "Tefsir & Hadis"); the eleven values of the design are the list
  the screens offer, and an older köşk's own value stays selectable.
- **Cover.** The design names four covers and the API stores `coverHue`; the
  names are stored as 250 (Lâciverd), 20 (Bordo), 155 (Zümrüt), 285 (Mürekkep)
  — the canvas gives no numbers. An older hue reads as the nearest name, and
  "Kaydet" sends the cover only when the chosen name changed.
- **"Atayan" role.** `role_assignments` keeps who gave a post, not in what
  capacity, so the label is worked out when the list is read: the realm's
  SYSTEM_ADMIN holders, then a nazım of that köşk (held or past), then a Medaris
  nazımı; otherwise no label.
- **"Köşkü gizle" text.** The canvas says "Arşiv'den geri alabilirsiniz", but a
  köşk nazımı cannot restore their own köşk (the köşk archive lists contents; the
  köşk itself is in the platform archive, which is the başnazım's), so the
  sentence says "Medaris yönetimi Arşiv'den geri alabilir".
- **Not drawn.** The "Çıkar" button and its dialog (the successor choice, behind
  nizam/21 in the canvas), the "Köşk başvuruları 3" link (no application model
  yet), and the "…" menu on each row (the canvas gives it no content).
- **Short name uniqueness** is checked before the write, not by an index: rows
  that exist may already share one, and an index would fail the migration. Two
  requests racing for one name could both pass.
- The existing `kosk.e2e.spec.ts` made three köşks with the same short name; each
  now has its own.

## Verified

Counts were taken again on top of `5eb2f5f` with the command shown beside each;
what needs a database, Keycloak or a browser was not run again here and says so.

- tedrisat against a real Postgres (Testcontainers):
  `kosk-admin.e2e.spec.ts` (34 specs: the table and its counts, filters alone and
  together, paging and the 50 cap, a nazım who never signed in named from the
  realm, a nazım's own scope, 403/401, hide and restore with audit rows, the
  hidden köşk in lists and by link, the nazım list with the giver's capacity,
  adding nazımları with an end, all-or-nothing, unknown account, past end,
  passive köşk made active, opening with `managerUserIds`, taken short name,
  the policies through `PATCH`, enrollment waiting under the approval policy);
  `kosk.e2e.spec.ts` (35) still passes.
  - 34: `grep -cE '^\s*it\(' apps/tedrisat/test/e2e/kosk-admin.e2e.spec.ts`
    prints `34`.
  - 35: `grep -cE '^\s*it(\.each)?\(' apps/tedrisat/test/e2e/kosk.e2e.spec.ts`
    prints `27` declarations, two of them `it.each` with 6 and 4 cases:
    27 - 2 + 6 + 4 = 35.
  - "75 files, 1094 tests, green": the 75 is the file count when this note was
    written (`git ls-tree -r --name-only 14bb10c8 apps/tedrisat/test | grep -c '\.spec\.ts$'`
    prints `75`); on this branch `find apps/tedrisat/test -name '*.spec.ts' | wc -l`
    prints `77`, the two new ones (`discover.e2e.spec.ts`, `next-session.spec.ts`)
    having come with the merges since. The 1094 tests and the green result were
    **not run again** (Testcontainers, slow): the CI `Verify` job, which runs
    `nx affected -t test` and so these specs, passed on `5eb2f5f`.
- nizam-web, `cd apps/nizam && ./node_modules/.bin/vitest run` on this branch
  prints `Test Files 20 passed (20)` and `Tests 289 passed (289)`, with
  `test/kosk-admin.spec.ts (37 tests)`, `test/kosk-views.spec.tsx (23 tests)` and
  `test/kosks-directory-search.spec.tsx (3 tests)` among them. Before the
  search spec was added (it is the one DOM spec of the app, so `happy-dom` is a
  devDependency of nizam now) the same command printed 19 files and 286 tests.
- Playwright `e2e/kosks.e2e.ts` (14 specs:
  `grep -cE '^test\(' apps/nizam/e2e/kosks.e2e.ts` prints `14`) against the
  running API, a private Postgres and the real Keycloak (`e2e-sistem-admin`,
  `e2e-kosk-nazim`; the e-mail lookups go to the real realm through
  `tedrisat-admin` and find `e2e-talebe`): the tabs' numbers equal the
  database's, every filter alone and together and restored by a reload, "Geri
  al", a nazım seeing only their own köşks, "Köşk aç" end to end (button off until
  the form is right, tags, duplicate pick, row in the list, grants and audit in
  the database), the form's messages and a taken short name, the settings
  (read-only short name, an empty name refused without a request, save and
  reload, "Vazgeç"), "Listelerde gösterme" leaving the open list, "Köşkü gizle"
  (the dialog, focus on "Vazgeç", the hidden köşk gone from the open list and a
  404 by link), the nazım list (Siz, Atayan with its role, date, Süresiz, no add
  button, 403 for another köşk), "Köşk nazımı ekle" (not found, found, row,
  audit, twice refused, an end date kept, a past one refused). The rest of the
  nizam e2e suite was run too: 72 passed, 2 skipped by their own condition; one
  spec timed out once and passed alone. These runs were **not repeated** for
  this note (they need the API, Postgres and Keycloak); the numbers are from the
  session that wrote it. The specs they add up to are counted by
  `cat apps/nizam/e2e/*.e2e.ts | grep -cE '^\s*test\('`, which prints `74`
  (72 + 2).
  The API's 403 for a köşk nazımı on `POST /kosks/:id/nazims` is tedrisat's
  ("is the başnazım's alone" in `kosk-admin.e2e.spec.ts`), not Playwright's: the
  browser holds no bearer token, so the Playwright spec only checks the screen.
- The screens were compared with the canvas PNGs at the browser's 1280 px width.

## Not verified / not done

- 390 px (phone) layouts, light/dark themes and Arabic (rtl) renderings were not
  checked in a browser.
- Nothing writes `passive_since` for a köşk yet, so the Pasif tab is empty in
  practice and "Süre dolunca başka köşk nazımı yoksa köşk pasifleşir" is not
  enforced; the passive state is read and cleared when a nazım is added.
- A hidden köşk's courses are hidden from callers with no token and from
  `GET /kosks/:id` readers, but a signed-in person who has a course link still
  opens the course.
- `recordingsNeverPublic` is stored only: there is no recording model to read it.
- A köşk nazımı cannot restore their own hidden köşk, by design above.
- The file count is above the 60 of the plan when the generated client is
  counted (see PLAN.md, Kararlar).
- Lesson for the next runner: `.env`'s `API__DB_PORT` decides the database; this
  run used its own Postgres container so it could not touch another lane's.
