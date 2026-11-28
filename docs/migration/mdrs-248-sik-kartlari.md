# Solving screen: option cards, one column, Bitir apart (MDRS-248)

Date: 27 November 2026. Scope: `apps/tedris` (the çalışma soruları solving
screen and the online exam's solving screen, which share
`features/online-exams/components/question-parts.tsx`), `libs/i18n`
(`tedris.json` only) and the line references of `graphs/tedris/exams/take`.
Nazar, `nazar.json`, `tedris-learn.json`, `libs/tokens`, `libs/ui` and the
API are not touched. Builds on `mdrs-248-talebe-sonuc.md`.

The owner's complaint: the options were a plain radio list ("Şıklar" and
small circles) that did not look clickable; "Önceki / Soruyu atla" sat at the
card's left edge and "Bitir" next to "Sonraki" at its right edge, far from the
options and one slip apart.

## What changed

1. **Option cards.** `QuestionOptions` draws the system's bordered choice row
   (`RadioGroup bordered`, `Checkbox bordered`) with a letter badge (A, B, C …)
   as its icon. The whole row is the `<label>`, so a click anywhere chooses;
   underneath it is still a radio group (a group of check boxes for a
   MULTIPLE question), so the arrow keys, the focus order and a screen reader
   are Base UI's. `apps/tedris/app/tedris.css` refines the row for this screen
   only (`.take-options`): at least 48px high, a hover tone, a focus ring on
   the whole card, and when chosen a brand-subtle fill, a doubled brand edge
   and a filled letter badge, beside the control's own dot or tick, so colour
   is never the only cue. An option's text is a block, so an Arabic option
   (`textProps`) fills its card and lines up on the right.
2. **One reading column.** The bar, the question card and the list share
   `--layout-measure-prose` (`.take-column`), centred. Under the options, in
   the same card: "Önceki" and "Soruyu atla" on the start side, one primary
   button on the end side.
3. **Bitir apart.** "Bitir" (exam: "Sınavı bitir") is a small secondary
   button in the top bar beside A− / A+. Under the options the primary
   button says "Sonraki" and, at the last question or once every question is
   answered, "Bitir": the same element, so the focus stays on it. The
   confirmation (blank count; the exam's unanswered/skipped/time) is
   unchanged.
4. **Keys** (`TakeKeys`): 1–9 or A–Z picks an option (a check box turns
   over), Enter presses the primary button. Not with Ctrl/Alt/Cmd, not while
   a text field, a dialog or a combobox has the focus, and Enter on a focused
   button stays that button's. An Arabic keyboard is read by the key's place
   (`KeyboardEvent.code`). A hint line under the buttons
   (`tedris.TakeBar.keysHint`), hidden below 640px.
5. **Phone (below 640px).** The button row holds to the bottom of the screen
   (sticky inside the question card) on two rows: "Önceki" and "Soruyu atla"
   side by side, the primary button full width under them.

The exam keeps its clock, holder, tab-switch count and A− / A+ widening; only
its button row and bar changed.

## Verified

- `pnpm nx run-many -t typecheck | lint | module-boundaries | test | build`
  (each with `env -u NODE_ENV`), and `delurio check graphs --strict
  --baseline graphs/delurio.baseline.sarif` with `@delurio/cli@0.14.0`:
  0 errors, the same 19 warnings as on main.
- New specs: a click on the card's text chooses; the letter badges; 1–9 /
  A–Z / Enter, a key past the last option, Enter at the end opening the
  confirmation; keys left to a field, to a button's Enter and to Ctrl; a
  MULTIPLE question as check boxes turned over by keys; Bitir in the bar and
  as the primary button at the end; the Arabic option as a block; on the exam
  the same plus no key on the briefing and none under the dialog.
- Screenshots before and after (desktop 1440 and 390px: the solving screen, a
  chosen option, an Arabic question, the last question, the exam) against a
  copy of the recording database, on a local tedris with a local Keycloak.

## Not verified

- A MULTIPLE question in a browser: the recording data has none; covered by
  the specs only.
- The arrow keys moving between cards in a browser: Base UI's own behaviour,
  not re-tested here.
- The sticky row on a real phone (measured in headless Chromium at 390px).

## Graphs

`graphs/tedris/exams/take/{flow,needs,ui}.yaml` cite lines of
`exam-take.tsx` and `question-parts.tsx`. Each reference was moved by the
diff's line map (references that were already past the file's end on main
were left as they were). `ui.yaml` `nextButton` and `finishButton` say where
the two buttons now are; `flow.yaml`'s last-question skip says Bitir stands
in Sonraki's place.

## Follow-ups

- The reading measure (58ch) leaves wide margins on a desktop; if the owner
  wants the column wider, it is one value in `.take-column`.
- The briefing's "Yuvarlak düğmeli bir soruda … kutulu bir soruda …" still
  holds (the control is drawn on each card); it does not mention the keys.
