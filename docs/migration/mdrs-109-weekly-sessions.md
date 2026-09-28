# MDRS-109 — Generate weekly live sessions from a pattern (phase 1)

A manager can turn "every Tuesday and Thursday at 21:00, 60 minutes, from
6 October, 8 sessions" into ordinary dated live sessions in one step, and
"Haftayı kopyala" now moves the copies a week on instead of stacking them on
the originals. The pattern itself is not stored — that is phase 2.

## What was done

**tedrisat**

- `src/course/domain/weekly-pattern.ts` — `expandWeeklyPattern`. It walks
  calendar days in the pattern's zone and turns each matching local date and
  time into an instant only at the end (`zonedTimeToInstant`, the same
  two-pass offset lookup as `fromZonedDatetimeLocal` in `@medaris/utils`), so
  21:00 stays 21:00 across a daylight-saving change. Week placement: the
  Monday-to-Sunday week that holds `startDate` is 1, the next is 2, and so on.
  Limits: at most 200 sessions and a range of at most 366 days; exactly one of
  `endDate` or `count`.
- `POST /courses/:courseId/sessions/batch` (`createSessionBatch`) — expands the
  pattern and inserts every session in one transaction through the MDRS-95
  session-level path (`bumpVersion` first, like `createLesson`), never through
  the whole-course `PUT`. The course's zone is read and the pattern expanded
  inside that transaction, after the course row is locked, so a concurrent
  zone change cannot land between the two. Each session goes into the live week with its week
  number; a missing week is created with the title `Hafta N`. Sessions are
  `LIVE`, appended after what the week already holds. A `meetingUrl`, if given,
  is set on the first session only (links change every week).
- `POST /courses/:courseId/sessions/batch/preview` (`previewSessionBatch`) —
  the same expansion, nothing written. The C6 preview list calls it, so what is
  previewed is what the save writes; there is no second implementation in the
  browser.
- Both are `@Authz(SCOPES.EDIT, byParam(COURSE, "courseId"))`. `timeZone`
  defaults to the course's zone (MDRS-110). A pattern that validates but
  cannot be expanded answers 400 `INVALID_SESSION_PATTERN` with
  `context.problem` (`INVALID_DATE`, `END_OR_COUNT_REQUIRED`,
  `END_BEFORE_START`, `RANGE_TOO_LONG`, `TOO_MANY_SESSIONS`, `NO_SESSIONS`).
- No migration: the batch writes existing columns only.

**services** — spec and typed client regenerated (`pnpm run openapi:tedrisat`).
The generator also rewrote the `OpenAPI document` version line in every unrelated
generated files; those version-only changes were reverted, as in earlier tasks.

**nizam-web**

