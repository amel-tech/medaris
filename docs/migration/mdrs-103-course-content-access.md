# MDRS-103 — the course page is public, its content is not

## Problem

`GET /courses/:id` was `@AuthzExempt()` and returned the whole course,
every lesson's `meetingUrl` included, to any signed-in caller once the course
was PUBLISHED. The tedris lesson route checked nothing; only the links leading
to it were hidden. So anyone with an account could read every meeting link of
every published course.

The owner decided on 26 September (recorded on MDRS-43) that a course page is
public — description, programme, schedule, müderris, enrollment — and that the
lessons are not.

## What changed

### `libs/common`

- `MATRIX.course[PUBLIC]` is `[VIEW, ENROLL]` (was `[ENROLL]`). This is the
  issue's recommendation, **pending the matrix discussion**. `VIEW` is the page;
  the content is `VIEW_DETAILS`, still held by ENROLLED, MUDERRIS and
  KOSK_MANAGER only.
- `auth-matrix.spec.ts` pins three things: the new PUBLIC row; that
  `VIEW_DETAILS` and `JOIN_LIVE_LESSON` belong to exactly those three roles;
  and that every course role with `EDIT` also has `VIEW_DETAILS`. The session-level
  write responses rely on that last one (see below).

### `apps/tedrisat`

- `GET /courses/:id` is `@Authz(SCOPES.VIEW, byParam(ENTITIES.COURSE))` and no
  longer exempt. A missing course is still 404 from the resolver, and a
  malformed id still gets 400 from `ParseUUIDPipe`. DRAFT and hidden courses
  remain not-found to non-managers inside `getDetail`.
- `domain/course-content.ts`: `withoutContent` removes `kaynak`, `meetingUrl`
  and `agenda` from every lesson and `url` from every resource. The keys are
  dropped entirely, not set to null. It keeps titles, types, `scheduledAt`,
  `durationMinutes`, `isPreview` and the order. `isPreview` opens nothing: a
  meeting link is never public.
- `CourseService.viewDetail` / `present`: `getDetail` and then the content
  rule. A caller without `VIEW_DETAILS` gets the filtered body with
  `contentLocked: true`. PENDING counts as not enrolled. Every route that
  returns a course detail now goes through it: GET, PATCH, PUT, archive,
  restore and create.
- **Audit.** A content read by anyone who is neither an enrolled talebe
  (ENROLLED/COMPLETED) nor one of the course's müderrisler writes one
  `audit_log` row (`action: course.content_read`, `details: { title,
  systemAdmin }`). Today that means the köşk manager and SYSTEM_ADMIN. It is
  written before the body is returned, so a failed write fails the read.
  Only reads are audited (`GET /courses/:id`). The write routes echo the course
  with `audit: false`, because the write itself is the event.
- Responses that embed lessons, checked one by one:
  - **Course detail:** filtered, as above.
  - **`LessonMutationResponse` and the session-batch result:** require `EDIT`,
    which implies `VIEW_DETAILS` (pinned by the matrix spec), so they are not
    filtered.
  - **`lessons/:id/calendar.ics`:** already builds from title, time and length
    only.
  - **The calendar feed:** selects no content columns.
  - **Summaries and the enrolled list:** embed no lessons.
- `CourseDetailResponse.contentLocked` (required). `LessonResponse`'s three
  content fields and `ResourceResponse.url` are documented as absent unless the
  caller holds `view_details`. Spec and client were regenerated with
  `pnpm run openapi:tedrisat`. Generated files whose only change was the
  `The version of the OpenAPI document` header (stale since the 0.2.0 release)
  were left out of this change.

### `apps/tedris` and `libs/i18n`

- The lesson route renders **B8** (`LessonLocked`) when the API answered with
  `contentLocked`. The page never receives the content, so its source cannot
  contain a meeting link.
