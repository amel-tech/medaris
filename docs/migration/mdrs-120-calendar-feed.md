# MDRS-120 — A personal calendar feed that Google and Apple Calendar can subscribe to

## What was done

**tedrisat**

- New table `calendar_feed_tokens` (migration `0020_calendar_feed_tokens`,
  generated with `drizzle-kit generate`; hand rollback in
  `src/database/rollbacks/0020_calendar_feed_tokens.down.sql`): one row per
  user, `user_id` primary key, `token_hash` unique, `created_at`. The same
  migration adds `lessons_scheduled_at_idx`, for the feed's range predicate,
  which runs on every poll of every subscriber. The token
  is 32 random bytes written base64url (43 characters); only its hex SHA-256
  is stored. An unsalted fast hash is enough for a 256-bit random secret and
  keeps the lookup an indexed equality.
- `GET /me/calendar-feed` (`getMyCalendarFeed`): `{ active, createdAt }`. The
  URL cannot be read back — only its hash exists.
- `POST /me/calendar-feed` (`regenerateMyCalendarFeed`, 200): issues a new
  token, overwrites the row, and returns `{ url, webcalUrl, createdAt }` this
  once. The old URL answers 404 from then on ("Bağlantıyı yenile").
- `GET /calendar/<token>.ics` (`getCalendarFeed`), no `AuthGuard` — the
  secret in the URL is the credential. A name that is not `<43 base64url>.ics`,
  a token never issued and a replaced token all answer the same 404
  `CALENDAR_FEED_NOT_FOUND`. `Cache-Control: private, no-store`,
  `X-Robots-Tag: noindex`. Unset `TEDRIS_WEB_URL` → 503
  `CALENDAR_NOT_CONFIGURED`, as for MDRS-117's route.
- **Rate limit**, two layers:
  - per feed: 20 reads a minute per resolved token (`FeedPollLimiter`,
    counted in `CalendarFeedService` after the hash lookup), so a leaked URL
    being hammered is refused with 429 while every other feed keeps
    answering. Only real feeds reach the counter, so it holds at most one
    entry per user with a feed;
  - per address: the route overrides the shared default (100/min) with
    600/min (`CALENDAR_FEED_THROTTLE`). It bounds one client trying made-up
    tokens; it is higher than the default because every read arrives through
    tedris-web, so one address carries every subscriber's calendar app, and
    100/min would start refusing real feeds at a few thousand hourly
    subscribers.
- **Feed content** (`CalendarFeedRepository.findSessions`): every lesson with
  a `scheduled_at` from 30 days back to 180 days ahead, in every course where
  the user
  - is enrolled with status `ENROLLED` or `COMPLETED` — listed positively,
    so `PENDING` and any later state (a ban, MDRS-113) stay out;
  - is listed as müderris (`course_muderris.user_id`);
  - owns the köşk (manager).
  Visibility follows `getDetail`: a hidden (archived) course is in nobody's
  feed, a draft only in its köşk manager's. A nazır gets nothing from being a
  nazır, as in the role resolver.
- **Event format:** `lesson-calendar.ts` now builds the `VEVENT` once and
  both `buildLessonIcs` (MDRS-117) and the new `buildCalendarFeedIcs` use it,
  so UID (`lesson-<id>@medaris.app`), SEQUENCE (the course `version`), UTC
  times, SUMMARY/DESCRIPTION/URL/LOCATION are identical. A removed lesson (or
  a lesson in a removed week) stays in the feed with `STATUS:CANCELLED`;
  removal bumps the course version, so its SEQUENCE rises. The calendar
  carries `X-WR-CALNAME:Medaris`, `REFRESH-INTERVAL;VALUE=DURATION:PT1H` and
  `X-PUBLISHED-TTL:PT1H` (hints Apple and Outlook honour; Google ignores them).
  The description line's language is the user's `users.locale` when it is
  tr/en/ar, else tr.
- **No meeting links:** the query does not select `meeting_url`, and the
  builder's input type has no such field.
- Spec and typed client regenerated (`pnpm run openapi:tedrisat`): `MeApi`
  gains the two `/me/calendar-feed` methods, a `CalendarApi` is generated for
  the feed route (unused by the apps — tedris-web proxies it with a plain
  `fetch`). The generator's header-only version bumps in unrelated generated
  files were reverted, as in MDRS-110 and MDRS-117.

**tedris-web**

- `GET /calendar/<token>.ics` (`app/calendar/[file]/route.ts`): the public
  address calendar apps subscribe to. It passes the request to tedrisat
  without a session and hands the body on; tedrisat's 404/429/503 pass through
  with its error code (and `Retry-After`). The middleware does not run here —
  its matcher skips paths containing a dot — so there is no sign-in redirect
  and no locale prefix. Feed URLs are therefore `${TEDRIS_WEB_URL}/calendar/…`,
  which reuses MDRS-117's `TEDRISAT__TEDRIS_WEB_URL`; no new setting.
- B11 "Takvim aboneliği" at `/[locale]/learning/calendar`, linked from
  "Derslerim". It says whether a link exists and when it was created (or that the
  status could not be read), offers "Bağlantı oluştur" / "Bağlantıyı
  yenile" — always behind a confirm, since the page may be stale or may not
  know whether a link exists, and a new link stops the old one — and shows a
  new link once: the `webcal://` form with
  "Apple Takvim'de aç", the `https://` form with Google's "URL ile" steps and
  a link to that settings screen, copy buttons for both. It states plainly
  that Google refreshes subscribed calendars on its own schedule, possibly
  hours later, and that the link is private and carries no meeting links.
  Copy in `libs/i18n` `tedris.CalendarSubscription.*` (tr/en/ar).

