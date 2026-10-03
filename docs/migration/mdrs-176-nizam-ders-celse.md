# MDRS-176 — Ders aç, Müderrisleri düzenle, Ders ayarları, Müfredat, Celse planla, Celseler

Screens: nizam/32 "Ders aç", nizam/33 "Müderrisleri düzenle", nizam/34 "Ders
ayarları", nizam/54 "Müfredat", nizam/55 "Celse planla", nizam/56 "Celseler"
(stack-46, `nizam-ders-celse`). Coded on top of the stack top at the time
(`release/stack-32-tedris-celse-durumlari`, position 48 of stack #130).

## What was done

**tedrisat** — migration `0042_course_closed_cover_label` (journal tag 0042; the
number was reserved in `migration-rezerv.txt`, 0040 was left empty by an earlier
run and is not used). Down script in `src/database/rollbacks/`.

- `courses.is_closed` ("Kapalı ders") and `courses.cover_label` ("Kapak
  ibaresi"), accepted by `POST /kosks/:id/courses`, `PATCH` and `PUT
  /courses/:id`, returned by every course response. A closed course never opens
  its recordings to everyone: `visibleRecordings` takes `publicAllowed`, and
  both `GET /courses/:id/recordings` and the session page pass `!isClosed`. The
  introduction page and enrolment stay public; the sample session's content is
  the existing `isPreview` rule.
- `PUT /courses/:id/muderris` — `{version, muderris[{userId, name, title?}],
  imamUserId}`. Needs `assign_muderris` (the köşk manager, SYSTEM_ADMIN). One
  transaction: version check (409), list replaced by account, MUDERRIS role rows
  synced, the imam set (`role_assignments.is_imam`, one per course), one
  `audit_log` row `course.muderris_update` with before/after. 400
  `MUDERRIS_LIST_INVALID` for an empty list or an imam outside it,
  `MUDERRIS_DUPLICATE_USER`, 404 `MUDERRIS_UNKNOWN_USER`.
- `POST /lessons/:id/cancel` — `{version, reason?}`; sets `cancelled_at` (the
  columns existed since 0029, nothing wrote them), audit row `lesson.cancel`,
  409 `LESSON_ALREADY_CANCELLED`.
- `MuderrisResponse.isImam` on the course detail.
- Already there and used as they are: `POST /courses/:id/sessions/batch` and
  `/batch/preview` (the "bulk" endpoint of the plan), `PATCH /lessons/:id`,
  `PUT /courses/:id` (hide = leave out), `GET /courses/:id/stats`,
  `GET /courses/:id/recordings`, `GET /users/lookup`.
- OpenAPI spec and the generated client regenerated.

**nizam-web** (`features/courses/`, new)

- `/kosks/:id/courses/new` — nizam/32, a form in the kit: course, cover tone and
  caption, müderris team (e-mail lookup in the directory, imam radio), schedule
  with a summary that follows the fields, settings (closed, approval, draft or
  published). "Dersi aç" creates the course and then its sessions from the
  pattern; if the sessions fail the course stays and the page goes to Celse
  planla.
- `Müderrisleri düzenle` dialog opened from the Dersler table (nizam/33).
- `/courses/:courseId/ayarlar` — nizam/34: closed, sample session, approval
  (locked on by the köşk policy), time zone, the köşk's recordings policy (saved
  with the rest by the manager), publish/"Taslağa çek", team, "Dersi gizle".
- `/courses/:courseId/curriculum` — nizam/54: details, weeks as accordions,
  session cards, copy/hide week, unsaved-changes strip. `/edit` now redirects
  here. The old `new-course-page`, `live-lesson-editor`, `weekly-sessions-panel`
  and `muderris-picker` are removed.
- `/courses/:courseId/sessions` and `/sessions/new` — nizam/56 and nizam/55.
- i18n tr/en/ar: `CourseCreate`, `CourseTeamPicker`, `MuderrisDialog`,
  `CourseSettings`, `Curriculum`, `SessionPlan`, `Sessions`, `CourseLoad`.

## Decisions (also in PLAN.md "Kararlar")

- "Kapalı ders" is read from the canvas text: content and recordings never
  public, introduction page public. It is not an approval switch.
- The imam lives in `role_assignments.is_imam` (MDRS-133); no new column.
- A link typed with `http://` is refused as typed (nizam/54, 56), not upgraded as
  `normalizeMeetingUrl` does elsewhere.
- The preview of Celse planla is tedrisat's own expansion (the call that saves),
  so "Hafta N" is the week counted from the start date, not the course's
  existing week numbers. The canvas shows Hafta 6 to 8 for a course whose weeks
  are numbered already; that mapping is not built.
- Session titles of a new course are the course title.

## Verified

- tedrisat: `course-staff.e2e.spec.ts` (9), recordings e2e and unit additions;
  `muderris-assignments`, `session` e2e re-run green.
- nizam-web: `course-present.spec.ts` (29) and `course-views.spec.tsx` (16)
  inside the nizam suite (492 passing); Playwright `e2e/courses.e2e.ts`, 20
  specs against a real tedrisat (private Postgres), real Keycloak sign-ins and a
  real directory lookup, all green. Screens compared with the canvas in a
  browser: 32, 33, 34, 54, 55, 56.

## Not built / not verified

- nizam/33: "Çıkar" does not open the permission-hand-over question the canvas
  note mentions ("onun verdiği izinler için ayrıca karar verirsiniz"); that is
  the 4 October release gate (`_kurallar` 15), as in MDRS-175.
- nizam/34: the "since 1 September" date of the Yayın card (no publication date
  is stored); the köşk policy is edited here but its effect on recordings
  "yüklenemez to YouTube" is not enforced anywhere yet.
- nizam/56: "Ders kaydı ekle" and "Ders kayıtları" buttons of past sessions point
  at nizam/59 and 60, which are not built; the past table shows the recording
  count only. Empty/loading/error texts that the canvas lacks are mine.
- nizam/54: "Gizle" of a session or a week is applied by the save (the PUT hides
  what it leaves out); there is no confirmation. Agenda and "kaynak" fields are
  carried through but not editable on this page.
- A directory account that never signed in is refused by `PUT
  /courses/:id/muderris` (`MUDERRIS_UNKNOWN_USER`); the dialog says so. Opening
  the check to directory accounts is a product decision.
- Dark theme, the phone widths and Arabic RTL screens were not looked at.
