# MDRS-117 — "Takvime ekle": a Google Calendar link and an .ics file for one session

## What was done

**tedrisat**

- `GET /lessons/:id/calendar.ics` (`LessonController.calendar`) answers one
  `VEVENT` as `text/calendar; charset=utf-8`, `Content-Disposition:
  attachment`, `Cache-Control: private, no-store`.
  - `UID` `lesson-<id>@medaris.app`; `DTSTAMP` the request time;
    `SEQUENCE` the course `version` (MDRS-95), which every syllabus write
    bumps, so a re-import after a move carries a higher sequence under the
    same UID.
  - `DTSTART`/`DTEND` in UTC (`…Z`, no `TZID`), the end from
    `duration_minutes` (MDRS-110). A session without a length has no
    `DTEND`, which RFC 5545 §3.6.1 reads as ending when it starts — no length
    is invented.
  - `SUMMARY` "Course title — Session title"; `DESCRIPTION` one line saying
    the meeting link is on the session page, then the page URL; `URL` and
    `LOCATION` the page URL. The meeting URL is never read: the builder's
    input type has no such field and the controller hands it the lesson
    field by field.
  - `?locale=tr|en|ar` picks the language of that one line (default `tr`);
    anything else is 400.
  - RFC 5545 folding at 75 octets (never inside a UTF-8 character), TEXT
    escaping, CRLF line ends. Pure builder:
    `apps/tedrisat/src/course/calendar/lesson-calendar.ts`.
- Authorization is the session page's: `CourseService.getScheduledLesson`
  resolves the lesson's course and goes through `getDetail`, the same check
  `GET /courses/:id` makes (tedris renders the session page from it). Missing,
  archived, or in a course the caller may not see → 404 `LESSON_NOT_FOUND`
  (one answer, so a hidden course is not told apart from a missing lesson);
  no `scheduledAt` → 409 `LESSON_NOT_SCHEDULED`.
- New setting `TEDRIS_WEB_URL` (`TEDRISAT__TEDRIS_WEB_URL` in the root
  `.env`; `.env.example` ships `http://localhost:4000`; mapped in
  `docker-compose.yml`). It is the base of the session-page links. Unset, the
  API boots and only this route answers 503 `CALENDAR_NOT_CONFIGURED`; set but
  not an absolute http(s) URL, the boot fails and names the key
  (`src/config/tedris-web-url.ts`).
- Spec and typed client regenerated (`pnpm run openapi:tedrisat`):
  `api.lessons.getLessonCalendar`. As in MDRS-110, the generator's
  header-only version bumps in unrelated generated files were reverted.

**tedris-web**

- `GET /api/lessons/:id/calendar` (route handler) fetches the file from
  tedrisat with the server-side access token and hands it on; tedrisat's
  400/403/404/409/503 pass through with tedrisat's error code. Signed out, or
  with a token tedrisat refuses (401), it redirects to sign-in and back to
  itself.
- `AddToCalendarMenu` (B10): "Takvime ekle" → "Google Takvim" (a
  `calendar.google.com/calendar/render?action=TEMPLATE&text=…&dates=…/…&details=…&location=…`
  link built from the same content) and "Apple Takvim / Outlook (.ics)" (the
  route above). Shown to an enrolled viewer only: on the session page (B7)
  when the session has a time, and on the course page (B5) for the next
  upcoming live session. `nextLiveLesson` (the continue button) is now
  `upcomingLiveLesson` plus its old fallback, so the two cannot drift. The Google link's page URL uses the origin the viewer
  is on; it is computed only while the menu is open, so the server render
  never needs it.
- Copy in `libs/i18n` `tedris.AddToCalendar.*` (tr/en/ar). The description
  line is the same wording as tedrisat's; the two copies are named in each
  other's comments.

B10 is not in the design-system mirror (`design-system/`, read through the
`medaris-design-system` skill; MDRS-127 is designing it), so the menu follows
the pages' existing outline-button pattern and the `@medaris/ui` dropdown.

## What was verified

- `nx affected -t typecheck test build lint module-boundaries --base=fc6aea4`:
  6 projects (tedrisat, tedris-web, nizam-web, landing-web, services, i18n)
  and the 8 tasks they depend on, all green; `tedrisat:test` 36 test files,
  505 tests passed (`nx run tedrisat:test`).