- `weekly-sessions-panel.tsx` — the C6 "Haftalık tekrar" mode, under the
  curriculum on the course edit page: title, weekdays, start time, duration,
  time zone (defaults to the course's), start date, and an end date or a number
  of sessions, plus an optional link for the first session. "Önizle" shows the
  server's list with each session's week; "Oturumları oluştur" asks for
  confirmation (unsaved form edits are lost), saves it and reloads the page, because the batch bumps the course version and the form
  around it would otherwise hit 409 on its next save. On a course that has not
  been saved yet only a hint is shown — the endpoint needs a course id.
  **Placeholder layout:** the C6 design (MDRS-127) does not exist yet; the
  panel uses the form's own building blocks and is to be redone when it lands.
- "Haftayı kopyala" moves every copied session seven days on with
  `shiftDatetimeLocal` (new in `@medaris/utils`): same wall-clock time a week
  later in the course's zone.
- Strings under `nizam.WeeklySessions` in `tr`, `en` and `ar`.

**utils** — `shiftDatetimeLocal`, and the package's first `test` target
(`vitest.config.ts` merging the workspace base, like `libs/env`), because no
web app has a test runner and the "Haftayı kopyala" AC needed a test somewhere.
Coverage is collected for `src/time-zone.ts` only, with no threshold yet.

## Acceptance criteria — how each is verified

| AC | Test |
| -- | -- |
| Tue/Thu 21:00, 60 min, Europe/Istanbul, from 6 October, 8 sessions → 8 sessions at 18:00 UTC in weeks 1–4 | `test/unit/course/weekly-pattern.spec.ts` (expansion) and `test/e2e/session-batch.e2e.spec.ts` (through the endpoint: instants, week numbers, weeks 3–4 created as `Hafta 3`/`Hafta 4`, 60 minutes, link on the first only) |
| Europe/Berlin across 25 October 2026 stays at 21:00 local on both sides | both files: 18 Oct 19:00Z, 25 Oct 20:00Z, 1 Nov 20:00Z, each 21:00 in Berlin; the e2e uses the course's own zone with `timeZone` omitted |
| Generated sessions keep their ids through later edits (MDRS-95) | e2e: batch, `PATCH /lessons/:id` moving one to week 2, then a whole-course `PUT` from a fresh load — the same ids, the moved one retitled; and a `PUT` loaded before the batch is refused 409 with the batch intact |
| "Haftayı kopyala" produces sessions exactly seven days later | `libs/utils/test/time-zone.spec.ts`: +7 days is exactly 604 800 000 ms in Istanbul, month/year/leap-day ends, and across the Berlin DST end the copy keeps 21:00 local |

Also covered: preview writes nothing and returns the same list; 400 for
malformed fields and for each unexpandable case tried; 403 for a caller with no
relationship and for an enrolled talebe; the spring DST gap and the repeated
autumn hour.

## What was not verified

- **The C6 panel and the "Haftayı kopyala" button in a browser.** nizam-web has
  no test runner, so the component itself is covered only by `typecheck`,
  `lint` and `build`; the logic under it is covered by the specs above. Manual
  check: open a saved course's edit page, add a weekly repeat, preview, create,
  and copy a week.
- **The Arabic strings** were written without a native-speaker review.

## Review notes

`/code-review` on the diff raised ten points. Fixed: the zone read moved into
the write transaction; existing weeks are matched in week-number order; a
week the batch creates skips the order-index lookup; creating now asks for
confirmation before the reload. Not changed, with the reason:

- *Week numbers count from the start date, not from the course's first week.*
  That is the issue's rule ("the week that contains the start date is
  Hafta 1"). A batch started later in a course therefore lands in the course's
  weeks 1, 2, … — see follow-up.
- *`Hafta N` is stored in Turkish.* The issue names that title; nizam shows
  the stored title as is. See follow-up.
- *The zone arithmetic duplicates `@medaris/utils`.* tedrisat cannot import it
  at runtime: the package ships TypeScript source only (`main: ./src/index.ts`,
  no build), and `nest build` plus the runner image expect JavaScript. The
  docstring points at the twin, and both are pinned by the same DST cases.
- *Reload instead of merging the result into the form.* Merging the new
  lessons and version into the form state is a larger change to a 950-line
  component; the confirmation covers the data-loss case for phase 1.
- *New sessions are appended after a week's existing lessons, not sorted in by
  date*, and *per-week queries* (at most ~53 for a year-long batch) — accepted.

## Follow-up

- Storing the rule and "this and all following" edits — phase 2, per the issue.
- The batch does not touch `courses.duration_weeks`; nizam recomputes it from
  the weeks on the next whole-course save.
- "Haftayı kopyala" still copies the meeting link into the new week. The
  owner's rule that links change every week suggests clearing it; left as is
  because the AC only covers the date.
- Let the manager choose which course week the start date is (an offset), so
  a batch started mid-course does not reuse weeks 1, 2, …
- Store `Hafta N` in the course's language, or leave the title empty and let
  each client localise it.
- Redo the panel's layout from the C6 design once MDRS-127 delivers it.
