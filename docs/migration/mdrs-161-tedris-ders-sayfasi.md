# MDRS-161: the course page in five states (tedris/05, 06, 08, 12, 13)

Package 31 of the screen canvas. One page, `/[locale]/courses/[courseId]`, drawn for a visitor with no account, a signed-in talebe with no seat, one waiting for approval, an enrolled one, and one the course team took out. The API for the first four already existed (MDRS-103, 105, 122); this package adds the one state nobody modelled (access withdrawn) and rewrites the page on the unified kit.

## What was done

API (`tedrisat`, migration `0032_revoked_enrollment`)

- No `GET /public/courses/:id`, no `DELETE /courses/:id/enroll`, no `POST .../complete`. `GET /courses/:id` is already `@AuthzPublic()` and already withholds content from a caller who may not read it (`contentLocked`, MDRS-103); `DELETE /courses/:id/enrollment` already withdraws a request or leaves a course; `PATCH /courses/:id/enrollments/:userId` already lets the course team complete a course (and the talebe can no longer complete it through `PUT .../progress`, MDRS-105). A second route for each would be a copy of the same rule.
- New `enrollments.status = REVOKED` (enum value, declared last so the roster still sorts requests first). `POST /courses/:id/enrollments/:userId/remove` now turns the seat REVOKED instead of deleting it; the reason is still written to `audit_log`, with the previous status and progress. A REVOKED talebe resolves to the public role (as a barred one does, MDRS-177): `GET /courses/:id` answers `enrollment.status = REVOKED` and `contentLocked = true`; applying, leaving, recording progress and being completed are refused (409 `ENROLLMENT_STATE_CONFLICT`, or 403 on progress because the seat no longer holds `view_details`); `approve` brings the talebe back; the seat is not in `GET /courses/enrolled`, not counted in a köşk's students, and shows no badge on a medrese card. This changes the MDRS-105 rule "a removed talebe may apply again": they no longer apply on their own (tedris/13 criterion 5 was marked "not verifiable" in the spec; this is the decision recorded in the plan).
- A sample session (`isPreview`, the "Örnek celse") keeps its `kaynak` and `agenda` in a locked course body, for everyone; its meeting link, the cancellation reason and every other session's content stay out (tedris/05 criteria 2 and 3). MDRS-103's note that a preview opens nothing is replaced; the two e2e suites that asserted it were changed to assert the new rule per lesson.
- `CourseDetailResponse.madrasah` (`{ id, name }` or null), read by `findDetailById`, for the link in the meta line.
- The tedrisat client was regenerated (`pnpm run openapi:tedrisat`). One commit message for the REVOKED work is titled "services" because the first commit attempt failed commitlint after staging and the second attempt took both sets of files; no history was rewritten.

tedris-web

- `features/courses/course-view.ts`: the page's logic as plain functions (state from enrollment, totals, span, weekly rhythm, next session, week state, "yarın / öbür gün / 3 gün sonra", the application's time, progress parsing).
- `course-page.tsx` rewritten on the kit: breadcrumb, cover, title, description, meta line (medrese, köşk, weeks, sessions, hours), müderris line with the imam badge, tabs (Müfredat, Ders kayıtları, Ders destesi for a seat, Müderrisler), the sample-session block for a visitor, a talebe with no seat and one waiting. `course-programme.tsx` draws the weeks (kit `Weeks`, `WeekAccordion`, `LessonRow`): locked rows for anyone without a seat, the sample session linked to its block, the next session marked, ended weeks done, a week that has not begun says "{tarih} tarihinde açılır", a cancelled session wears "İptal edildi". `course-aside.tsx` draws the cards per state; `progress-dialog.tsx` is "İlerlemeni güncelle". The preview of a draft (tedris/14) and the application window (tedris/07) are kept.
- Removed: `syllabus.tsx` and `cover.tsx` (the shadcn weeks and cover; no other consumer).
- i18n (tr, en, ar): about sixty keys under `CoursePage`.
- Playwright e2e `apps/tedris/e2e/course.e2e.ts` with `course-page-seed.ts`, on the infrastructure package 27 set up.

## What was verified

Run on this branch, against the local Postgres (:5433), tedrisat and tedris-web in dev; see the end of this file for the gate.

