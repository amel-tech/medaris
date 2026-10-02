# MDRS-159: Keşfet, the köşk page and Derslerim (tedris/02, 04, 20)

Package 29 of the screen canvas. Three tedris-web screens on the unified design system, and the API reads they needed.

## What was done

API (`tedrisat`, migration `0031_kesfet`)

- `GET /kosks` takes `level`, `field` and `q` (every word, in name, handle, description or field); a hidden köşk (`archived_at`) is in no public list. `GET /kosks/fields` lists the distinct ilim alanı of the listed köşks (the chips).
- `GET /madrasahs/explore` (declared before `:id`): each medrese with its başmüderris's name and its listed courses; `q`, `level`, `field`, `madrasahId` filters; not paginated.
- `GET /kosks/:id/decks` over a new `decks.kosk_id`: the shared decks of the köşk with card count and the caller's collection mark, for a talebe (ENROLLED or COMPLETED), a müderris or a manager of the köşk. For anyone else `accessible: false` and no decks.
- `GET /kosks/:koskId/courses` summaries gain `madrasah {id, name}`, `nextSessionAt` and `isImam` on each müderris.
- `GET /courses/enrolled` gains `includePending=true`, `nextSession {at, weekNumber}`, `madrasahName`, `isImam`, and `enrollment.completedAt` (new column `enrollments.completed_at`, set when the team marks COMPLETED and cleared on reopening; the migration backfills it from `updated_at`).
- A köşk's `courseCount` now counts published courses only (it counted drafts).

tedris-web

- `/discover` (filters in the URL, 12 köşks per page, Alert on a failed read), the köşk page rewritten, `/my-courses` (three sections, progress bar, withdrawal). `/learning` and `/learning/my-courses` redirect to the new routes.
- Reads that used to swallow errors (`getKosk`, `getKoskCourses`) now throw on anything but the API's own 400/401/403/404, so an API that is down is not a 404.
- `libs/ui`: `mds/locale.tsx` and `mds/progress.tsx` got `"use client"` (a server component importing `Progress` failed to compile).
- i18n: `DiscoverPage`, and new keys in `KoskPage` and `MyCoursesPage`, in tr, en and ar.

## What was verified

Run on this branch, against a local Postgres (:5433), tedrisat and tedris-web in dev, with Keycloak sign-in as `e2e-talebe`.

- Gate, all five targets with `--skip-nx-cache`: typecheck, test, build, lint, module-boundaries green; `node tools/ci/biome-ratchet.mjs` reports below baseline.
- `apps/tedrisat/test/e2e/discover.e2e.spec.ts` (24 tests, Testcontainers): the filters, `explore`, `decks` access rules, `includePending`, the next session, `completedAt` set, kept and cleared, imam and medrese on summaries.
- tedris-web vitest: query parsing, the three pages rendered, the follow button (optimistic and revert), the withdrawal row, the filters writing the address.
- `apps/tedris/e2e/discover.e2e.ts` (27 Playwright tests, real API and Keycloak): every acceptance criterion of 02 (1 to 7 except 7), 04 (1 to 6) and 20 (1 to 5); 27 passed on the last full run except two köşk-count assertions that exposed the draft count above, fixed afterwards and covered by an API test. The affected two tests were not re-run in the browser after the fix; the API test and the server render tests cover it.
- The pages were looked at in Chromium at 1440 and 390 px against the canvas PNGs.

## What was not verified

- Criterion 7 of 02 (the failure Alert) only in the render test; the browser spec cannot take the API down without disturbing the shared environment. Same for tedris/20's error state.
- The Arabic and English strings were not read by a native speaker; the RTL layout was not looked at.
- Keşfet's "Köşk açma başvurusu" leads to `/kosk-applications/new`, which does not exist until tedris/37 (package 36). "Ders kayıtlarına git" leads to the course page until tedris/24 (package 32). The app bar of the design (logo, Keşfet, Derslerim, bell) is not built: the shell is still the old one, as for the medrese page.
- `GET /kosks/:id/decks` lists only `is_public` decks; reading such a deck by the deck endpoints still follows their own rules (not köşk membership). No endpoint creates a köşk deck yet (`decks.kosk_id` is written only by seeds); authoring belongs to packages 34 and 50.
- Migration 0031 was applied to the shared local database only.