B11 is not in the design-system mirror (`design-system/`, read through the
`medaris-design-system` skill; the `DesignSync` tool was not available in
this session, and MDRS-127 is still designing it), so the page follows the
existing pages' breadcrumb, card and outline-button pattern.

## What was verified

- `nx affected -t typecheck test build lint module-boundaries --base=6120d51
  --skip-nx-cache`: 6 projects (tedrisat, tedris-web, nizam-web, landing-web,
  services, i18n) and the 8 tasks they depend on, all green;
  `nx run tedrisat:test`: 38 test files, 527 tests passed.
- `test/e2e/calendar-feed.e2e.spec.ts` (11 tests): the two URL forms and a
  status that never repeats the URL; an enrolled talebe's session with
  `X-WR-CALNAME:Medaris`, the session page as URL, and no meeting link;
  not-enrolled, pending and removed-enrollment courses left out, and a pending
  one appearing after approval; the köşk manager's feed with a draft, and a
  hidden course leaving every feed; the 30/180-day window at its edges;
  a `PATCH` move giving one event with the same UID, a higher SEQUENCE and
  the new DTSTART; a removed session kept as `STATUS:CANCELLED` with a higher
  SEQUENCE; the old URL answering 404 `CALENDAR_FEED_NOT_FOUND` after
  regeneration; malformed and never-issued names answering 404; 429 after 20
  reads of one feed while a feed nobody has read still answers; only a 64-hex
  hash in the table.
- `test/unit/calendar-feed/calendar-feed.spec.ts` (11 tests): the calendar
  header lines, a feed event byte-identical to MDRS-117's single-file event,
  `STATUS:CANCELLED` only on the cancelled event, the locale fallback, the
  token's shape and hash, `<token>.ics` parsing, the https/webcal pair, the
  per-feed limiter's window.
- The existing MDRS-117 unit and e2e suites for the single `.ics` still pass
  after the builder refactor.
- `/code-review` over the diff: 7 findings. Fixed: a failed status read shown
  as "no link yet", so "Bağlantı oluştur" replaced a live feed without a
  confirm (and the same from a stale second tab) — the confirm is now always
  asked and a failed read has its own text; the per-URL throttle tracker
  replacing the per-address one, which let made-up tokens through unbounded —
  now two layers, see *Rate limit*; no index for the feed's range predicate;
  the "shown only once, regenerate to see it" line sitting above a link just
  issued. Not changed: the tedris-web proxy using `fetch` rather than the
  generated `CalendarApi` (it passes tedrisat's status and `Retry-After`
  through unchanged, which the generated client would turn into an exception
  to unpack; the name check before the URL is built stays either way). Follow-up: `ETag`/304 for the feed (below).
- `tools/ci/assert-openapi-spec-fresh.mjs` (49 paths),
  `assert-env-compose-parity.mjs` and `biome-ratchet.mjs` pass.

## What was not verified

- **Subscribing in Apple Calendar (macOS, iOS) and Google Calendar** (AC 1)
  and **a reschedule in nizam reaching the subscribed calendars after their
  next refresh without duplicates** (AC 2). No calendar client was run, and
  Google can only subscribe to a URL it can reach on the public internet — a
  local `http://localhost:4000` URL cannot be tested with Google at all. The
  feed side is tested (one event per UID, rising SEQUENCE, new DTSTART after
  a move).
- What Apple and Google show for a `STATUS:CANCELLED` event (Google usually
  hides it, Apple may strike it through) — not observed.
- tedris-web in a browser: the B11 page, the copy buttons, the `webcal://`
  hand-off, and the proxy route (`app/calendar/[file]/route.ts`); only
  typecheck, lint and `next build` ran over them.
- Production `TEDRISAT__TEDRIS_WEB_URL` is still unset outside
  `.env.example` (see MDRS-117); until it is set, B11's button and the feed
  answer 503.

## Follow-up

- The feed token is in the URL path, so it reaches access logs: the reverse
  proxy's, tedris-web's and tedrisat's request logs if they record paths.
  Worth checking what the production proxy logs, and redacting
  `/calendar/*.ics` there, before announcing the feature.
- "Unenrolled and banned users lose the course's sessions" holds for
  unenrolment (the enrollment row goes) and for any non-listed enrollment
  status. MDRS-113's bans are not in this branch; when they land, check that
  a course-, köşk-, medrese- or platform-level ban removes the sessions — a
  ban stored outside `enrollments.status` needs its own predicate in
  `CalendarFeedRepository.findSessions`.
- B11 is linked only from "Derslerim", which the "Öğrenme" page links to only
  while the viewer has a course in progress; a müderris or köşk manager with
  no enrollment reaches it by address. Where B11 sits in the navigation is for
  the MDRS-127 design to say.
- There is no route to delete a feed without replacing it; a "turn off"
  button would be `DELETE /me/calendar-feed`.
- `SEQUENCE` is the course version, so an edit to another session of the same
  course also raises it (MDRS-117's note applies to the feed too).
- Both rate-limit stores are in memory per process (MDRS-31): with more than
  one tedrisat replica each budget multiplies by the replica count.
- The feed carries no `ETag`/`Last-Modified`, and `DTSTAMP` is the request
  time, so every poll is a full query and a full download. A validator
  derived from the newest course `version` and `updated_at` in the feed would
  let clients get 304s.
