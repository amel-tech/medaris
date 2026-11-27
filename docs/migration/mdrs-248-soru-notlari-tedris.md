# MDRS-248 — Soru notları on tedris (talebe)

The talebe's screens of the question notes whose API came with #473
(`docs/migration/mdrs-248-soru-notlari.md`). The hoca's screens are nazar's, in their own PR.

## The owner's decision

A note is personal and may also be sent to the hoca. "İkon olarak dursun, gereksiz yer
kaplamasın": on every screen the note is one small icon in the question's top line.

## What was built

- **The note icon** (`features/question-notes/components/question-note.tsx`), in the top line
  of the question on the solving screen of a çalışma seti (`practice-take.tsx`) and of an exam
  (`exam-take.tsx`), and in every answer card of a result (`answer-review.tsx`, so both the
  çalışma result and "Cevaplarım" of a past exam).
  - Shown where `talebeNotes` is true, and also where a note was written before the hoca turned
    notes off (the API keeps that note readable and deletable; the panel then says notes are off
    and offers only "Sil"). Hidden otherwise.
  - Outlined with no note; on the brand tint with one (`data-look`), and a dot when the hoca
    answered: hollow once read, filled while not (`newReply`). The accessible name says which.
    The system has no filled `note` glyph (only star, play and bookmark have one), so "filled"
    is the tinted button, not a second glyph.
  - It opens a small non-modal panel (`role="dialog"`) anchored to that top line and drawn over
    what is under it, so the options and the buttons do not move: the hoca's answer
    ("Hocanın cevabı:"), the note (`Textarea`, `dir="auto"`, `maxLength` 1000, a counter),
    "Hocaya gönder" (`Switch`), "Kaydet" and "Sil". Each is written at once through a Server
    Action (`features/question-notes/actions.ts`). Ctrl/⌘+Enter saves.
  - The focus goes to the text when it opens and back to the icon when it closes (the icon, the
    ×, Esc wherever the focus is); a press outside closes it. A draft not saved is kept across a
    close. "Sil" asks first when the hoca answered (the answer goes with the note). The question screen's keys (A–Z, 1–9, Enter) leave the
    panel alone, because `TakeKeys` already skips anything inside a `role="dialog"`.
  - Refusals in words: `NOTES_DISABLED` (and the panel stops writing), `NOTES_SHARE_LOCKED`
    (and the switch locks), `NOTE_QUESTION_NOT_FOUND`, 403, anything else. A delete answered
    `QUESTION_NOTE_NOT_FOUND` is taken as done.
  - **An exam's sitting** passes `shareLock`: the switch is off and disabled with "Sınav bitince
    hocana gönderebilirsin; şimdilik not yalnız sende."; a personal note is written. On the
    result screen "Cevaplarım" shows only once the exam is over for everyone, which is when the
    API allows sending, so the switch is free there; a 409 still locks it.
- **The result cards** show the note under the options (`QuestionNoteSummary`): the note,
  "Hocaya gönderildi" or "Yalnız sende", "Yeni cevap" when not read, and the hoca's answer. The
  icon in the card's top line opens the same panel to edit it.
- **Notlarım**: `/calisma-sorulari/notlar?ders=<courseId>`, linked from each course on
  Çalışma Soruları ("Notlarım"). It lists `GET /courses/:id/my-question-notes`: the set or the
  exam, the question, the note, whether it was sent, the hoca's answer or "Hocan henüz
  cevaplamadı.", the last edit, and "Seti çöz" (a çalışma seti) or "Sınav sonucunu aç" (an
  exam). Answers not read before the page opened come first, with a brand edge and "Yeni
  cevap". The course's name is read from the talebe's sets; a course with exams only is drawn
  without it.
- **The notification** `QUESTION_NOTE_REPLIED`: "Hocan notunu cevapladı", with the course and the
  set, and it leads to that course's Notlarım (`notificationHref`). tr, en, ar.
