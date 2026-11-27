# MDRS-248: long questions and no shortcut line

Two changes to the question screen of the çalışma soruları and the online
exam, after #477 (option tiles).

## What changed

- **No shortcut line.** "Kısayollar: şık seçmek için 1–9 ya da A–Z, sonraki
  soru için Enter." is gone from both screens (`practice-take.tsx`,
  `exam-take.tsx`), and `tedris.TakeBar.keysHint` from tr/en/ar. The
  shortcuts still work. The leading button carries
  `aria-keyshortcuts="Enter"`; the option group does not name 1–9 / A–Z,
  because `RadioGroup` in `libs/ui` passes no extra attributes through.
- **Long questions** (several paragraphs, an âyet on a line of its own,
  options of 150+ characters):
  - The question text keeps its own line breaks (`.take-question`,
    `white-space: pre-line`) and wraps in the reading column.
  - Option tiles: `grid-auto-rows: 1fr` is gone. In one column each tile is
    as tall as its own text; in the 2×2 grid the two tiles of a row stretch
    to each other (the grid's default), not to the tallest tile of the group.
  - The buttons under the options (`.take-nav`) are sticky at the bottom on
    every width, not only below 40rem, so "Sonraki" stays reachable when
    the question and options run past the screen.
  - Answer cards (`AnswerReview`, practice result and past exam): the
    question text keeps its line breaks and a long one is cut at six lines
    with "Devamını göster" / "Daha az göster" (`tedris.AnswerReview.showMore`
    / `showLess`). A text counts as long by more than six lines or 280
    characters, then is measured in the browser: a text that fits has no
    button.
  - Nazar, the one-line question row of the editor: a question of several
    lines shows its first line and " …" (`rowText`). Before, the row was
    cut in the middle of the âyet line and showed the end of the Arabic
    run.

## Verified

- `pnpm nx run-many -t typecheck lint -p tedris-web nazar-web i18n`,
  `tedris-web:test` (1440 tests), `nazar-web:test` (1976 tests),
  `build -p tedris-web nazar-web`: green.
- `delurio check graphs --strict --baseline graphs/delurio.baseline.sarif`
  (0.14.0): 186 graphs, 0 errors, 19 warnings. Source lines in
  `graphs/tedris/exams/{take,result}` and `graphs/nazar/exams/{edit,publish}`
  follow the code.
- Local stack screenshots before/after, desktop and 390px: a five-question
  set with two long questions and one with long options, the result cards,
  the nazar rows.

## Not verified

- Long option texts on the answer cards are not cut; a card with four long
  options still sets its row's height.
- Dark theme was not screenshotted.