- tedrisat e2e `course-team.e2e.spec.ts` (33): remove turns the seat REVOKED and audits it; a revoked talebe's page, the 409/403 answers, no meeting link in the body; approve reinstates; the seat leaves `/courses/enrolled`; the page names the medrese to a caller with no token. `public-pages.e2e.spec.ts` and `course.e2e.spec.ts`: the sample session's content and the closed session's absence, per lesson.
- tedris-web unit `course-view.spec.ts` (15) and `course-page-states.spec.ts` (12): every state's card, locked labels, the sample block, the next session, progress, cancelled mark, "açılır" date, REVOKED, and that every new key exists in tr, en and ar.
- Playwright `course.e2e.ts` (9) against the real API and Keycloak sign-in as `e2e-talebe` and `e2e-medrese-nazir`: a visitor sees the page, four locked weeks, the sign-in and register links, the sample session's agenda and source, no meeting link; the API answer to a caller with no token has no `meetingUrl` and no `kaynak` on the closed session; a draft is 404; "giriş yap" reaches the sign-in; applying opens the window, "Tamam" leaves "Onay bekliyor" with the time of the application, the row is PENDING, withdrawing restores "Kayıt başvurusu yap" and deletes the row; an enrolled talebe sees the next session, "Toplantı bağlantısı henüz eklenmedi.", the calendar button, %40, a week that opens later, a cancelled session, and the deck tab; progress 101 is refused in the dialog, 55 is saved (page and row); "Derse devam et" opens the session page; a REVOKED talebe reads the withdrawal, has no apply button, sees four locked weeks and none of the hidden content, and "Derslerime dön" lands on `/my-courses`.
- Screenshots of the visitor, waiting, enrolled and revoked states compared with the canvas by eye (1440 px).

## What was not verified, or differs from the canvas

- The desktop app bar. The canvas draws the unified top bar; the app's shell has not moved (no package plans it, packages 27, 29 and 30 recorded the same), so the old header stays above the page.
- The sample session's video area ("Ders kaydı burada oynar") and its PDF list. A recording has no model until package 32, and a session has no files of its own (resources belong to the course); the block shows the agenda and the source line only. The "Ders kayıtları" tab has no count and an empty state; the "Ders destesi" tab (seat holders only) an empty state, because a course has no deck until package 34.
- "Sona erdi" on a locked week. The kit replaces a locked week's state with the lock, so the visitor's weeks carry the lock and ", kilitli", not the "Sona erdi" the canvas draws beside them.
- The application time reads "Başvurun bugün 10:02 ders kadrosuna iletildi": the canvas's "10:02’de" suffix cannot be written correctly for every minute, so none is written.
- A talebe's own `DELETE` of someone else's application (tedris/08 criterion 4) and withdrawing an approved one (criterion 5) are covered by the API's own rules (`leave` acts on the caller's `sub`; the existing leave tests and the new REVOKED test), not by a browser test with a second token.
- The notification "Onaylandığında bildirim alırsın" — package 37 built the notification store; nothing here writes one on approval.
- The shared dev database now has the REVOKED enum value (migration applied to `:5433`); other branches' code ignores it.
- The `.env` check `grep -c set-me-per-machine .env` was made 0 by editing the one commented-out line locally; `.env` is not committed.

## Gate

Run on this branch with `--skip-nx-cache`: typecheck (17 projects), test (11 projects), build (8 projects), lint (17), module-boundaries (17) green; `node tools/ci/biome-ratchet.mjs` at its baseline (72 warnings, 23 infos). tedris-web has 262 unit tests (a first run of the gate found 4 failing in `course-preview-page.spec.ts` because its `next-intl` mock had no `raw`; the mock was fixed and the run repeated green). The full browser suite (`pnpm nx run tedris-web:test:e2e`, not part of the gate) ran 92 specs: 77 passed, 13 skipped, 2 failed. One failure is `discover.e2e.ts` "an unknown köşk answers 404", which fails on the unmodified base (recorded in MDRS-160). The other, `anonymous.e2e.ts` "medrese page", expected the signed-in hint text where the visitor's hint ("Medresenin bütün dersleri, …") has been shown since MDRS-160; its expectation was corrected here and the spec passes.
At 390 px the page's own content fits, but the document is 501 px wide because the old header (logo, search, buttons) overflows; that header is outside this package.
