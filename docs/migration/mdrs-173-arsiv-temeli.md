# MDRS-173 — the archive foundation

Screens: nizam/28 "Arşiv" (a köşk's hidden items) and nizam/29 "Arşiv — Kalıcı
olarak sil" (the platform's, for the Medaris başnazımı). Base:
`release/stack-39-atama-temeli`.

## What was done

**tedrisat**

- Migration `0028_archive_columns` adds `archived_at` / `archived_by` to
  `kosks` and `decks`, and `archived_by` to `course_weeks` and `lessons`.
  `courses` (MDRS-124), `course_weeks` and `lessons` (MDRS-95) already had
  `archived_at`; the new column records who hid the row. All columns are
  nullable and additive.
- New module `src/archive/`. One query (`UNION ALL` over the five tables) lists
  what is hidden, newest first. A week is listed only while its course is
  shown, a session only while its week and course are: hiding a whole is one
  loss, not several.
  - `GET /kosks/:id/archive?type=&q=&page=&limit=`: a köşk's courses, weeks,
    sessions and (once they exist) recordings; köşk manager or SYSTEM_ADMIN,
    else 403; unknown köşk 404. Never lists the köşk itself or a medrese.
  - `GET /archive?koskId=&madrasahId=&type=&q=&page=&limit=` (default 10 per
    page, at most 50) and `GET /archive/scopes` (the köşks and medreses that
    hold something hidden, for the scope filter): SYSTEM_ADMIN only.
  - `POST /archive/:type/:id/restore`: a köşk manager restores courses, weeks
    and sessions of their köşk; SYSTEM_ADMIN restores anything (köşks, decks).
    Restoring a week brings back the sessions hidden at the same instant (a
    whole-course save hides them together) and leaves one hidden earlier on its
    own hidden. A course whose köşk is hidden answers 409
    `ARCHIVE_PARENT_HIDDEN`. Week and session restores bump the course
    `version`, as every syllabus write does (MDRS-95).
  - `GET /archive/:type/:id/impact`: counts for the confirmation (courses,
    weeks, sessions, enrollments, recordings, followers, cards).
  - `DELETE /archive/:type/:id`: SYSTEM_ADMIN only, only for a hidden item (404
    otherwise), one transaction, children first (`purgeCourses`, the köşk's
    followers and role rows, a deck's cards and their progress rows, which have
    no foreign key), and an `audit_log` row whose `details` carry `actorName`.
  - Authorization is in `ArchiveService`, not `@Authz`: the matrix has no
    archive entity (same reason `MeAssignmentsController` has no `AuthzGuard`).
- `DELETE /lessons/:id` and the whole-course `PUT` now record who archived a
  session or week.
- `libs/services` regenerated (`pnpm openapi:tedrisat`); `archive` added to
  the API factory.

**nizam-web**

- `/[locale]/kosks/[id]/arsiv` (nizam/28) and `/[locale]/arsiv` (nizam/29):
  search by name, type filter, scope filter (platform), the table (title and
  context line, type or scope, hider with role, "Dün 18:20"-style date),
  "Geri al" (toast, row leaves, count follows), "Kalıcı olarak sil" with the
  confirmation `AlertDialog` (focus on "Vazgeç", counts, "Silme, denetim
  kaydına adınızla yazılır."), "Daha fazla göster", loading skeleton, empty and
  error states with "Yeniden dene". 403 and 404 show the "izniniz yok" screen
  (nizam/06). A "Arşiv" button on the köşk page for its manager.
- `features/archive/` (`present.ts` pure helpers, `actions.ts` server actions,
  `reads.ts`, `components/archive-view.tsx`), tr/en/ar messages
  (`nizam.ArchivePage`).
- Playwright `e2e/archive.e2e.ts` with `archive-seed.ts`.

## What was verified

Gate in this worktree, all `--skip-nx-cache`: `typecheck`, `test`, `build`,
`lint`, `module-boundaries` green. `assert:openapi-fresh`,
`assert:env-compose-parity`, `assert:release-config`, `assert:affected-isolation`
green. tedrisat: 61 suites, 903 tests, 0 failures, of which
`test/e2e/archive.e2e.spec.ts` (31, real Postgres, real `AuthGuard` with minted
tokens) and `test/unit/archive/` (9). nizam-web: 8 suites, 75 tests, of which
`test/archive.spec.tsx` (24).

Browser, Playwright Chromium, real Keycloak sign-in of `e2e-kosk-nazim`, local
tedrisat and nizam-web and Postgres: `e2e/archive.e2e.ts` 6 passed, 2 skipped.
nizam/28 criteria 1 to 5 (list with type, hider and date; type filter and count;
"Geri al" returns the item and drops the row, the course is back on the köşk
page; no permanent delete on the page; another köşk's items absent), the
"Arşiv" link on the köşk page, and a köşk nazım refused on `/tr/arsiv` and on
an unknown köşk's archive. Screens checked by eye at 1440 and 390 px.

## What was not verified

- **nizam/29 in a browser.** The platform archive and the permanent delete need
  the SYSTEM_ADMIN realm role, which does not exist in the shared Keycloak
  (creating it is a human job). Not verified: the page for the başnazım, the
  scope select, "Daha fazla göster", the dialog in the browser (including that
  focus starts on "Vazgeç", which the kit's `AlertDialog` guarantees by
  `initialFocus` and no test here checks). The two platform specs in
  `archive.e2e.ts` are written and skip unless `E2E_SYSTEM_ADMIN_HAS_ROLE=1`;
  they have never run.
  Covered with a minted SYSTEM_ADMIN token in `archive.e2e.spec.ts` instead:
  the 10-per-page listing, scope and type filters, impact counts, the real delete
  and its audit row with the caller's name, 403 for anyone else, restore.
  Criterion 4 of nizam/29 (403 for a non-başnazım) is also seen in the browser
  for a köşk nazım.
- The English and Arabic messages were written without a native review.
- `ArchiveView` is tested as static markup and as pure helpers; the client
  behaviour (typing, the debounce, the dialog flow) is exercised only by the
  Playwright run above, and for the platform page not at all.

## Decisions and limits

- **No hide endpoint for a köşk, a deck or a week.** Only courses
  (`POST /courses/:id/archive`) and sessions (`DELETE /lessons/:id`, a
  whole-course save) can be hidden today; köşk hide/restore is package 44,
  deck hide belongs to the deck packages. The columns, the list, restore and
  delete are ready for them. Nothing filters a hidden köşk or deck out of the
  existing köşk and deck reads yet: that comes with the endpoint that hides
  them, otherwise this migration would change reads without a way to hide.
- **A deck belongs to no köşk**, so it appears only in the platform archive.
- **"Ders kaydı" and "Medrese" are in the filters and list nothing.** There is
  no recording model (package 32) and no medrese hide column. The API accepts
  both types, returns an empty list, and answers 404 to restore, impact and
  delete.
- Restore of a köşk or a deck is the başnazım's alone; the nazım restores what
  is inside their köşk.
- The "Gizleyen" role is the one the hider holds, or held (revoked rows count),
  nearest scope first; nothing for a SYSTEM_ADMIN or when none is on record.
- The sentence "Nûruosmaniye Köşkü'nde gizlenen…" is "Bu köşkte gizlenen…":
  Turkish suffixes cannot be put after a name by a message.
- The archive pages sit in the old Nizam shell and no sidebar item points to
  them (the shell is package 38). The köşk page links to its archive; the
  platform archive is reached by `/tr/arsiv`.
- `biome-ratchet` reports 81 warnings against a baseline of 74 on this branch;
  the same on its base, `release/stack-39-atama-temeli`. The 33 files this
  package touches add none (`biome check --diagnostic-level=warn`). The baseline
  is not raised here.
- `apps/nizam/vitest.config.ts` now also picks up `*.spec.tsx`.
