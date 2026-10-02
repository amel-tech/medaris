# MDRS-177 — the ban foundation

Screens: nizam/41 "Talebeyi yasakla" (the window opened from a course's
talebe list) and nizam/42 "Yasaklamalar" with "Yasağı kaldır" (a köşk's bans).
Base: `release/stack-28-celse-temeli` (the branch already carried the earlier
stack, so the base was moved up to it with a fast-forward before any commit).

## What was done

**tedrisat**

- Migration `0030_bans` (renumbered from 0029 when the base moved: stack-28
  already owns `0029_session_cancellation`) adds the enum `ban_scope` and the
  table `bans`: `user_id`, `kosk_id`, `course_id` (null for a köşk ban),
  `scope`, `extended_from_course_id`, `reason`, `banned_by`, `banned_role`,
  `banned_tier`, `created_at`, `lifted_at`, `lifted_by`, `lift_reason`. A row
  is the ban: it is lifted, never deleted. No foreign keys, like
  `role_assignments`: the record outlives the scope it names. Partial unique
  indexes allow one open ban per person and scope, so a second request is the
  first one again. Rollback in `rollbacks/0030_bans.down.sql`.
- New module `src/ban/`:
  - `POST /courses/:courseId/bans` `{ userId, scope: COURSE|KOSK, reason }`:
    201 with the ban. A COURSE ban is for a course's müderris or ders nazırı
    and above; a KOSK ban, placed from a course, for the köşk nazımı and above
    (SYSTEM_ADMIN counts as the top). Refused with 403 `BAN_FORBIDDEN`; 400
    `BAN_TARGET_INVALID` for barring oneself or someone who runs the course;
    400 for a blank reason or one over 500 characters.
  - `GET /kosks/:koskId/bans?status=ACTIVE|LIFTED`: newest first, with the
    three counts the tabs and the "yeni yasak" line show, and per row
    `viewerMayLift` and `viewerMayExtend`. For the köşk's nazım and
    SYSTEM_ADMIN.
  - `POST /bans/:banId/lift` `{ reason }`: the kademe rule. The rank of the
    role the banner acted in is written into the row once
    (`banned_tier`: course 1, medrese 2, köşk 3, Medaris 4); a ban is lifted
    by that kademe or a higher one. 403 `BAN_LIFT_FORBIDDEN`, 409
    `BAN_ALREADY_LIFTED`, 404 `BAN_NOT_FOUND`.
  - Create and lift write `audit_log` rows in the same transaction.
- What a ban does to the talebe: `POST /courses/:id/enroll` and
  `DELETE /courses/:id/enrollment` answer 403 `BAN_ACTIVE`; the role resolver
  treats a barred, enrolled talebe as `PUBLIC` for that course (the course
  page stays open, the content is the enrolled's and is locked); the calendar
  feed drops the barred course. A KOSK ban covers every course of the köşk.
- `GET /courses/:id/enrollments` answers `RosterEnrollmentResponse`, which adds
  `ban: { id, scope } | null`. The reason is in no response a talebe reads.
- The role resolver asks `BanRepository`, not `BanService`: the service needs
  `AuthzService`, which needs the resolver, and that cycle makes the app hang
  at boot instead of failing (measured; found by the e2e suites hanging).
- `libs/services` regenerated (`pnpm openapi:tedrisat`); `bans` added to the
  API factory.

**nizam-web**

- `/[locale]/kosks/[id]/yasaklamalar` (nizam/42): the table (person with the
  "Yeni" badge for the last 24 hours, scope with the course or the köşk and
  "…dersinden genişletildi", reason, banner with role and "(siz)", time),
  Etkin / Kaldırılan tabs with counts, "Yasağı kaldır" only where the row's
  `viewerMayLift` is true and the sentence "Bu yasağı yalnız Medaris yönetimi
  kaldırabilir." where it is not, "Köşkten de yasakla", loading skeleton,
  empty and error states. 403 and 404 show the "izniniz yok" screen.
- `BanDialog` (nizam/41) on the unified kit: scope `RadioGroup` (course is the
  default; the köşk option is disabled for anyone but the köşk nazımı), reason
  `Textarea` with "Bir gerekçe yazın." and the button off until there is one,
  focus on the reason, scrim does not close it, failure keeps it open and the
  toast stays. The "Sıradaki celsenin toplantı bağlantısını yenileyin" box
  shows when the course has a next, uncancelled session.
- `LiftDialog` (nizam/42): the ban's summary, the info line, the reason.
- The existing roster (`…/courses/:courseId/students`) gets "Yasakla", the
  "Yasaklı · Bu ders/Köşk" badge and "Yasağı kaldır" in place of "Dersten
  çıkar". The köşk page gets a "Yasaklamalar" button next to "Arşiv".
- tr/en/ar messages (`nizam.BansPage`, `BanDialog`, `LiftDialog`,
  `CourseTeam.ban_*`, `KoskDetail.bans`).

## What was verified

- `apps/tedrisat/test/unit/ban/` (tier rules and `BanService`) and
  `test/e2e/ban.e2e.spec.ts` against a real Postgres (19 tests): create, the
  second request is the first, 403 for a stranger and for a müderris of
  another course, KOSK only for the nazım, self and staff refused, body
  validation, BAN_ACTIVE on enroll and on leave, KOSK ban covering a second
  course, roster marks without a reason, no reason in the talebe's own
  responses, list and counts, lift by the banner's kademe, higher kademe lifts,
  lower kademe 403 with the ban left standing, Medaris-level ban for SYSTEM_ADMIN
  alone, 409 and 404.
- `apps/nizam/test/bans.spec.tsx`: the pure helpers, `BansView` rendering and
  the three languages carrying the same keys.
- `apps/nizam/e2e/bans.e2e.ts` (Playwright, real Chromium, real tedrisat on a
  throwaway Postgres, real Keycloak sign-ins as `e2e-kosk-nazim` and
  `e2e-muderris`): 9 specs pass: the window opens for the right talebe with
  the course scope chosen and focus in the reason; the reason is required;
  the scrim does not close it but Escape and "Vazgeç" do; barring marks the
  row and swaps the buttons; a köşk ban remembers its course; the list, its
  counts and the missing lift on a Medaris-level ban; lifting needs a reason
  and moves the row to "Kaldırılan" with who and why stored; "Köşkten de
  yasakla"; the müderris gets the no-access screen on the list. The two dialogs
  were also compared with the canvas screenshots by eye.

- Gate (`--skip-nx-cache`): typecheck, lint, module-boundaries, build green;
  `-t test` green on its third run. Run 1 failed two resolver unit specs that
  built `TedrisatRoleResolver` without the new constructor argument (fixed, and
  two specs added for the barred talebe and the staff exception); run 2 failed
  one `ban.e2e.spec.ts` test once, at a `POST /courses/:id/bans` that answered
  405 instead of 201, and passed in isolation before and in run 3 after. The
  cause of that single 405 was not found.

## What was not verified, or not built

- **Device events** (`GET /kosks/:koskId/ban-device-events`, the "Cihaz
  olayları" tab, the sentence about new accounts opened on the talebe's
  devices, and the lift dialog's line about the device restriction): there is
  no device trace anywhere in the backend and the design leaves it open, as the
  specs say. None of it is built or promised in the interface; the
  corresponding sentence of nizam/41 is left out rather than claimed.
- "Kalıcı yasak talebi bekliyor" and "İtiraz edildi · karar bekliyor" (permanent
  ban request and appeal) belong to the escalation work (nazır packages, class
  C neighbours) and are not drawn.
- Lifting from the roster shows the reason window without the ban summary (the
  roster does not carry the reason; only `GET /kosks/:id/bans` does).
- "Köşkten de yasakla" on the list copies the course ban's reason to the köşk
  ban; the canvas does not show a window for it.
- nizam/41's criterion 5 (a barred talebe's `POST /courses/:id/enroll` is
  refused) is measured by the Testcontainers suite, not by a browser sign-in as
  `e2e-talebe`.
- The ban windows sit on the old roster page (shadcn shell); the full Talebeler
  tab of the canvas is not part of this package.
- The dialogs load `@medaris/ui/medaris.css` through a segment layout, like the
  archive pages, because the shell around them is still the shadcn one.
- No test pins that a barred talebe is resolved as `PUBLIC` for the content
  reads (only that the talebe's responses carry no reason), nor that the
  calendar feed drops the barred course: both are in the code and unmeasured.
