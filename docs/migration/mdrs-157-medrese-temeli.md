# MDRS-157 — the medrese page, on the medrese layer that already existed

MDRS-157 is package 27 of the screen-canvas plan: design `tedris/03`, the page
of one medrese. Its spec said the medrese "does not exist in the backend" and
asked for a table, a `course.madrasahId` column and a migration. All three were
already there (MDRS-106, MDRS-134: `madrasahs`, `courses.madrasah_id`,
`madrasah_kosk_hosting`, `GET /madrasahs/:id`), so no migration was written.
What was missing was what the page shows: the medrese's courses with the köşk
each is opened in, the caller's own enrollment, the next session and the
başmüderris's name.

## What was done

Backend (`apps/tedrisat/src/madrasah/`)

- `GET /madrasahs/:id/overview` (`getMadrasahOverview`), open to callers with no
  token like the rest of the medrese reads (MDRS-122). Returns
  `{ headMuderris, courses[], kosks[] }`.
  - `courses`: the medrese's PUBLISHED, not hidden courses in köşks that are not
    unlisted. Each carries `id, title, category, coverHue, koskId, koskName`,
    `muderris[{ name, title, isImam }]`, `enrollmentStatus` (the caller's own,
    null with no token) and `nextSessionAt` (earliest non-archived session still
    ahead, in a non-archived week). `meetingUrl` is never in it.
  - `kosks`: derived from those courses, so the köşk card lists only köşks the
    medrese really has a course in (acceptance criterion 5), not every hosting
    right.
  - `headMuderris`: the oldest held MEDRESE_BASMUDERRIS grant, its name from
    `users` (null if that person never signed in) and how many of the listed
    courses they teach.
- Four small reads over the course ids instead of one wide join. DTOs
  validated by the Swagger decorators; the route authorizes through the
  existing `byExistingMadrasah` resolver (404 for an unknown or malformed id).
- `libs/services/swagger-docs/tedrisat.json` and the generated client were
  regenerated with `pnpm run openapi:tedrisat`.

Frontend (`apps/tedris`)

- `MadrasahPage` rewritten on the unified kit (`@medaris/ui/mds/*`: Breadcrumb,
  Avatar, Card, CoverPattern, Badge, Icon) and the `.mds-*` classes, laid out
  with the canvas note 29 Tailwind equivalents of `.ekran-*`. Title, `MEDRESE`
  eyebrow, `N ders · Başmüderris …`, the reading paragraphs, course cards with
  the Arabic category on the cover, enrollment badge, muderris line (`, imam`),
  `{Köşk} · Sonraki celse Paz 21:00`, the Başmüderris side card and a Köşkler
  side card. The page's data is one call, `getMadrasahOverview`.
- `formatNextSession` (weekday + clock in the viewer's zone, Istanbul by
  default) and `enrollmentBadge` (ENROLLED → "Devam ediyor", PENDING → "Onay
  bekliyor", COMPLETED → "Tamamlandı", none → no badge) are pure and unit tested.
- i18n: `tedris.MadrasahPage.*` keys in tr, en and ar.
- `libs/ui/src/mds/avatar.tsx` gained `"use client"`: it uses a hook and Base UI,
  and a server component cannot import it without the directive. The other `mds`
  files that hold hooks have the same gap; only the one this page needs was
  fixed.

Browser e2e (new, first in the repo)

- `apps/tedris/playwright.config.ts`, `apps/tedris/e2e/`, script `test:e2e`
  (Nx target `test:e2e`, not part of `-t test`). Real Chromium against the
  running web app and tedrisat; seeds through SQL (`E2E_DATABASE_URL`) under random
  ids and removes them. `@playwright/test` 1.63.0 is in the catalog.

## Things worth knowing

- The medrese route segment loads `@medaris/ui/medaris.css` itself
  (`app/[locale]/madrasahs/layout.tsx`); the rest of tedris is still on the
  shadcn kit. Measured: that stylesheet redefines Tailwind's breakpoints, which
  narrowed every `container` on the page to 768 px and, because Next keeps a
  loaded stylesheet after client navigation, would have done so on the other
  pages too. The shell's four `container` classes (header, tab view, legal
  footer) became `max-w-[80rem]`; the tab view leaves its `<main>` wrapper off
  `/madrasahs` so the page owns its `<main>`. At viewports of 1536 px and wider the
  shell is 80rem wide instead of 96rem.
- The app bar of the design (logo, Keşfet, Derslerim, bell, avatar) is not
  built: tedris has no shell migration package in the plan. The page renders
  under the old header.
- The breadcrumb is the kit's `<a>`, not `next/link`: a full navigation to
  `/learning`. The discover page itself is not built (tedris/02, package 29).
- Cover tone is the kit's hash of the course id, not a stored choice.

## What was verified

- `apps/tedrisat` e2e (Testcontainers Postgres): three new cases in
  `madrasah.e2e.spec.ts` — anonymous read (courses, next session, imam, head
  müderris, no meeting link, draft and unlisted-köşk courses left out), own
  enrollment state (PENDING for the owner, null for a stranger), 404 for an
  unknown and a malformed id, empty list for a medrese with no courses.
- `apps/tedris` Vitest: badge mapping, `Paz 21:00` formatting in two zones,
  the page markup for badges, no-badge, empty medrese, i18n key parity.
- Playwright against a locally running tedrisat + tedris-web + Postgres: six
  cases pass (page content, time format and no meeting link, köşk card, course
  link, unknown id 404, and a real Keycloak sign-in as the `e2e-talebe` test
  user showing `Devam ediyor` on an ENROLLED course and `Onay bekliyor` on a
  PENDING one). The last case reads `E2E_TALEBE_EMAIL`, `E2E_TALEBE_PASSWORD`
  and `E2E_TALEBE_SUB` from the environment and is skipped when they are
  unset. A screenshot was compared by eye with `ekran.png`.
- Base: the branch was merged with `release/stack-37-bildirim-temeli`
  (conflicts in the three `tedris.json` locale files and `tab-view`, both
  resolved by keeping both sides); the five gate targets were re-run green.

## What was not verified

- `tedrisat:test` failed once in the full `run-many -t test` run (one e2e
  seed call did not return 201) and passed on three reruns; Nx flagged it as a
  flaky task. The cause was not found.
- Mobile layout (390 px), dark theme, Arabic (`rtl`) rendering.
- Viewing the page with the unified stylesheet loaded and then navigating to a
  shadcn page in the same session (the leak the `container` change was meant to
  stop): the `container` classes were removed, other shadcn pages were not
  re-checked page by page.
