# MDRS-150 — A talebe's private notes on a session's video

A talebe takes notes on the video of a session (a live stream while it runs, the recording once it is
up), and nobody else reads them: not another talebe, not the course team, not the başnazım. This note is
what is true after the PR (#198) was ported onto the reviewed permission catalogue of MDRS-135 (it was
written against the old scope matrix). Every number below sits next to the command that printed it;
commands run from the repository root unless a `cd` says otherwise.

## What it is

| Piece | Where |
| --- | --- |
| table `lesson_notes` (`id`, `lesson_id` → `lessons` ON DELETE RESTRICT, `author_id`, `offset_seconds` null or ≥ 0, `body`, two timestamps; index on `(author_id, lesson_id)`) | migration `0051_lesson_notes` (was `0047`), rollback `rollbacks/0051_lesson_notes.down.sql` |
| `GET` / `POST /lessons/:id/notes`, `PATCH` / `DELETE /lessons/:id/notes/:noteId` | `apps/tedrisat/src/lesson-note/` |
| the notes panel on the recordings tab and on the session page, the YouTube IFrame position hook | `apps/tedris/features/courses/` (`lesson-notes.tsx`, `youtube-player.ts`, `lesson-note-model.ts`) |
| a real delete of a course, and the archive's hard delete of a week or a session, delete the notes first | `course/course-purge.ts`, `archive/archive.repository.ts` |

**Privacy is structural.** There is no method of `LessonNoteRepository` that reads or writes a note
without its author, so "somebody else's note" and "no such note" are the same empty result (404
`LESSON_NOTE_NOT_FOUND`), for the başnazım too. There is no route that reads a note by id or across
sessions, and no response about a session carries a note. A Bunny player has no position API here: the
position of a note on a player that is not YouTube's is a number the talebe types, as before.

## What the port changed

### Who decides what

The four routes asked the old matrix for `VIEW`. The matrix is gone; each route now asks `course.view` of
the lesson's course (`@Authz(PERMISSIONS.COURSE_VIEW, byLessonCourse)`), like the session routes beside it.
The guard answers a missing lesson with 404 and, since the engine's `assertOpen` runs in front of every
signed-in decision, a course of a hidden köşk with that course's own 404. The rest is asked of the engine
through `CourseService`, as every read of course content is:

| Question | Asked of | Notes |
| --- | --- | --- |
| may the caller see the course at all | `CourseService.findVisibleLessonCourse`: `getDetail(courseId, user, { read: true })`, its `CourseNotFoundError` answered as `LESSON_NOT_FOUND` | a hidden köşk, a hidden course (`archived_at`), a draft; the same rule and the same single answer as the session's calendar entry (`getScheduledLesson`) |
| is the course's content open to the caller | `AuthzService.can(user, course, course.view_details)` | a passive scope takes `view_details` away from the enrolled talebe too; a pending, removed or barred talebe never held it; platform management and the köşk's nazımı keep it, and `can` writes their `scope.passive_open` row |
| is the caller a talebe | an ENROLLED or COMPLETED enrollment and `BanService.isBarred` false | to write only. No catalogue code says "enrolled and not staff": the başnazım passes every decision and the course team holds `view_details` without being talebe |

The last two are `CourseService.mayWriteAsTalebe` (a talebe, and the content open) and
`CourseService.mayReachOwnWriting` (to read and to delete). They are on `CourseService`, beside the
enrollment and the ban the course already reads, because the questions to the course staff ask exactly
the same of a talebe.

Writing (create, edit) takes `mayWriteAsTalebe`. Reading and deleting one's own notes take
`mayReachOwnWriting`: the content open to the caller or, for someone who holds no content code (a talebe
who was removed or barred), a course that no passive scope closes (`CourseRepository.findPassiveScope`,
the reviewed `passiveScopesOf` for one course). So a removed or barred talebe still reads and deletes what
they wrote while the course is open, and a passive course is closed to every route, theirs included. The
web panel mounts only when `!contentLocked`, which is the same `view_details` answer, so the screen and the
API agree.

No new catalogue code: nothing is granted for notes, and the catalogue counts do not move.

### Migration renumbered

