# MDRS-170 — Medreseler, Medrese aç, Barındırma hakları

Screens: nizam/07 "Medreseler", nizam/08 "Medrese aç", nizam/26 "Barındırma
hakları", nizam/27 "Barındırma hakkını geri al". Base:
`release/stack-38-nizam-kabuk`. This is the Mac lane (nizam/nazır packages); it
is not linked to stack #130 until the tedris lane (26, 29–36) is merged in.

## What was done

**tedrisat**

- Migration `0032_madrasah_archive_hosting_role` (rollback in
  `src/database/rollbacks`): `madrasahs.archived_at/archived_by` (the "Gizli"
  state) and `madrasah_kosk_hosting.granted_by_role` (so "Veren" can name the
  role: `SYSTEM_ADMIN` is a realm role and is stored nowhere else).
  **Numbering:** written as 0031; the tedris lane took 0031 (`0031_kesfet`),
  so when this chain was stacked on top of it the migration became 0032. Its
  snapshot was regenerated with `drizzle-kit generate`, which wrote the same
  SQL byte for byte.
- `GET /madrasahs/directory?status=&q=&page=&limit=` (SYSTEM_ADMIN only): every
  medrese, hidden and passive ones too, with status, başmüderris, course count,
  hosting köşks, per-status counts and the passive medreses the warning names.
  One SQL statement with correlated subqueries per page. The open
  `GET /madrasahs` now leaves hidden medreses out, and a hidden medrese's
  `/overview` and `GET /madrasahs/:id` answer 404 (`findOpenById`; the writes
  that return the medrese they changed still read it with `findById`).
- `POST /madrasahs` now takes `headMuderrisUserId` (required) and an optional
  `handle` (made from the name, numbered when taken); medrese and başmüderris
  grant are one transaction with an `audit_log` row.
- `PUT /madrasahs/:id/head-muderris`: replaces the head (old grants revoked, not
  deleted) and makes a passive medrese active again. `POST /madrasahs/:id/restore`
  brings a hidden one back (409 `MADRASAH_NOT_HIDDEN` otherwise). Both
  SYSTEM_ADMIN only, both audited.
- `GET/POST /kosks/:id/hosting-rights`, `DELETE
  /kosks/:id/hosting-rights/:madrasahId?coursesAction=KEEP|HIDE` (köşk nazımı of
  that köşk and SYSTEM_ADMIN): the list carries who granted and in what role,
  the başmüderris and the open courses with talebe count and imam; the
  withdrawal keeps or hides the medrese's courses in that köşk (stamp and
  version bump like `course.archive`), in one transaction with the audit row.
- The generated client (`libs/services`) is regenerated.

**libs/ui** (additive): `DialogClose` takes a `ref` (a confirmation starts on
"Vazgeç"); `Select`'s positioner takes `mds-popup-positioner`, because a list
opened inside a dialog sat under the dialog's viewport and could not be clicked
(found by the e2e).

**nizam-web**

- `[locale]/medreseler` (+ `loading`): tabs with the API's counts (`?durum=`),
  search (`?q=`, debounced), warning for passive medreses, table, "Geri al",
  "Başmüderris ata", "Medrese aç". A 403 shows nizam/06.
- "Medrese aç": the başmüderris is found by exact e-mail (Enter or leaving the
  field, never per key: each search is an audit row). The "Başmüderris ata"
  dialog on a passive row is the same picker in a small dialog; nizam/22 (a later
  package) may replace it.
- `[locale]/kosks/[id]/ayarlar/barindirma` (+ `loading`): the table, "Barındırma
  hakkı ver" (a Select of the whole open medrese list, read page by page, the
  ones holding the right left out) and the withdrawal dialog with the open
  courses and the two answers. No answer is preselected; with no open course
  there is no question and KEEP is sent.
- i18n: `MadrasahsPage`, `HeadPicker`, `OpenMadrasahDialog`, `AssignHeadDialog`,
  `HostingPage`, `GrantDialog`, `RevokeDialog` in tr, en and ar.

