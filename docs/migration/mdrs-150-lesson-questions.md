# MDRS-150 — A talebe's questions to the course staff, and their answers

A talebe asks the course staff a question on a session; whoever may answer reads it and answers it; the
talebe reads the answer in their Sorularım tab. This note is what is true after the PR (#199) was ported
onto the reviewed permission catalogue of MDRS-135 (it was written against the old scope matrix and an
interim by-code check) and stacked on the port of the notes (`mdrs-150-lesson-notes.md`). Every number
below sits next to the command that printed it; commands run from the repository root unless a `cd`
says otherwise.

## What it is

| Piece | Where |
| --- | --- |
| table `lesson_questions` (`id`, `lesson_id` → `lessons` ON DELETE RESTRICT, `author_id`, `body`, `answer`, `answered_by`, `answered_at`, two timestamps; a CHECK that an answer comes with who gave it and when; indexes on the author and on the session) | migration `0052_lesson_questions` (was `0048`), rollback `rollbacks/0052_lesson_questions.down.sql` |
| `POST /lessons/:id/questions`, `GET /courses/:id/questions/mine`, `GET /courses/:id/questions`, `PUT /questions/:questionId/answer`, `PATCH` and `DELETE /questions/:questionId` | `apps/tedrisat/src/lesson-question/` |
| the nazir "Sorular" page under `apps/nazir/app/ders/[dersId]/sorular/`, the tedris "Sorularım" tab on the course page | `apps/nazir/features/questions/`, `apps/tedris/features/courses/` |
| the permission `question.answer` | `libs/common/src/authz/permissions.ts` |
| a real delete of a course, and the archive's hard delete of a week or a session, delete notes and questions before the lessons | `course/course-purge.ts`, `archive/archive.repository.ts` |

## What the port changed

### `question.answer` is a catalogue code

A course-scoped content permission (`listed([COURSE], { content: true })`). The müderris, the köşk nazımı
and the başmüderris hold it by their role defaults (the defaults are computed from the scope tags, so
tagging it is all it took); a ders nazırı holds it only through a grant, direct or through a group; the
başnazım holds it as every code. A passive scope closes it (it is content), except to the köşk's nazımı.
It is in the course half of the dialogs (`COURSE_CATALOG`, after `session.view_content`), so a nazır of a
medrese may be given it for the medrese's courses too, and its sentence is in the nizam, nazir and tedris
messages (tr, en, ar; the PR's own). It is on no canvas yet.

```
$ node -e 'const c=require("./libs/common/dist"); …'      # the command the MDRS-135 note used, run after the change
codes 78 listed 58 grantable 58 implicit 17 derived 3 unlisted 3      # the MDRS-135 note: 77, 57, 57, 14+3, 3
tagged course 23       # was 22
default KOSK_NAZIM 31   default MEDRESE_BASMUDERRIS 35   default MUDERRIS 23   # were 30, 34, 22
default MEDARIS_NAZIM 0   default MEDRESE_NAZIR 0   default DERS_NAZIR 0
```

**Holding it alone does not open the course's content** (`course.view_details`): it is in neither
`ROSTER_WORK` nor `CONTENT_WORK` of the engine, as `ban.course` is not. A ders nazırı given `question.answer`
alone reads and answers the questions and sees the course page with its content locked.

The pinned counts moved, and each was read before it was changed: a medrese's dictionary now lists 22
course permissions (was 21 on the base) and a başmüderris may give 33 (was 32)
(`madrasah-permission.spec.ts`, `madrasah-permission.e2e.spec.ts`, `nazir-grant-scopes.spec.ts`), nizam's
course sentences are 20 (was 19, `nizam/test/permissions.spec.tsx`), and `catalogue-golden.spec.ts` has the row.

### Who decides what

`SCOPES.VIEW` is gone from every route and so are `CourseAccessService` (the interim by-code check, with its
`standingCarries` and its grant query) and `ActiveTalebeService`. `test/unit/course/course-access.spec.ts`,
which tested them, goes with them; its two `question.answer` cases are in `catalogue-golden.spec.ts` and
`effective-permissions.spec.ts` now (against the engine, which is what decides).

| Route | `@Authz` | The service then asks |
| --- | --- | --- |
| `POST /lessons/:id/questions` | `course.view` on the lesson's course | `CourseService.findVisibleLessonCourse`, then `mayWriteAsTalebe`: an ENROLLED or COMPLETED enrollment no ban bars, and the content open (`course.view_details`) |
| `GET /courses/:id/questions/mine` | `course.view` on the course | `getDetail` (a hidden course, a draft), then `mayReachOwnWriting`: the content open, or no passive scope over the course |
| `GET /courses/:id/questions` | **`question.answer` on the course** (`byExistingCourse`, now exported from `course.controller.ts`, so a course that is not there is 404 for the başnazım too) | `getDetail` |
| `PUT /questions/:questionId/answer` | `course.view` on the question's course | `getDetail`, then `AuthzService.can(user, course, question.answer)`; either refusal is 404 `LESSON_QUESTION_NOT_FOUND`, so a refusal does not confirm that the question exists. This is why it is not in the `@Authz`, which would answer 403 |
| `PATCH /questions/:questionId` | `course.view` on the question's course | the author's own question (else 404), `getDetail`, then `mayWriteAsTalebe` |
| `DELETE /questions/:questionId` | `course.view` on the question's course | the author's own question (else 404), `getDetail`, then `mayReachOwnWriting` |

`mayWriteAsTalebe` and `mayReachOwnWriting` are `CourseService`'s, shared with the notes. A talebe who was
removed or barred still reads their own questions with the answers and deletes them while the course is
open; a passive course closes them. The guard answers a course of a hidden köşk with that course's 404 on
every route, and `getDetail` a hidden course and a draft (`COURSE_NOT_FOUND` on the course routes,
`LESSON_NOT_FOUND` on asking, `LESSON_QUESTION_NOT_FOUND` on the question routes).

### Migration renumbered

`0048_lesson_questions` is `0052_lesson_questions`, after the notes' `0051`. `when` is `1791110060000`,
later than the notes' `1791110000000` and the Bunny chain's two; its journal `idx` is the array position
(48). The snapshot `meta/0052_snapshot.json` is the notes port's `0051` snapshot plus the table, `prevId` =
its `id`. Checked against the schema, not by eye:

```
$ cd apps/tedrisat && DB_PASSWORD=x ./node_modules/.bin/drizzle-kit generate --config <copy with out = a scratch copy of migrations>
No schema changes, nothing to migrate
```

## Behaviour changes callers will see

Against the PR as it was written (the routes themselves are new on main):

| | Before | Now |
| --- | --- | --- |
| a talebe of a course in a passive scope: ask, edit, delete, read their own list | served | 403 `LESSON_QUESTION_FORBIDDEN`, nothing written or changed |
| the staff list and answering in a passive course | served to the müderris, a ders nazırı given the code and the others who hold it | closed to all but the köşk's nazımı and platform management (the engine); the list is 403, answering is 404; the köşk nazımı's open is a `scope.passive_open` row |
| a talebe, or the staff, of a hidden course or a draft | served | 404 (`COURSE_NOT_FOUND`, `LESSON_NOT_FOUND`, `LESSON_QUESTION_NOT_FOUND` by route) |
| a course of a hidden köşk | served | 404 from the guard, as every route on that course |
| a talebe barred at the köşk or the medrese | refused to ask | refused to ask (unchanged); reads and deletes their own (unchanged) |
| a ders nazırı holding `question.answer` through an expired or revoked grant, or of another course | refused | refused (unchanged; the engine counts a grant only while its role lasts) |
| `GET /courses/:id/questions` for someone who may not answer | 403 `AUTHZ_FORBIDDEN` from the service | 403 `AUTHZ_FORBIDDEN` from the guard |
| the text of `LESSON_QUESTION_FORBIDDEN` | "Only a talebe enrolled in the course asks questions on its sessions" | "Questions on a session are for a talebe enrolled in the course, while its content is open"; the code is the same, no client reads the text |
| the permission's place in the catalogue | `question.answer` was a second `PERMISSIONS` in `assignment/permission-catalog.ts` | one code in `libs/common`, and `/me/effective-permissions` reports it |

Nothing else changes for the tedris and nazir screens.

## Decided by default, owner may overrule

1. **`question.answer` does not imply `course.view_details`.** The alternative is to put it in the engine's
   `CONTENT_WORK`, so that a ders nazırı given only this sees the course's sessions too. Default: no,
   like `ban.course` and `deck.propose_kosk` ("unrelated grants do not imply it", review M1).
2. **A passive course closes deleting one's own question,** as it closes deleting a note (see the notes'
   note, decision 1).
3. **A hidden course closes the staff routes to a müderris** the way it closes the course page to them
   (`getDetail`: the köşk's nazımı, who may restore it, still answers). A müderris rather than a ders nazırı
   is not seen in the tests, whose müderris has a `role_assignments` row but no `course_muderris` row.
4. **`when` and `idx` of the migration** as above.

## Tests

```
$ cd apps/tedrisat && /home/taha/medaris-wt/.bin/e2e-slot.sh ./node_modules/.bin/vitest run test/e2e/lesson-question.e2e.spec.ts
 Test Files  1 passed (1)
      Tests  136 passed (136)       # 127 are the PR's own, unmodified; 9 are new
$ cd apps/tedrisat && ./node_modules/.bin/vitest run test/unit
 Test Files  70 passed (70)
      Tests  929 passed (929)
$ cd libs/common && ./node_modules/.bin/vitest run
 Test Files  12 passed (12)
      Tests  176 passed (176)       # four new: the holders of question.answer and its passive closure
$ cd apps/nazir && ./node_modules/.bin/vitest run    # 38 files, 728 tests passed
$ cd apps/nizam && ./node_modules/.bin/vitest run    # 1 fails, see below: Tests 1 failed | 752 passed (753)
$ cd apps/tedris && ./node_modules/.bin/vitest run   # 12 fail, the same 12 as on the base: Tests 12 failed | 707 passed (719)
$ cd libs/ui && ./node_modules/.bin/vitest run       # Tests 138 passed (138)
```

`apps/nizam` `kosk-overview.spec.tsx` › "warns about the first missing link" fails on the real clock after
19:00 on 4 October (its fixture is dated around a pinned `NOW` the component does not read); `origin/main`
pins the clock in that spec, so it is not this PR's. The 12 tedris failures are `auth-entry.spec.ts` (5) and
`expired-session.spec.ts` (7), `localStorage.clear` undefined under Node v26.10.0, identical on the base.

### Red then green

Each row is the source change put back (the line removed or replaced), the spec run, the change reverted.
The 9 new e2e tests are in `a course the engine closes (MDRS-135)` of `lesson-question.e2e.spec.ts` (136
tests in all).

| Criterion | Test | Fails without the change |
| --- | --- | --- |
| a hidden course and a draft close every route | "answers a course hidden / taken back to a draft as not found on every route, and writes nothing" | yes, with `getDetail` taken out of the services' visibility checks and out of `findVisibleLessonCourse`: 2 failed, 134 passed |
| a course of a hidden köşk closes every route | "answers a course of a hidden köşk as not found on every route, and writes nothing" | yes, with both layers removed (the `@Authz` of every route replaced by `@AuthzExempt()` and `getDetail` out): `expected { Object (ask, mine, ...) } to deeply equal …` |
| a passive course closes a talebe's routes, those who lost their seat and the course again when it has a müderris | "closes a passive course to its talebe on every route of theirs, …" and "… to a talebe who lost their seat as well, …" | yes, with `contentIsOpen` always true: 2 failed; with `mayReachOwnWriting` always true: 2 failed |
| a passive course closes the staff's list and answering, to all but the köşk nazımı, on the record | "closes the staff's list and answer in a passive course, …" | yes, with the staff list asking `course.view` instead of `question.answer`: it is one of 12 failures (below), and with the engine's `can` out of `answer`: one of 11 |
| a barred talebe is refused even where a role of theirs holds the content | "refuses a barred talebe even where a role of theirs holds the course's content" | yes, with the ban term removed from `CourseService.mayWriteAsTalebe`: 1 failed, 135 passed |
| a talebe barred from the whole köşk | "refuses a talebe barred from the whole köşk, and still lets them read and delete their own" | no: the engine alone answers a barred talebe as a stranger, so it pins the pair |
| `question.answer` alone opens no content | "does not open the course's content to a ders nazırı who holds question.answer alone" | yes, with `question.answer` added to `CONTENT_WORK`: this test and the `effective-permissions.spec.ts` one fail |
| the staff list is the permission's | the PR's "shows them to nobody who is …" cases and "refuses a caller who may not answer, with or without a cursor" | yes, with the `@Authz` on the staff list `course.view`: 12 failed, 124 passed |
| answering is the engine's, and a refusal is a 404 | the PR's "refuses %s with 404 and keeps the question open" cases | yes, with `can` replaced by `false`/removed in `answer`: 11 failed, 125 passed |
| the permission is a catalogue code, content, held by the müderris, the köşk nazımı and the başmüderris, closed by a passive scope | `catalogue-golden.spec.ts` (row, content, holders), `effective-permissions.spec.ts` (3 new) | yes, with `content: true` dropped from its meta: 3 failed, 173 passed |
| it is in the course half of the dialogs | `nazir-grant-scopes.spec.ts`, `madrasah-permission.spec.ts` | yes, with it taken out of `COURSE_CATALOG`: 4 failed, 107 passed |
| the routes are decided by the catalogue | the route inventory snapshot | yes, against the tree before this commit: the seven question rows were missing |
| the migration adds the table, holds a session and the answer's pair, and rolls back | `lesson-questions-migration.e2e.spec.ts` | yes, with the CHECK removed from the SQL: "promise resolved … instead of rejecting" |

The PR's own tests (who may ask, who reads, privacy, the DTO limits, paging with cursors, edit and delete,
storage) are unmodified and were not run red again here, beyond the rows above.

## Not verified

- The Playwright specs and the nazir and tedris screens in a browser: no stack is running here. The nazir
  page draws a notice and none of the list when the API answers 403 (read in `questions-page.tsx`); there is
  no spec for a course that went passive while the page was open.
- The whole tedrisat e2e suite: the integrator's. I ran the question, route-inventory, catalogue and
  permission specs (`assignments`, `authz-engine`, `madrasah-permission`, `permission-admin`,
  `madrasah-nazir`, `user`, `kosk-grants`: 206 tests passed with the inventory spec failing as expected
  before its update).
- That a müderris, who has both a `role_assignments` row and a `course_muderris` row in production, is
  closed out of a hidden course's questions: the tests seat the müderris by role only (decision 3).
