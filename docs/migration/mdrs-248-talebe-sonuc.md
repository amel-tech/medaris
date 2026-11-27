# Talebe screens: A−/A+ in the bar, answer cards, outcome strip, Arabic (MDRS-248)

Date: 27 November 2026. Scope: `apps/tedris` (the çalışma soruları solving
and result screens, the online exam's solving screen and a past exam's
result) and `libs/i18n` (`tedris.json` only). Nazar, `nazar.json`,
`tedris-learn.json`, the API and `libs/tokens` are not touched. Builds on
`mdrs-248-calisma-ux-tedris.md` and `mdrs-248-arapca-metin-standardi.md`.

## What changed

1. **A− / A+ once per screen.** The step was already the page's (`textStep`,
   kept per set or exam in `sessionStorage`), but the buttons were drawn on
   every question card. They now sit once in the top bar: beside the
   counter on the çalışma screen, beside the timer and the save state in the
   exam. `TextSizeButtons` is a `<fieldset>` named "Yazı boyutu"
   (`tedris.TakeBar.textSizeLabel`). Persistence is unchanged.
   The exam briefing's sentence said "soru kartının üstündeki A− ve A+";
   it now reads from `tedris.TakeBar.textSizeFact` ("… sınav sırasında üst
   çubuktaki A− ve A+ düğmeleri bunu yapar."), with the same drawn sample.
2. **Answer cards in a grid** (`features/online-exams/components/answer-review.tsx`,
   `AnswerReview`), shared by a çalışma attempt's result and a past exam's
   "Cevaplarım". One column below 768px, two from `md`, three from `xl`;
   `items-start`, so each card is as tall as its text; `overflow-wrap:
   anywhere`, so a long word wraps instead of widening the card. A card
   holds the number, the outcome badge (with its glyph), the exam's points
   where there are any, the question, "Set: …" in a mixed attempt, and only
   the chosen and the correct options (the others are left out). The exam
   result's badges now carry glyphs too, as the çalışma result's did.
3. **Outcome strip.** Above the filter, a numbered tile per question:
   correct is green with a tick, wrong red with a cross, blank grey with a
   "ban" glyph and a dashed border. Each tile is a button named
   "3. soru: Yanlış" (`tedris.AnswerReview.tileLabel`). A click scrolls to
   the card and focuses it (the card has `tabIndex=-1` and a brand ring
   while it is the target). When the "Tümü · Doğru · Yanlış · Boş" filter
   hides that card, the filter goes back to "Tümü" first. The scroll glides
   over a short distance and jumps over a long one, or whenever the system
   asks for reduced motion.
4. **Arabic everywhere on these screens** through one component,
   `ArabicText` (`arabic-text.tsx`): an all-Arabic text is one Arabic block
   (`textProps`); a text that mixes Turkish and Arabic, in either order,
   keeps the page's direction and size and draws each Arabic run on its own
   isolated element (`arabicRuns` + `textProps`), at `--lh-arabic` (1.8)
   rather than the block's 2, so a Turkish line with one Arabic word does
   not open up. It is used for the question and the options on both solving
   screens, the result cards (question, options, set title), the page and
   bar headings, and the exam briefing's title and zeroth question.

The words of the strip, the filter and the cards moved from
`tedris.Practice` to `tedris.AnswerReview` in all three locales.

## Measured

Local stack: a copy of `tedrisat_calisma` (`tedrisat_talebe_sonuc`), API on
3011, tedris on 4010, Playwright 1.63 Chromium. Sample data added to the
copy only: a set "Arapça ibareler" (6 Arabic, mixed and Arabic-option
questions) with a finished attempt, a set of 494 more questions, a finished
mixed (pool) attempt of all 500, and a past online exam "Arapça ara sınav"
(8 questions), released and closed.

| page | width | load to ready | DOM nodes | tile click to focused card |
| -- | -- | -- | -- | -- |
| result, 6 questions | 1440 | 1001 ms | 376 | 40 ms |
| result, 500 questions | 1440 | 1385 ms | 11987 | 146 ms (tile 450) |
| result, 500 questions | 390 | 867 ms | 11987 | 124 ms (tile 450) |
| exam result, 8 questions | 390 | 662 ms | 406 | 30 ms |

Before this change the 500-question result was 1002 ms / 11582 nodes at
1440px. "Load" is `goto` with `networkidle` on a dev server, so it measures
the dev build, not production. After the jump the focused card's top was
96px from the viewport's top (its `scroll-margin`) at both widths.

`content-visibility: auto` on the cards was tried and removed: with
estimated heights, the card a tile scrolled to ended up out of view after
the cards above it rendered. Without it, 500 cards are drawn whole; the
cards are memoised, so a tile click re-renders the strip, not the cards.
No virtual list was needed at 500.

## Not verified

- The online exam's solving screen in a real browser: the sample exam is
  closed. The bar placement is covered by `exam-take.spec.ts` only.
- A screen reader, Windows and Safari.
- `tedrisLearn.OnlineExam.factTextSize` in `tedris-learn.json` is no longer
  read; it was left in place because this change touches `tedris.json` only.

## Later

- Remove the unused `tedrisLearn.OnlineExam.factTextSize` key (all three
  locales).
- With 500 questions the strip itself is tall (about 20 rows at 1440px).
  Grouping it by tens, or folding it, is a design decision.