- B8 picks one of three calls to action, through `lessonLockReason`:
  - **sign in:** no session. The button links to the sign-in page with the
    lesson as `callbackUrl`. Latent until MDRS-122, because the route is behind
    the auth middleware.
  - **apply:** signed in and not enrolled. The button calls `enrollInCourse`,
    then `router.refresh()`.
  - **pending:** a PENDING enrollment. The control is disabled.
- B8 has no drawing. It follows the system's card rule (one primary per
  surface) and `DeckUnavailable`, the existing "you cannot open this" card. The
  source was the `design-system/` mirror: the claude.ai/design project answered
  `404 project not found` to `get_project`.
- New `tedris.LessonLocked` keys in `tr`, `en` and `ar`.

## What was verified

All runs used the prefix `env -u NODE_ENV -u DB_PORT -u POSTGRES_DB -u POSTGRES_USER -u POSTGRES_PASSWORD -u DATABASE_URL`.

| Gate | Result |
| -- | -- |
| `typecheck` | 17 projects green |
| `lint` | 17 projects green |
| `module-boundaries` | 17 projects green |
| `build` | 8 projects green |
| `test` | 9 projects, 78 files, 1307 tests green (tedrisat 45 files / 644 tests, tedris-web 6 / 37, common 7 / 86) |
| `tools/ci/biome-ratchet.mjs` | errors 0, warnings 75, infos 24 — equal to baseline |
| `tools/ci/assert-openapi-spec-fresh.mjs` | 52 paths, identical |
| release-config, env-compose-parity, affected-isolation | exit 0 |

- The AC e2e cases are a second `describe` in `course.e2e.spec.ts`. It boots
  its own app with real token verification so that each role, and SYSTEM_ADMIN,
  is a minted token:
  - non-enrolled caller: 200, no content anywhere in the body;
  - PENDING caller: the same filtered body;
  - enrolled, completed and müderris callers: the full body, no audit row;
  - köşk manager and SYSTEM_ADMIN: the full body plus one audit row;
  - a write echo is not audited;
  - DRAFT is still 404 for everyone but the manager;
  - missing id 404, malformed id 400, no token 401.
- The old "PUBLISHED course is still visible" assertion in `hides DRAFT
  courses from non-owners` (the `:705` the issue names) now asserts the
  filtering as well as the 200.
- **Mutation check:** with the filter disabled, those 3 tests fail.

## What was not verified

- B8 was not seen in a browser. Its markup is covered by a server-render test
  (`apps/tedris/test/lesson-locked.spec.ts`) in a node environment. No dev
  server was run against a live Keycloak.
- The "sign in" state cannot be reached end to end until MDRS-122 lets an
  anonymous caller read a course.
- nizam was not exercised by hand. It typechecks and builds against the new
  `contentLocked` field.

## Follow-ups

- **Matrix discussion pending:** whether `PUBLIC → VIEW` stays as it is or
  becomes the permission catalogue's public grant (MDRS-135).
- **Audit volume:** every GET by a köşk manager, including nizam's editor
  loads, writes a row. If that proves noisy, dedupe per actor and course per
  day, or audit only the content-bearing views. That is a product decision.
- **MDRS-122:** an anonymous course page should reuse `withoutContent`
  unchanged (`resolveAnonymous` for the course entity).
- **MDRS-113 (bans):** a banned caller must resolve below `VIEW_DETAILS`. The
  filter needs no change if the resolver does that.

## Role model v2 hook (MDRS-133/134/135)

The single decision point is `CourseService.present`. It asks
`AuthzService.can(user, course, VIEW_DETAILS)`, and
`isCourseParticipant` (`domain/course-content.ts`) decides whether the read is
audited.

- **Content permission:** v2 replaces `VIEW_DETAILS` with the catalogue's
  content permission scoped to the course. That covers the köşk nazımı and, for
  a medrese course, the başmüderris.
- **Audit details:** the audit row's `details` should name the permission the
  read went through instead of `systemAdmin`.
- **Closed courses:** the sample lesson (`lessons.is_preview`) is an exception
  to `withoutContent` that v2 adds there.
- **Passive courses:** these lock out enrolled talebe too, which would be a
  check in `present` ahead of the `can` call.
