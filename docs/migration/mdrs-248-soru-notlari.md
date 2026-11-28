# MDRS-248 — Soru notları (API)

A talebe writes a note on a question of a çalışma seti or an online exam. The note is
the talebe's own until they send it to the course's hoca. The hoca reads the notes sent
on a set and answers them. This PR is the API only (`apps/tedrisat` and the
`libs/services` client); the nazar and tedris screens come in their own PRs.

## The owner's decisions

- A note is personal, and the talebe may also send it to the hoca, who sees it and
  answers it.
- The hoca turns notes on or off **per question**, with an icon on the question ("ikon
  olarak dursun, tıklanırsa soruya eklensin, gereksiz yer kaplamasın soru ekleme
  alanında"). A new question has it off, in a çalışma seti and an exam alike ("default
  olarak yorum eklenemez olmalı, ikon tıklanırsa eklenebilir olmalı", 2026-11-28; until
  then a new question of a çalışma seti had it on).

## Model

- `exam_questions.talebe_notes boolean not null default false`. `addQuestion` writes
  `false` for every new question, whatever the set's kind (2026-11-28). Migration
  `0083_question_notes` filled the rows that existed then by the earlier rule (`true` for
  every question of a PRACTICE set); those rows are left as they are, and no migration
  changes them.
- `question_notes`: `id`, `course_id` (FK courses, restrict), `exam_id` (FK
  online_exams, restrict), `question_id` (FK exam_questions, restrict), `user_id`,
  `body` (1..1000 characters, trimmed), `shared_with_teacher`, `shared_at`,
  `teacher_reply` (≤1000), `replied_by`, `replied_at`, `reply_seen_at`, `created_at`,
  `updated_at`.
  - Unique `(user_id, question_id)`; indexes `(exam_id, shared_with_teacher)`,
    `(course_id, user_id)`, `(question_id)`.
  - Checks: the body's length; the reply's length; reply, `replied_by` and
    `replied_at` are all set or all null; `shared_with_teacher = (shared_at is not
    null)`.
  - `updated_at` is the talebe's last write (the text or the sending), never the hoca's
    answer. So `updated_at > replied_at` means "changed since the answer"
    (`editedAfterReply`).
- Rollback: `database/rollbacks/0083_question_notes.down.sql`.

## Rules

- **Who may write.** A note is written on a question the caller got in an attempt of
  their own: a çalışma seti's attempt, a pool attempt that drew it, or their sitting of
  the exam. The caller must still see the course and may write on it as a talebe
  (`mayWriteAsTalebe`, as a practice attempt asks). Any other question is 404
  `NOTE_QUESTION_NOT_FOUND`. Another talebe's note is never addressable.
- **Notes off.** A question with `talebe_notes = false` refuses a write with 409
  `NOTES_DISABLED`. A note already written stays readable and deletable.
- **Exam share lock.** On an exam's question, `sharedWithTeacher: true` is 409
  `NOTES_SHARE_LOCKED` until the exam is over for everyone (closed early, or past its
  latest start with no sitting still running, the same test as the result screen's
  `closed`) or its results are released. A personal note may be written during the exam.
  A note on a çalışma seti may always be sent.
- **Sending.** false→true stamps `shared_at` and notifies the hoca. true→false clears
  `shared_at`, and the hoca no longer lists it. Writing a sent note again keeps the hoca's
  answer, and the hoca sees `editedAfterReply`.
- **The hoca's answer.** `PUT question-notes/:noteId/reply` replaces an earlier answer;
  an empty `reply` takes it back. A note that is not sent is 404
  `QUESTION_NOTE_NOT_FOUND` to everyone. Another course's hoca gets 403 from the guard.
  Each answer writes `audit_log` `question_note.reply` (`details.removed` when it is
  taken back).
- **Read marks.** `newReply` is true while there is an answer the talebe has not read.
  `GET courses/:id/my-question-notes` marks every answer of the course read.
- **The notes icon is not content.** `PUT
  online-exams/:examId/questions/:questionId/talebe-notes` takes no `version`, bumps
  none, and works on a draft, a published and a locked set or exam alike. It writes
  `audit_log` `exam_question.talebe_notes`. The question save (`PUT
  …/questions/:questionId`) also takes an optional `talebeNotes`. That route is a
  content write, so it keeps the draft-only lock and the version.
- **Deletion.** Notes do not lock a set. `DELETE online-exams/:examId` deletes the set's
  notes first. Removing a question (draft) deletes its notes. The course purge
  (`deleteCourseOnlineExams`) deletes them before the practice attempts.

## Routes

| Route | Who | Refusals |
| --- | --- | --- |
| `PUT /exam-questions/:questionId/my-note` `{ body, sharedWithTeacher }` | talebe (`course.view`) | 404 NOTE_QUESTION_NOT_FOUND, 409 NOTES_DISABLED, 409 NOTES_SHARE_LOCKED, 403 QUESTION_NOTES_FORBIDDEN |
| `DELETE /exam-questions/:questionId/my-note` | talebe | 404 NOTE_QUESTION_NOT_FOUND, 404 QUESTION_NOTE_NOT_FOUND |
| `GET /courses/:id/my-question-notes` | talebe | 403 QUESTION_NOTES_FORBIDDEN |
| `GET /online-exams/:examId/notes` | hoca (`exam.prepare`) | 403, 404 EXAM_NOT_FOUND |
| `PUT /question-notes/:noteId/reply` `{ reply }` | hoca (`exam.prepare`) | 403, 404 QUESTION_NOTE_NOT_FOUND |
| `PUT /online-exams/:examId/questions/:questionId/talebe-notes` `{ talebeNotes }` | hoca (`exam.prepare`) | 403, 404 EXAM_NOT_FOUND, 404 QUESTION_NOT_FOUND |

