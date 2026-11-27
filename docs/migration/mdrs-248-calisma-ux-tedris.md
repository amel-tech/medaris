# Çalışma soruları: the talebe's screens, UX pass (MDRS-248)

Date: 27 November 2026. Scope: `apps/tedris` (`features/practice`, the
`calisma-sorulari` routes, one optional prop on the shared question list) and
`libs/i18n` (`tedris.json` only). Nazar, `nazar.json`, the API and every other
lib are not touched. Builds on `mdrs-248-calisma-sorulari-tedris.md`.

Measured on a local stack with the recording data (a copy of the
`tedrisat_calisma` database, 13 sets in two courses), before and after, at
1280px and 390px.

## What changed, in order of weight

1. **List as a table.** Each course was a heading over a full-width card per
   set (13 cards; the full-page screenshot of the list was 3027px tall at
   1280px wide and 2967px at 390px). Now a course
   is a heading with "N set · N çözüldü", then one table: Set, Soru, Deneme,
   Son sonuç, Durum and the action, the columns the same width in every
   course (after: 1674px at 1280px, 2215px at 390px, same data). Durum is a badge in words (Yeni / Devam ediyor / Çözüldü). The
   action buttons are graded so a row has at most one filled button: "Devam
   et" primary, "Başla" secondary, "Tekrar çöz" outline. Below 768px a row is
   two lines: the set and its state, then "N soru · N deneme · Son sonucun:
   %N" and the action; that line is `aria-hidden` and the three number
   cells stay in the accessibility tree, visually hidden, under their own
   headers. "N çözüldü" counts the rows marked "Çözüldü" (a set being
   solved again is "Devam ediyor"). The table is the system's `.mds-table` class layer
   drawn on the server, with explicit roles, not the client-only `Table`
   component, so each row keeps `data-testid="practice-set"`.
2. **Karışık deneme block.** It sat between the course heading and its sets,
   looking like one more set. Now it follows the table under its own
   heading, "Karışık deneme"; "Tüm soruları çöz (N)" is secondary and
   "Rastgele soru çöz" outline, so the set rows keep the strongest buttons.
3. **Percentages are whole numbers** (`percentText`, `maximumFractionDigits:
   0`): "%83" beside "%80", not "%83,33". The API is unchanged.
4. **Solving: button order.** "Önceki" and "Soruyu atla" on the start side;
   "Bitir" and "Sonraki" on the end side. "Sonraki" leads (primary) while
   there is a next question and "Bitir" is outline; once nothing comes next
   "Sonraki" is disabled (kept in place, so focus is not dropped and "Bitir"
   does not slide under a second click) and "Bitir" turns primary. On a phone each side fills its
   own row with equal-width buttons. The bar has a progress bar and
   "N/M cevaplandı"; the save state ("Kaydediliyor…" / a tick and "Cevabın
   kaydedildi.") sits in an always-present `aria-live` line.
5. **Question list key.** `QuestionNavigator` takes an optional `legend`;
   the practice screen passes a key with each state's swatch and count
   ("Cevaplandı (2) · Atlandı (1) · Cevaplanmadı (5)"). The exam passes none
   and is unchanged; the colours (`INDICATOR`, now exported) are not changed.
6. **Result.** The percentage has a bar; Doğru / Yanlış / Boş are the
   system's Stat tiles with a glyph each (tick, cross, ban) beside the
   colour. The answers have a filter (Tümü / Doğru / Yanlış / Boş with their
   counts, `ChoiceChips`), announced through a hidden `aria-live` line. Each
   answer card has its outcome on its start edge, its badge carries the
   glyph, and a wrong choice is "Senin seçimin" in the error colour with a
   cross (a right one stays info). "Set: <ad>" is written only in a mixed
   (pool) attempt; in a set's own result it repeated the page title on every
   question.
7. **Loading.** The list's skeleton is a heading over table rows; the set and
   pool routes now have the solving screen's skeleton (they showed the
   list's), and the result route has its own. The page's own "opening" state
   uses the same skeleton.

## Verified

- `tedris-web` unit tests: `practice.spec.ts` and `practice-take.spec.ts`
  updated and extended (status words, one table, the course summary, whole
  percentages, the filter counts, the wrong-choice badge, no "Set:" in a set
  attempt, "Sonraki"/"Bitir" leading in turn, the progress text and the key).
- The repository gate, on this machine: `typecheck` (18 projects),
  `lint` (18), `module-boundaries` (18) and `build` (8 projects) green.
  `test`: `tedris-web` 103 files, 1394 tests green; every other suite green
  except `tedrisat` and `keycloak-theme`, red in both runs on different
  Testcontainers e2e cases (Keycloak containers, and 9 unrelated tedrisat
  e2e cases in the second run). Neither project is in
  `nx show projects --affected` for this change (tedris-web, i18n,
  landing-web, nazar-web, nizam-web), and Docker was shared with another
  worktree's run at the time; not treated as a regression, not verified
  green here.
- Screenshots before and after on the local stack (desktop and 390px).

## Not verified

- **Arabic / RTL on screen.** The local session kept Turkish when the
  `medaris-locale` cookie was set to `ar`, so the Arabic screens were not
  looked at. Everything added uses logical properties (`border-inline-start`,
  `justify-self-end`, `is-end`), and the Arabic strings are in the
  catalogue, but nobody has seen them drawn.
- The Playwright e2e (`apps/tedris/e2e/practice.e2e.ts`) needs a Keycloak
  talebe in the environment and was not run; its selectors
  (`practice-set`, "…: başla", the question's "Bitir", `practice-correct`)
  are kept.

## Later

- A course with many sets could take a filter (Yeni / Devam ediyor /
  Çözüldü) or put "Devam ediyor" first; with 11 sets in one course the table
  is still one screen on a desktop, so not now.
- The last result as a small bar in the table (the system's `Progress`) needs
  a client cell; the number reads fine without it.
- The question list's colours are the owner's (22 Nov 2026); the skipped
  (warning bold) and answered (info bold) fills were not re-measured for
  contrast here.
- Per-set history (every attempt's percentage, not only the last) needs the
  API to list a set's attempts for the talebe.
