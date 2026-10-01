# MDRS-111 — validate and normalise meeting links

## What was done

- **tedrisat** — `CreateLessonDto.meetingUrl` is now
  `@IsUrl({ require_protocol: true, protocols: ["https"] })` with the message
  `$property must be an https:// URL`. `CreateWeekLessonDto` and
  `UpdateLessonDto` derive from `CreateLessonDto`, so `POST /kosks/:id/courses`,
  `PUT /courses/:id`, `POST /courses/:courseId/weeks/:weekId/lessons` and
  `PATCH /lessons/:id` all refuse `http://` and `ftp://` with a 400 whose
  `context.errors[].property` names the field (`weeks.0.lessons.0.meetingUrl`
  on a course body, `meetingUrl` on a lesson PATCH).
- **@medaris/utils** — `normalizeMeetingUrl` (trim; add `https://` when the
  link has no scheme; `http://`, `https:/` and `https:` become `https://`;
  any other scheme such as `ftp://` is left as typed) and `meetingUrlProblem`
  (`"not-https"`, `"too-long"`, `"invalid"` or `null`), next to
  `resolveMeetingPlatform` in `libs/utils/src/meeting-platform.ts`. The check
  approximates validator.js `isURL` plus `@MaxLength(500)`: a host with a
  top-level domain or an IPv4 address, no underscore, no `<`/`>`, no port 0.
  tedrisat stays the authority.
- **nizam-web** — the live-lesson editor normalises the link on blur, keeps
  showing the platform chip while typing, and explains a wrong scheme or an
  over-long link at once and a malformed one once the field is left
  (`role="alert"`, `aria-invalid`, `useId`); "save" stays disabled until the
  link is valid. `fromLiveDraft` and the course `buildDto` normalise again, so
  a link saved without leaving the field still goes out as `https://…`, and a
  course that stores a pre-MDRS-111 `http://` link is upgraded on its next
  save instead of becoming unsaveable. Before sending, the course form checks
  every lesson's link and names the lesson in a toast, instead of the API's
  `weeks.N.lessons.M.meetingUrl` path.
- **i18n** — `NewCoursePage.meetingUrlNotHttps`, `meetingUrlTooLong`,
  `meetingUrlInvalid` and `meetingUrlLessonProblem` in tr/en/ar `nizam.json`.
- **OpenAPI** — the `meetingUrl` description says "https only"; the spec was
  re-exported with `pnpm run openapi:tedrisat` and only the three affected
  generated models were kept (the generator also rewrote every file's
  `info.version` header, which is out of scope and was reverted, as in
  MDRS-110).

## What was verified

- `pnpm nx affected -t typecheck test build lint module-boundaries
  --base=70d9aea --skip-nx-cache`: green for all 7 affected projects.
- `course.e2e.spec.ts`: the three new cases (`http://` and `ftp://` on
  course create, `http://` on lesson PATCH) pass; the existing
  `https://meet.google.com/…` and `https://zoom.us/…` round-trip still passes.
- `node tools/ci/assert-openapi-spec-fresh.mjs`: spec identical to what the
  exporter writes.
- The two helpers, run by hand under Node 22: `  meet.google.com/abc-defg-hij  `
  → `https://meet.google.com/abc-defg-hij` (Google Meet, no problem);
  `http://zoom.us/j/1`, `HTTP:zoom.us/j/1` and `https:/meet.google.com/a` →
  upgraded to `https://…`, no problem; `ftp://x.com` → `not-https`;
  `https://203.0.113.5/room` → accepted; `https://my_host.zoom.us/j/1`,
  `https://meet.google.com/<x>`, `https://meet.google.com:0/x` and
  `not-a-url` → `invalid`; a 520-character link → `too-long`.

## What was not verified

- The editor was not exercised in a browser; nizam-web has no test target, so
  the inline message and the blur normalisation are covered only by
  typecheck/build.
- Whether production already holds `http://` or `ftp://` meeting links was
  not checked (no database access). nizam upgrades `http://` on the next save;
  an `ftp://` one makes the course unsaveable until that lesson's link is
  fixed in the live-lesson editor (the form names the lesson). Any other
  client of the API gets a 400 on such a lesson.
- The client check is an approximation of validator.js, not a copy; a link it
  passes can still be refused by the API (for example an IPv6 host).

## Follow-up

- Query production for `lessons.meeting_url NOT LIKE 'https://%'` before
  deploying; if any exist, fix them or rewrite `http://` to `https://`.
- `libs/utils` has no test target, so the two helpers have no unit tests;
  adding one (Vitest, like the Nest packages) would pin them.
- nizam could flag an invalid stored link on the lesson row itself, not only
  inside the editor (fits MDRS-118's sessions list).