The task named `questions/:questionId/my-note` and `my-question-notes?courseId=`. Both
were changed:

- `/questions/:questionId` is already the lesson-question route (`PATCH`, `DELETE`,
  `PUT …/answer`, MDRS-150). An exam question's id there would read as a lesson
  question's, so the note routes use `/exam-questions/…`.
- The talebe's list is `courses/:id/…`, like `my-grades` and `my-submissions`, so the
  guard authorises it by the path's course.

## Fields added to responses

- `ExamQuestionResponse.talebeNotes`: the hoca's draft and every question write.
- `OnlineExamSummaryResponse.unansweredNotes` and
  `OnlineExamDraftResponse.unansweredNotes`: notes sent and not answered.
- `talebeNotes` and `myNote: MyQuestionNoteResponse | null` on
  `PracticeQuestionResponse` (a practice attempt, in progress and finished),
  `AttemptQuestionResponse` (an exam sitting) and `MyAnsweredQuestionResponse` (the
  result screen, once its questions are shown). A note never carries the correct
  options.
- `SaveExamQuestionDto.talebeNotes` (optional).

`libs/services`: `createTedrisatAPIs().questionNotes` (`QuestionNotesApi`:
`saveMyQuestionNote`, `deleteMyQuestionNote`, `listMyQuestionNotes`,
`listExamQuestionNotes`, `replyQuestionNote`) and
`onlineExams.setExamQuestionTalebeNotes`. The models are `MyQuestionNoteResponse`,
`MyQuestionNoteListItemResponse`, `ExamQuestionNoteResponse`,
`QuestionNoteTalebeResponse`, `QuestionTalebeNotesResponse`, `SaveMyQuestionNoteDto`,
`ReplyQuestionNoteDto` and `SetTalebeNotesDto`.

## Notifications

- `QUESTION_NOTE_SHARED`: when a talebe sends a note, every müderris of the course with
  an account (`course_muderris.user_id`) is notified. Target `COURSE`. Params:
  `courseTitle`, `source`, `courseId`, `examId`, `setTitle`, `examKind`.
- `QUESTION_NOTE_REPLIED`: the talebe is notified of the first answer only (a rewrite
  is not news again; an answer given after one was taken back is). Target `COURSE`, same
  params.
- Nobody is notified of their own action. A notification that cannot be written is
  logged, and the note stands.

## Verified

- `test/unit/question-note/question-note.spec.ts`: the talebe's view, `newReply`,
  `editedAfterReply`, the exam share window, the hoca's order, and the service's
  refusals.
- `test/e2e/question-notes.e2e.spec.ts`:
  - defaults (PRACTICE on, EXAM off);
  - a personal note is its talebe's only, and another talebe gets 404;
  - a sent note is listed for the hoca, `unansweredNotes`, both notifications, the
    audit row, the answer seen in the attempt, read marks, an edit after the answer,
    taking the answer back;
  - another course's hoca 403, a kept note 404 to the hoca;
  - `NOTES_DISABLED` on a locked set turned off, with no version bump;
  - an exam: off by default; a personal note during the sitting; `NOTES_SHARE_LOCKED`
    while it runs; sending allowed after an early close;
  - set delete and course purge remove notes.
- Route inventory snapshot and the OpenAPI spec regenerated.

## Not verified

- The migration's backfill on a copy of production data: no test runs `0083` against
  pre-existing rows. The statement is one `UPDATE … WHERE exam_id IN (PRACTICE sets)`.
- `myNote` on the result screen (`GET lessons/:id/online-exam/my-result`) is not
  covered by an e2e test; it uses the same lookup as the sitting.
- No screen exists yet; nothing was tried in a browser or on dev.

## Review

- Two first writes of one note at once: only the one that inserted notifies (`xmax =
  0` on the insert's `returning`). Fixed.
- The hoca's answer: the first-answer notification is sent before the note is read
  back, so a talebe taking the note back at that moment does not swallow it. Fixed.
- A sitting abandoned with time left counts as running, so it keeps an exam's notes
  from being sent until the hoca closes the exam early or releases its results. This is
  the same test as the result screen's `closed` (`MyExamsRepository.anyInProgress`),
  kept on purpose so the two never disagree. Not changed.
- Removing a question deletes its notes with no `question_note.*` audit row. A question
  is removed only from a draft, and a draft's notes exist only when its celse was
  deleted under it. Not changed.

## Later

- The nazar and tedris screens. Notification texts for `QUESTION_NOTE_SHARED` and
  `QUESTION_NOTE_REPLIED` in `tedris.NotificationsPage.types` and nazar's notification
  list. Until then those two types render however each app renders an unknown type.
- The hoca is only the course's müderris. A ders nazırı with `exam.prepare` can read and
  answer the notes but is not notified.