- Arabic: the question, the set, the note and the answer go through `ArabicText` (the
  `textProps` standard); the textarea is `dir="auto"`.

## Decisions taken here

- **No count on "Notlarım (N)".** The only list route marks every answer of the course read as
  it answers. Calling it on the list page to count would mark the answers read before the
  talebe opened them, and the notes page would never show "Yeni cevap". The link is
  "Notlarım" without a number. A count needs a read that does not mark (see Later).
- The route is `/calisma-sorulari/notlar?ders=…`, under Çalışma Soruları, where the link is.
- The page title is "Soru notlarım": "Notlarım" alone already names the grades tab
  (`tabGrades`) and the `EXAM_RESULTS_RELEASED` sentence. The link keeps "Notlarım" as asked,
  and its accessible name says "soru notların". The notification says "Çalışma Soruları ›
  Notlarım" for the same reason.

## Verified

- `apps/tedris/test/question-notes.spec.ts` (19 tests): the icon only where allowed, a note
  kept after notes were turned off, the panel's focus, save and send, Esc, the screen's keys,
  a failed save, delete, the exam's lock (switch disabled, sent as personal), a
  `NOTES_SHARE_LOCKED` and a `NOTES_DISABLED` answer, a result card with the answer and the
  "new" dot, Notlarım's order, marks, Arabic and links, its empty and absent states, the list
  page's link, and the pure model.
- `notification-view.spec.ts`: the sentence in three languages, the icon and the link.
- `practice.spec.ts`: its server translator now reads each namespace (the list page also reads
  `tedris.QuestionNotes`). `practice-take`, `exam-take` and `answer-review` specs mock the new
  Server Actions.
- `e2e/practice.e2e.ts`: a new scenario (note written and sent from the solving screen, the
  hoca's answer written in the database, read under Notlarım); the seed turns notes on and the
  cleanup removes the notes before the questions. **Not run**: it needs the Keycloak talebe of
  the e2e environment.
- Measured on a local stack (a copy of the recording database with migration 0083 and three
  seeded notes): before/after screenshots of the solving screen (icon, panel), a result card
  with the note and the answer, the list page and Notlarım, at 1440 px and 390 px.
- Graphs: line references of the changed files moved with the code; `delurio check graphs
  --strict --baseline graphs/delurio.baseline.sarif` exits 0.

## Not verified

- The exam screens (`exam-take`, "Cevaplarım") were not opened in a browser: the recording data
  has no exam a talebe can sit. They are covered by the component tests only.
- The e2e scenario was not run (see above).

## Review

Findings of the pull request's review, all fixed:

- A draft was lost when the panel closed (an outside press, "Sonraki"): it is kept now.
- While sending was locked a save sent `sharedWithTeacher: false`, which would have taken back
  a note already sent: it now sends the note's own state, and the switch shows it.
- "Sil" on an answered note deleted the hoca's answer with one press: it asks first.
- Ctrl/⌘+Enter saved an unchanged note: it does not.
- Esc closed the panel only from inside it: it closes it from anywhere.
- "1 notes" in English: the count is an ICU plural in en and ar.
- A result card kept its first note after a refresh: it follows a newer one from the server.
- The e2e scenario picked the first course's Notlarım: it picks the seeded course's.

## Seen, not fixed here

- A Turkish note that starts with an Arabic word in «…» reads right to left in the textarea:
  `dir="auto"` takes the first strong letter. Asked for as `dir="auto"`; the note's display
  (`ArabicText`) frames it correctly.
- The guillemets around an Arabic run in a mixed text land on the wrong side («» before the
  word). That is `arabicRuns` in `libs/tokens`, which #471 changes; not touched here.

## Later

- A count on "Notlarım" needs a read that does not mark the answers read (a `?peek` or a count
  field on the practice list), in `apps/tedrisat`.
- Notlarım lists one course at a time; a page over every course needs a route over the caller's
  courses.
