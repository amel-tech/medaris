# MDRS-248: Soru notları in nazar (the hoca's screens)

The API came with #473 (`docs/migration/mdrs-248-soru-notlari.md`). This PR adds the hoca's
side in `apps/nazar`. The talebe's screens in tedris come in their own PR.

## The owner's decision

"ikon olarak dursun, tıklanırsa soruya eklensin, gereksiz yer kaplamasın soru ekleme alanında."
So the setting is a small icon on the question and takes no line or field of its own.

## What changed

- **The icon** (`components/talebe-notes-toggle.tsx`). It is IconButton's markup with
  `aria-pressed` and one name, "Talebe notları", in both states (a toggle's name must not
  change with its state). The tooltip says the state: "Talebe not ekleyebilir" when the icon is
  on, "Talebe notu kapalı" when it is off. It does not use `IconButton` itself, because
  `IconButton` names the button by its tooltip. On, it is the `chat` bubble. Off, the bubble is struck
  through, so the state is never shown by colour alone.
  - In the question form, it sits in the row of "Kaydet" / "Vazgeç". It goes into the save as
    `SaveExamQuestionDto.talebeNotes`. A new question starts with the API's default: on in a
    çalışma seti, off in an exam.
  - On a saved question's row (draft editor), it calls
    `onlineExams.setExamQuestionTalebeNotes` at once. It runs outside the version queue, because
    the route takes no version. The page shows the new state before the API answers. A refusal
    or a throw takes it back and shows a toast. The icon is disabled while the question is not
    on the server yet or is being saved. While the write is on its way, the row's form does not
    open, and a newer read of the page waits. Each state a write left is laid over later reads,
    because a read can predate the write.
  - On a published or locked set or exam (`PublishedExam`), every question card has the same
    icon (`QuestionNotesSwitch`). It works the same way: optimistic, with a rollback.
  - When an older response leaves `talebeNotes` out, the page reads it as the API's default
    (`takesNotes`).
- **"Talebe notları"** (`components/talebe-notes-section.tsx`). This is a part of the set's and
  the exam's page, draft or published, with the anchor `#talebe-notlari`.
  - It is a side read (`questionNotes.listExamQuestionNotes`). When the read fails, the part
    says so and the page goes on.
  - The page sorts the notes again after each answer, by the API's `teacherOrder`: the ones
    waiting for an answer first, the longest waiting first, then the answered ones, the latest
    answered first.
  - Each note shows its question's number and the first line of its text, the talebe's name,
    the note, when it was sent, a "Cevapsız" or "Cevaplandı" badge, and "Cevaptan sonra
    değişti" (`editedAfterReply`).
  - Each note has a short answer field in place, with "Cevapla", then "Cevabı düzenle" and
    "Cevabı kaldır" (an empty `reply`). A removed answer stays in the field, so it can be sent
    again. One answer write runs at a time. A successful one reads the page again, so the
    header's count follows.
  - When no note has been sent, the part says so.
  - The page header links to the part when `unansweredNotes > 0`.
- **The badge.** In the Çalışma Soruları table and the exam list, a set or exam with
  `unansweredNotes > 0` shows "N not". The badge is a link to `#talebe-notlari` on its page.
- **Notifications.** `QUESTION_NOTE_SHARED` now has a title: "“{setTitle}” setine talebe notu
  geldi" for a set, "… sınavına …" for an exam, and "Talebe notu geldi" when the set has no
  title. It leads to the notes on the set's or exam's own page in nazar, and the link is built
  from UUIDs only.
- **Arabic.** The question text, the note and the answer use `ArabicText`, `textProps` and
  `startsArabic`, as the editor does.
- i18n: `nazar.QuestionNotes` and `Notifications.types.QUESTION_NOTE_SHARED` in tr, en and ar.

## Verified

- `apps/nazar/test/question-notes.spec.tsx`: the order, the anchor, the default, the list with
  its badge and fields, the empty and failed states, answer, edit and remove, a refusal, Arabic
  by the standard, the icon on a published question (optimistic, one write at a time,
  rollback), the table badge, and the notification's title and link.
- `apps/nazar/test/exam-editor.spec.tsx` ("the talebe-notes icon in the editor"): the row icon
  (optimistic, outside the queue, rollback on refusal and on a throw), the default by kind, and
  the form icon in the button row, sent with the save.
- On a local stack (a copy of the recording database with `0083` applied and four notes added),
  the icon was clicked on a published set and the database showed `talebe_notes = false`. A note
  was answered from the page and was stored, and the part then showed "1 cevapsız".

## Review

`/code-review` (medium) found six issues, and all six were fixed:

- A row's form opened during an icon write kept a state the API then refused.
- A read that predated an icon write showed the old state.
- The header count did not change after an answer.
- The toggle's name changed with its state.
- "Cevabı düzenle" could be clicked while "Cevabı kaldır" was on its way.
- The notes read's log label always said "set", on an exam page too.

## Not verified

- Not tried on dev, and not in a screen reader.
- The notification row was not opened in a browser; only the spec covers its title and link.

## Design-system gap

The system draws a pressed `IconButton` with the glyph's fill twin. The sprite has fill twins
only for `star`, `play` and `bookmark`, so there is no filled `chat`. This screen strikes
through the bubble when the icon is off, instead of filling it when it is on. A `chat` fill
twin (or `ChatCircleSlash`) in the canonical project would let the icon follow the rule. That is
Taha's decision, made in the claude.ai/design project, not in this repo.

## Later

- The talebe's side (tedris) and `QUESTION_NOTE_REPLIED`'s text in tedris are the tedris PR's.
- No graph state draws the icon or the notes part yet. The graphs' `source:` lines were moved to
  follow the code.