- The first gate run was red, 21 suites failing at boot: `AuthzWiringAssertion`
  refuses a handler under `AuthzGuard` with neither `@Authz` nor
  `@AuthzExempt()`. The route now carries `@AuthzExempt()`, with the reason on
  the line — its rule is `getDetail`'s, applied in the service.
- `test/unit/course/lesson-calendar.spec.ts`: every field the issue lists,
  UTC only (no `TZID`), 21:00 Istanbul written as `18:00Z`, no `DTEND`
  without a length, no URL other than the session page, tr/en/ar description,
  TEXT escaping, 75-octet folding of a Turkish line without splitting a
  character.
- `test/e2e/lesson-calendar.e2e.spec.ts`: headers; no meeting URL in the body;
  after `PATCH /lessons/:id` moves the session, the same UID with a higher
  SEQUENCE and the new DTSTART; `?locale=en` and a 400 for `?locale=de`; 409
  for a session without a time; 404 for a missing and for an archived lesson,
  400 for a malformed id; another user gets a published course's session and a
  404 `LESSON_NOT_FOUND` for a draft's.
- `test/unit/course/lesson-calendar-controller.spec.ts`: without
  `TEDRIS_WEB_URL` the route answers 503 before any lookup;
  `test/unit/tedris-web-url.spec.ts`: the setting's parsing.
- `/code-review` over the diff: 10 findings. Fixed: the download route
  answering JSON for a refused token (now sign-in) and passing an empty
  `statusText` (now tedrisat's code; a 400 is no longer a 500); the meeting
  link reaching the builder inside the lesson object; the session-page menu
  shown to non-enrolled viewers; `upcomingLiveLesson` duplicating
  `nextLiveLesson`; a redundant `new Date`. Not changed: the menu on a past
  session (harmless, and a time check in render risks a hydration mismatch);
  `Date.now()` during render (the pattern `nextLiveLesson` already had); the
  full course load per download (it is what keeps the rule identical to
  `getDetail`); the default description language `tr` (tedris always sends
  its locale); the Google-link builder copying tedrisat's formatting (see
  follow-up).
- `tools/ci/assert-openapi-spec-fresh.mjs`, `assert-env-compose-parity.mjs`
  and `biome-ratchet.mjs` pass.

## What was not verified

- **Import into Apple Calendar (macOS, iOS) and Google Calendar at the right
  local time in Europe/Istanbul and Europe/Berlin** (AC 1) and **the Google
  link opening a pre-filled event** (AC 2). No calendar client was run. The
  file carries UTC times only, so each client converts to its own zone; the
  unit test pins 21:00 Istanbul = `18:00Z`.
- **Re-import updating instead of duplicating** (AC 4). The file side is
  tested (same UID, higher SEQUENCE, new DTSTART after a move); what Apple and
  Google do with it has to be seen. The Google *link* has no UID, so clicking
  it twice makes two events — that is Google's template link, not the file.
- tedris-web in a browser: the menu, the download, the sign-in redirect.
- Production `TEDRISAT__TEDRIS_WEB_URL`: not set anywhere outside
  `.env.example`; until the deployment sets it, the .ics item answers 503.

## Follow-up

- Set `TEDRISAT__TEDRIS_WEB_URL` to tedris-web's public address in the
  deployment (Coolify) before announcing the feature.
- MDRS-103 will narrow who sees a session page; this route follows
  `getDetail`, so it narrows with it only if MDRS-103 changes `getDetail` —
  check when that lands.
- MDRS-120 (calendar feed) and MDRS-121 (e-mail invitations) can reuse
  `lesson-calendar.ts` and `TEDRIS_WEB_URL`.
- `SEQUENCE` is the course version, so an edit to another session of the
  same course also raises it. Harmless (clients only need it to grow), but a
  per-lesson counter would be exact.
- The Google-link builder (`apps/tedris/features/courses/calendar-links.ts`)
  repeats tedrisat's summary, end-time rule, UTC stamp and description line.
  `@medaris/utils` cannot hold them for both today: it ships TypeScript source
  and is not in tedrisat's runtime image. A shared, built module would.
