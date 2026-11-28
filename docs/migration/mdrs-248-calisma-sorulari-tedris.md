# Çalışma soruları, Faz 3: the talebe's screens (MDRS-248)

Date: 27 November 2026. Scope: `apps/tedris` and `libs/i18n` (`tedris.json`
only). Builds on the API of Faz 1 (`mdrs-248-calisma-sorulari.md`, PR #458).
Nazar (Faz 2) is not touched.

## What was built

- **`/calisma-sorulari`**, in the menu beside Sınavlarım (desktop bar and
  phone menu): every published set of the talebe's courses
  (`listMyPracticeSets`), grouped by course (each group anchored as
  `#ders-<courseId>`), with the question count, the finished attempts and the
  latest percentage. The button is "Devam et" when an attempt is in progress,
  "Tekrar çöz" once one is finished, "Başla" before.
- **`/calisma-sorulari/[setId]`**: the page calls `startPracticeAttempt` from
  the browser (a Server Action, never during the render, which a prefetch
  could trigger); the API gives back the attempt in progress when there is
  one, so a reload goes on at `currentQuestionId` (the last question
  answered) with the saved choices. Every choice is saved at once
  (`savePracticeAnswer`); the saves of one question are queued, because the
  API keeps the last write and has no sequence number. A failed save keeps
  the choice and shows "Cevabın kaydedilemedi, tekrar dene" with a button
  that sends what is unsent; "Bitir" sends it first and does not finish while
  anything is unsent; a retry sends the choice on screen, and an older save
  still queued behind a newer one is dropped. While "Bitir" runs no choice
  can be made. "Bitir" asks with the number of blank questions. The
  questions skipped in the tab are kept in `sessionStorage` per attempt, so
  a reload still brings them back after the last one.
- **`/calisma-sorulari/deneme/[attemptId]`**: the percentage, Doğru / Yanlış /
  Boş, and every question with the talebe's choice and the correct options in
  the badges of a past exam's screen (`my-exam-result.tsx`); "Tekrar çöz" and
  "Çalışma sorularına dön". An attempt still in progress leads back to it.
- **Course page**: for a seat holder, when `listPracticeSets` returns a set,
  the aside has a "Çalışma Soruları" button to the list at the course's
  anchor; otherwise nothing is drawn (a failed read included).
- **Shared with the online exam**: the options, A− / A+ and the question list
  moved from `exam-take.tsx` into
  `features/online-exams/components/question-parts.tsx`, unchanged in markup;
  `arabic.ts` and the pure helpers of `take-model.ts` (`stateOf`,
  `nextIndex`, `TEXT_SCALES`, the text-scale storage) are imported as they
  are. No clock, countdown, holder, tab count or zeroth question.

## What was verified

- `apps/tedris/test/practice.spec.ts`: the grouping, the three actions, the
  Turkish percentage, the resume index, the blank count; the list (counts,
  last result, buttons, empty and failed states) and the result (percentage,
  counts, choice and correct-option badges, in-progress state).
- `apps/tedris/test/practice-take.spec.ts` (happy-dom): resume at the left
  question with its choice, no timer; a failed save's message and its resend;
  "Bitir" with the blank count, then the result's address; a refused set.
- `exam-take.spec.ts` stays green after the extraction;
  `member-phone-menu.spec.ts` and `course-page-states.spec.ts` cover the new
  menu item and the course page link.
- The gate's results are in the pull request.

## What was not verified

- `apps/tedris/e2e/practice.e2e.ts` was written but not run: it needs the
  running app and API, Postgres and the Keycloak talebe account.
- Nothing was tried in a browser against the dev API; the desktop bar now
  holds seven places, and its fit at 768 px was not measured.
- In this worktree `tedrisat:test` and `keycloak-theme:test` failed in
  suites this change does not reach (their dependency graph holds none of
  the changed files): the Keycloak suites with 401/403 from the container,
  and a different handful of tedrisat e2e cases on each run. Every other
  project's tests, and every typecheck, lint, module-boundaries and build
  target, were green.
- The English and Arabic strings were written here and not reviewed by a
  native speaker (Turkish is the only locale switched on).

## Follow-ups

- Faz 4: the pool (all questions of a course, or N at random).
- `exam-take.tsx` counts the skipped questions for the "Son soruya geldin"
  notice before the question just skipped is marked, so it says one fewer
  (found in this review; fixed for practice only, the exam is MDRS-299's).
- The API moves `currentQuestionId` only when an answer is saved; a talebe who
  only navigates resumes at the last question answered.