## Decisions

- Platform medrese administration (list, open, appoint, restore) is SYSTEM_ADMIN
  only, like `CREATE_MADRASAH`; a Medaris nazımı gets nizam/06. Hosting rights
  are managed through `EDIT` on the köşk (its nazımları) or SYSTEM_ADMIN.
- Endpoint names follow the existing English API: `/madrasahs/directory`,
  `/kosks/:id/hosting-rights` (the specs' Turkish paths were not used).
- "Görev süresi … doldu" and the Pasif banner use the design's sentences for any
  passive medrese; `passive_reason` is not shown.
- The destructive button of nizam/27 is the dark primary one, as drawn.
- The tab strip of Barındırma hakları links `…/ayarlar` and `…/ayarlar/nazimlar`,
  which are other packages' pages (they show nizam/06 until then); only this tab
  carries a count.

## Verified

- tedrisat against a real Postgres, run from `apps/tedrisat` on the head of this
  fix (Docker, one Testcontainers Postgres):

  ```
  ./node_modules/.bin/vitest run -c vitest.integration.config.ts \
    test/e2e/madrasah-directory.e2e.spec.ts test/e2e/hosting.e2e.spec.ts \
    test/e2e/madrasah.e2e.spec.ts test/e2e/public-pages.e2e.spec.ts
  ```

  ```
   ✓ test/e2e/hosting.e2e.spec.ts (18 tests)
   ✓ test/e2e/madrasah-directory.e2e.spec.ts (24 tests)
   ✓ test/e2e/madrasah.e2e.spec.ts (22 tests)
   ✓ test/e2e/public-pages.e2e.spec.ts (30 tests)
   Test Files  4 passed (4)
        Tests  94 passed (94)
  ```

  `madrasah-archive-migration.e2e.spec.ts` (migration and rollback) and the unit
  specs for the handle were not re-run for this note; the CI `Verify` job passed
  on the head before this fix (`f29a2808`).
- nizam-web unit specs, from `apps/nizam`:
  `./node_modules/.bin/vitest run test/hosting-reads.spec.ts test/hosting.spec.tsx`
  gives `Test Files  2 passed (2)`, `Tests  23 passed (23)` (the picker's four
  and `hosting.spec.tsx`'s 19). `madrasahs.spec.tsx` was not re-run for this note.
- nizam-web Playwright `e2e/madrasahs.e2e.ts`: the count is re-counted with
  `./node_modules/.bin/playwright test --list e2e/madrasahs.e2e.ts` from
  `apps/nizam`, which ends `Total: 12 tests in 1 file`. The run itself (against
  the running API, a private Postgres database and the real Keycloak with the
  `e2e-*` accounts) was not repeated for this note; its checks, as done when the
  package was written: counts equal the database's, passive/hidden/active rows,
  restore, appoint (real directory lookup through `tedrisat-admin`), open (audit
  row per search, 409 under its field), 403 for a Medaris nazımı and for another
  köşk, grant, withdraw with KEEP and HIDE, Escape and "Vazgeç". Screens were
  compared with the canvas PNGs at 1440 px and 390 px.

## Not verified / not done

- The Medreseler table shows at most 50 medreses (a "{n} tanesi gösteriliyor"
  line says so); no paging. "Barındırma hakkı ver" is not capped: it reads every
  page of the open list (`getMadrasahOptions`).
- Nothing yet stops a medrese without a right from opening a course in a köşk,
  and a passive medrese's page is not closed to visitors: the banner's
  sentences are the design's, the behaviour is not part of this package.
- The platform archive (nizam/29) does not list hidden medreses yet; nothing in
  this package hides one (only "Geri al" is here), so tests hide them by SQL.
- The "…" menu of the table rows and the sort chevron of the design are not drawn
  (no actions behind them in the specs).
- The light/dark and Arabic (rtl) renderings were not checked in a browser.
