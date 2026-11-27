# Çalışma soruları: the question form and the status badges (MDRS-248)

Date: 27 November 2026. Scope: `apps/nazar` (`features/online-exams`),
`apps/tedris` (`features/practice`) and `libs/i18n` (`nazar.json` only).
Builds on the UX passes in `mdrs-248-calisma-ux-nazar.md` and
`mdrs-248-calisma-ux-tedris.md`. The API and `libs/ui` are untouched.

## What changed

- **Question form** (`exam-editor.tsx`, `QuestionForm`; one form for an
  exam and a çalışma seti, so both changed). The card keeps the list's
  width, but what is inside it keeps the reading measure
  (`max-inline-measure`, the design system's `--layout-measure-prose`,
  58ch), so neither the question nor an option runs across the screen. The
  question textarea grows with its text (`field-sizing: content`, where the
  browser supports it; elsewhere it stays three rows and resizable, as
  before).
- **Option rows**: the option's letter (A, B, C…, its number after Z), its
  "Doğru" box, then the field, on tight rows. Each "Doğru" box is described
  by its letter (`aria-describedby`), so a screen reader no longer hears
  five identical "Doğru" boxes. The field keeps its name ("1. şık").
- **Quick entry**: Enter in an option moves to the next one; on the last
  it adds an option (Enter no longer sends the form from an option field).
  A paste of two lines or more fills the option it lands in and those
  after it, one line each, adding options as needed; blank lines are
  dropped, and list marks ("A) ", "1. ") are taken off only when every line
  carries one. A help line under "Şıklar" says so (tr/en/ar). "Şık ekle"
  now puts the caret in the new option. Options stop at 50, the API's
  `@ArrayMaxSize(50)` (`OPTIONS_MAX`); "Şık ekle" is hidden there and a
  longer paste is cut at it.
- **Status badges in tables** have one minimum width and centred text, so
  the column lines up: nazar's set table (Taslak/Yayında,
  `min-inline-20`), tedris's set table (Yeni/Devam ediyor/Çözüldü,
  `min-inline-24`, also in the phone card layout) and the exam results'
  talebe table (its state column). The tedris row buttons (Başla/Devam
  et/Tekrar çöz) get the same minimum width. The width is set where the
  badge is used; the kit's `Badge` is unchanged, so badges elsewhere keep
  their own width. A longer translation grows past the minimum.

## Verified

- `exam-editor.spec.tsx`: the row order (letter, box, field), the box's
  description, the help line, Enter to the next option and past the last,
  a pasted list spread and saved, a one-line paste let through.
  `online-exams.spec.ts`: `optionLetter`, `pastedOptions`, `spreadOptions`.
- Screenshots before and after (desktop and 390 px) of the form, the nazar
  set table and the tedris set list, against a local stack.
- The gate in the PR body.

## Not verified

- `field-sizing: content` growth in Safari and Firefox; there the textarea
  falls back to its old fixed three rows.
- Arabic and English widths of the badges by eye (the minimum only grows).

## Later

- A question pasted with its options in one go into the question field
  (split into the text and the options).
- The exams list (`exams-page.tsx`) shows its status badges inline after
  each title, not in a column; left as is.