`0047_lesson_notes` is `0051_lesson_notes` (TIP's last is `0048_mdrs_135_archived_level`; 0049 and 0050 are
the Bunny chain's). `when` is `1791110000000`, later than the chain's `1791097956740`; its journal `idx`
is the array position (47) and the coordinator renumbers it if that chain lands first. The snapshot
`meta/0051_snapshot.json` is TIP's `0048` snapshot plus the `lesson_notes` table, `prevId` = the `0048`
snapshot's `id`. Checked against the schema, not by eye:

```
$ cd apps/tedrisat && DB_PASSWORD=x ./node_modules/.bin/drizzle-kit generate --config <copy with out = a scratch copy of migrations>
No schema changes, nothing to migrate
```

## Behaviour changes callers will see

Against the PR as it was written (the routes themselves are new on main):

| | Before | Now |
| --- | --- | --- |
| a talebe of a course in a passive scope, on any of the four routes | served | 403 `LESSON_NOTE_FORBIDDEN`, nothing written or changed; served again when the course has a müderris |
| a removed or barred talebe reading or deleting their own notes in a passive course | served | 403 `LESSON_NOTE_FORBIDDEN` (open course: unchanged, served) |
| a talebe of a hidden course or of a draft | served | 404 `LESSON_NOT_FOUND`, as the session's page and calendar entry |
| a talebe of a course of a hidden köşk | served | 404 `COURSE_NOT_FOUND` from the guard (as every route on that course) |
| a talebe barred at the köşk or the medrese, not only at the course | refused to write | refused to write (unchanged); reads and deletes their own (unchanged) |
| the başnazım or a köşk nazımı who is enrolled, in a passive course | nothing recorded | served, and every open is a `scope.passive_open` row like any content read |
| the text of `LESSON_NOTE_FORBIDDEN` | "Only a talebe enrolled in the course writes notes on its sessions" | "Notes on a session are for a talebe enrolled in the course, while its content is open"; the code is the same, no client reads the text |
| `GET` and `DELETE` | 200/204 or 404 | may also be 403 (a passive course), declared in the API |

Nothing else changes for the tedris screens: the panel is not mounted while the course is locked or when
the viewer is not a talebe.

## Decided by default, owner may overrule

1. **A passive course closes deleting one's own note as well.** The alternative is a delete that always
   works (erasure of one's own writing); it costs one branch and the passive course stays closed to
   everything else. Default: closed, because the rule everywhere else is that a passive scope closes
   content to everyone but its management, and a note is the course's content on a session.
2. **A hidden course and a draft close the notes, through `getDetail`,** not through a rule written again
   here (`findVisibleLessonCourse`). It loads the course detail on each note call, as the calendar entry does; the session page's
   own read is the same query, so a page that opens the panel makes two.
3. **Staff and the başnazım write no notes unless they are enrolled like anyone.** Unchanged from the PR;
   a catalogue code for it would say nothing the enrollment does not.
4. **`when` and `idx` of the migration** as above.

## Tests

The PR's own tests run unmodified on the port, and new ones pin what the engine adds.

```
$ cd apps/tedrisat && /home/taha/medaris-wt/.bin/e2e-slot.sh ./node_modules/.bin/vitest run test/e2e/lesson-note.e2e.spec.ts test/e2e/lesson-notes-migration.e2e.spec.ts test/e2e/archive.e2e.spec.ts test/e2e/authz-route-inventory.e2e.spec.ts test/e2e/recordings.e2e.spec.ts test/e2e/session.e2e.spec.ts test/e2e/lesson-calendar.e2e.spec.ts test/e2e/authz-engine.e2e.spec.ts
   lesson-note (53 tests), lesson-notes-migration (1), archive (32), authz-route-inventory (1), recordings (11), session (10), lesson-calendar (7), authz-engine (65)
 Test Files  8 passed (8)
      Tests  180 passed (180)
$ cd apps/tedrisat && ... test/e2e/boot-migrations.e2e.spec.ts test/e2e/archived-level-migration.e2e.spec.ts test/e2e/grant-authority-migration.e2e.spec.ts
 Test Files  3 passed (3)
      Tests  4 passed (4)
$ cd apps/tedrisat && ./node_modules/.bin/vitest run test/unit
 Test Files  71 passed (71)
      Tests  928 passed (928)
$ cd apps/nizam && ./node_modules/.bin/vitest run        # Test Files 46 passed (46), Tests 757 passed (757)
$ cd apps/nazir && ./node_modules/.bin/vitest run        # Test Files 38 passed (38), Tests 711 passed (711)
$ cd libs/common && ./node_modules/.bin/vitest run       # Tests 172 passed (172)
$ NODE_OPTIONS=--no-experimental-webstorage, in apps/tedris and libs/ui
   apps/tedris   Test Files 75 passed (75), Tests 707 passed (707)
   libs/ui       Test Files 12 passed (12), Tests 151 passed (151)
```

Under Node v26.10.0 without that flag `window.localStorage.clear` is undefined and 12 tedris specs
(`auth-entry.spec.ts` 5, `expired-session.spec.ts` 7) and 25 of `libs/ui`'s `theme.spec.tsx` fail; none is this
PR's, and the flag turns all 37 green.

### Red then green

The eight new tests are in the `a course the engine closes (MDRS-135)` block of `lesson-note.e2e.spec.ts`
(8 of its 53). Each row is the source change put back (the line removed or replaced), the block run, the
change reverted:

| Criterion | Test | Fails without the change |
| --- | --- | --- |
| a hidden course is closed like its page | "answers a hidden course as a session that is not there, and writes nothing" | yes, with `getDetail` taken out of `findVisibleLessonCourse`: 2 failed (this and the draft test), 6 passed |
| a draft is closed like its page | "answers a course taken back to a draft as a session that is not there, and writes nothing" | yes, with the same change: the 2 failed above |
| a passive course is closed to its talebe on every route and nothing changes | "closes a passive course to its enrolled talebe on every route, and leaves their notes where they are" | yes, with `contentIsOpen` always true: 3 failed (this, the next, and the köşk nazımı's), 5 passed; with `mayReachOwnWriting` always true: 2 failed (this and the next), 6 passed; with only the write path's `contentIsOpen` relaxed: 1 failed (this) |
| a talebe who lost their seat is closed out of a passive course, and the course reopens with its müderris | "closes a passive course to a talebe who lost their seat as well, and opens it again with the müderris" | yes, with `mayReachOwnWriting` always true and with `contentIsOpen` always true (above) |
| the köşk's nazımı keeps a passive course of their köşk, on the record | "leaves a passive course open to the köşk's nazımı who is enrolled in it, on the record" | yes, with `contentIsOpen` always true (the `scope.passive_open` row is the engine's `can`) |
| a barred talebe is refused even where a role of theirs holds the content | "refuses a barred talebe even where a role of theirs holds the course's content" | yes, with the ban term removed from `CourseService.mayWriteAsTalebe`: 1 failed, 7 passed |
| a talebe barred from the whole köşk | "refuses a talebe barred from the whole köşk, and still lets them read and delete their own" | no: the engine alone already answers a barred talebe as a stranger, so this is a pin on the pair, not on one of them |
| a course of a hidden köşk answers 404 on every route | "answers a course of a hidden köşk as not found on every route, and writes nothing" | yes, with both layers removed (`getDetail` out of `findVisibleLessonCourse` and `@Authz` replaced by `@AuthzExempt()`): `{ list: 200, create: 201, … }` instead of 404. With `@Authz` removed alone the app does not boot: "4 route handler(s) sit behind AuthzGuard with neither @Authz nor @AuthzExempt()" |
| the routes are decided by the catalogue | the route inventory snapshot | yes, against the tree before this commit: the four `/lessons/:id/notes` rows were missing from `authz-route-inventory.txt` ("Snapshot … mismatched") |
| the migration adds the table, holds a session and a position, and rolls back | `lesson-notes-migration.e2e.spec.ts` | yes, with the CHECK removed from the SQL: "promise resolved … instead of rejecting" |

The privacy, DTO-limit, enrollment-rule and purge tests of the PR are the PR's own and were not run red
again here.

## Not verified

- The Playwright specs and the tedris screens in a browser: no stack is running here. The panel mounts
  only when `!contentLocked`, so it never meets the new 403 from a closed course; if it did, a load says
  "failed" and a write says "Not yazmak için derse kayıtlı olman gerekir" (read in `lesson-notes.tsx`, no
  spec of a course locked mid-session).
- YouTube's IFrame API against the real player (position reading, seeking).
- The whole tedrisat e2e suite: the integrator's.
- The whole-repo gate: browser builds (`next build`) and the other apps' e2e.
