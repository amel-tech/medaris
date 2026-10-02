# MDRS-163: Programım, Takvime ekle, Takvim aboneliği and the signed-in phone menu

Package stack-33, designs `tedris/21`, `22`, `23`, `44`. Base branch `release/stack-30-anonim-okuma`.

## What the spec said and what was already there

The specs for 21, 22 and 23 say the calendar backend does not exist. It did (MDRS-117, MDRS-120):
`GET /lessons/:id/calendar.ics`, `GET`/`POST /me/calendar-feed`, `GET /calendar/:token.ics`, the
`calendar_feed_tokens` table (hash only), a throttler and a tedris-web route for the feed. None of that
was rewritten. What was missing, and was added:

- `GET /sessions?from&to` (Programım): the live sessions of the courses the caller is ENROLLED in, in
  `[from, to)`, soonest first. A cancelled session is kept with `status: CANCELLED`; a hidden lesson,
  week, course or köşk is not listed. Window rules: ISO 8601 date or date-time with an offset, `to`
  after `from`, at most 31 days (`INVALID_SCHEDULE_WINDOW`).
- `GET /me/upcoming-lessons?limit=` (phone menu, Ana sayfa): running or upcoming sessions that stand,
  cancelled ones skipped, `limit` 1 to 20, default 5.
- Both return `ScheduleSessionResponse` (id, course, köşk, week number, title, `startsAt`, length,
  `status`, `meetingUrl`). `meetingUrl` is null once a session is cancelled or over.
- `database/enrolled-courses.ts`: one helper for "courses the user is enrolled in and not barred from",
  now used by the feed and by the schedule.
- Cancellation in the calendar (tedris/18 criterion 4, moved here): the feed and the single-session file
  now write `STATUS:CANCELLED` for a lesson with `cancelled_at` set, as they already did for an archived one.

No migration was needed.

## Web (tedris-web)

- Programım at `/schedule` (`?from=YYYY-MM-DD` moves the seven-day window; a missing, malformed or past
  day means today). Days are grouped in the viewer's zone. Rows show clock, length, course, week, title,
  platform chip or "Toplantı bağlantısı henüz eklenmedi.", status badge and a Takvime ekle menu; a
  cancelled row shows the dashed "İptal edildi" badge and its note and has no menu.
- Takvime ekle: a shared `CalendarMenu` (Google, .ics, "Tüm derslerime abone ol", and the note) used by
  the session page and by Programım. The kit `Menu` gained row glyphs, a divided row and a foot note.
- Takvim aboneliği moved to `/account/calendar`; `/learning/calendar` redirects. Three states: no link,
  a link that exists (fields masked, not copyable, because only a hash is stored) and a link just issued
  (shown with the "copy now" warning). Renewing always asks first.
- Signed-in phone menu: `MemberPhoneMenu` mounted by `PhoneChrome` for a signed-in caller (Ana sayfa,
  Keşfet, Derslerim, Programım, Desteler, the person row to Hesap, no "Çıkış yap"). Ana sayfa (`/home`)
  now has the greeting, the "Sıradaki celse" card and "Sonraki celseler" for a signed-in caller.
- Messages in tr, en and ar: `SchedulePage`, `CalendarSubscription`, `AddToCalendar`, `PhoneMenu`.

## Decisions

- Routes: `/schedule` and `/account/calendar` (the app's routes are English).
- "Saat dilimini değiştir" links to `/account`; where the zone is set is screen 34 (another package), not verified.
- The desktop top bar drawn in the 21 and 23 canvases is not drawn: no shell change is planned (decision of 27, 29, 30).
- The Turkish "'de" suffix of "Sıradaki celsen öbür gün, Cumartesi 21:00'de" is not written: it cannot be built right for every hour. The sentence reads "Sıradaki celsen: Öbür gün, Cumartesi 21:00."
- The next-session card is Ana sayfa content (the canvas shows it behind the sheet); the rest of Ana sayfa is not part of this package.
- Calendar-feed URLs use `TEDRISAT__TEDRIS_WEB_URL`; the production domain and DNS are infrastructure and were not verified.

## Verified

- tedrisat: unit specs for the window parser, the schedule service and the cancelled `.ics`; e2e specs
  (`test/e2e/schedule.e2e.spec.ts`, plus a cancelled-session case in `calendar-feed.e2e.spec.ts`) against a real Postgres.
- tedris-web: vitest specs for the window model, the page, the subscription component, the menu, the phone menu and the Ana sayfa block.
- Browser: `apps/tedris/e2e/schedule.e2e.ts`, 16 specs, passed on the last full run against the real API,
  the shared local database (port 5433) and a real Keycloak login as `e2e-talebe`: day groups, cancelled
  row, pending and foreign courses absent, `?from=`, the three menu rows, the captured Google URL, the
  downloaded `.ics`, the subscription (create, feed served over HTTP with the cancelled event, hidden on
  reload, renew and the old URL answering 404, copy to the clipboard), the 390 px sheet and its closing at 1024 px.
- Screenshots of Programım, the open menu, the subscription and the phone sheet were compared by eye with the canvases.

## Not verified

- The Google Calendar event page itself (the call to `window.open` is captured, Google is not opened).
- Apple/Google importing the feed, and Google's refresh delay.
- The Arabic (rtl) rendering of the new pages in a browser.
- One run of the browser suite failed once at the Keycloak sign-in step (a 30 s timeout) and passed on re-run.
- The other apps (teskilat, nizam-web, nazir-web, Storybook) were not started: nothing here touches them.
- Nothing writes a cancellation yet. When the endpoint comes (nizam packages) it should bump the course
  version so that a subscribed calendar sees a higher `SEQUENCE` with `STATUS:CANCELLED`.

## Gate (worktree, all with `--skip-nx-cache`)

`typecheck`, `lint`, `module-boundaries`, `build` and `test` (11 projects, Docker running) all ended with
"Successfully ran"; `node tools/ci/biome-ratchet.mjs` passes at the baseline and
`node tools/ci/assert-openapi-spec-fresh.mjs` reports the committed spec identical to the exporter's output.
