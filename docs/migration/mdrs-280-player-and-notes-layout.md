# MDRS-280 — The talebe's player and notes, laid out to be used while watching

The owner sent the course page's "Ders kayıtları" tab, as a signed-in enrolled talebe, and said "bu
ekran kullanışlı değil". It is the screen of MDRS-150 where a talebe watches a recording and takes private
notes; the session page has the same pair. This note says what changed on both, why, what was decided by
default, and how it was checked: in vitest, in Playwright against a running stack, and by looking at
real screenshots before and after. The API, the privacy and gating rules, the YouTube player hook
(`youtube-player.ts`) and the Bunny frame attributes (`media-player.tsx`) are as they were. Every number
below was read off a command's output.

It was built in two rounds. The first made the panel compact and put it under the player. After seeing
the screenshots the owner asked why the empty right-hand column was not used, and then decided: "zaten
notlar altta kalsın, video genişlesin" (the notes stay below, let the video widen). The second round did
that, and fixed at its root the stylesheet clash the first round had found (MDRS-281,
`mdrs-281-one-stylesheet-for-tedris.md`).

## What was wrong (measured on main, `0ca50a3d`)

Screens taken with Playwright's Chromium at 1440x900, 1180x800 and 390x844 (the stack of the MDRS-150
browser specs, a course with one Bunny recording, the same with three notes, a course with a YouTube, a
Bunny and a Drive recording, and two session pages):

| | 1440 / 1180 | 390 (phone) |
| --- | --- | --- |
| the video on the tab | 334x188 / 314x177 px, beside a 384 px wide, 561–850 px tall notes card | **32x18 px**, drawn under the notes card |
| the notes heading | a 144 px tall box: about 85 px of blank space above "Notlarım" and as much under it | the same |
| the note field | a 96 px textarea under a visible "Not" label, a Markdown/4000 line, then a full-width "Videodaki an" field with a `12:34` placeholder, its help line, then the button | the same, stacked |
| "Bütün ders kayıtları" | a whole card repeating the one recording that is already playing ("HAFTA 1" over "Hafta 1", a row ending in "Oynatıcıda") | the same; titles squeezed to one word a line |
| the session page | the player at the main column's width, but the notes 380 px further down, under the join card | the same |

Two causes are not visible in the code at a glance:

- **`max-lg:` lost on these pages.** tedris loaded two Tailwind builds, the kit's and the design
  system's, and the second redeclared the tab's two-column grid class after the first's
  `max-lg:grid-cols-1`; so at every width, a phone included, the notes column took its 24rem and the
  player got what was left (32 px at 390). MDRS-281 removes the clash itself; the layout no longer uses a
  breakpoint at all.
- **The blank space above "Notlarım"** was `.mds-card__title { flex: 1 1 12ch }` inside a
  `.mds-card__header` turned into a column (`flex flex-col`): the 12ch basis became a height (144 px at
  the h3 size) and the heading's `items-center` put the text in its middle.

## What the owner will notice

1. **The video is the largest thing on the page.** On "Ders kayıtları" the tab's panel spans both of the
   page's columns from 768 px up, so the player is 1118x629 at 1440x900 and 1098x618 at 1180x800 (it was
   334x188 and 314x177 on main, 742x417 after the first round). The course's card (progress, next
   session) stays beside the header and no longer sticks beside this tab; the other tabs keep the reading
   column and the sticky card. On a short window the player narrows, centred, until a whole 16:9 frame
   fits under the top bar: 1043x587 at 1440x700.
2. **The notes are directly under the video**, at its width, on every screen. A note's text keeps a
   reading measure of 70ch.
3. **Switching tabs does not move the tab row.** On the recordings tab it starts under the taller of the
   header and the card, on the others under the header; with a next-session card that is 192 px. The page
   scrolls by what the row moved, so the row stays where it was clicked (measured: 405 px from the top of
   the window before, during and after the switch).
4. **The session page of a finished session** gives its recording the page's width, above the join card
   and the aside, with the notes under it. During a live lesson the stream stays in the column after the
   join card, so "Celseye katıl" is not pushed under a page-wide video.
5. **The notes panel is compact.** "Notlarım" and "Yalnızca sen görürsün." are one line; a two-line note
   field ("Notunu yaz…") that grows with the text; under it one row: the time field, "Şimdiki an" when the
   player is YouTube's, and "Notu ekle" at the end. With no position to read (Bunny, Drive, others) the
   time field says `dk:sn` and one line under the row says "İsteğe bağlı: oynatıcıdaki süreyi yaz.". The
   Markdown hint shows only once the talebe writes, and the character count only from 3600 of 4000.
   Notes read as a timeline: the time (a button that moves the YouTube player, a label otherwise), the
   text, then two icon buttons (edit, delete) with tooltips. "Bu celse için henüz notun yok." stays the
   one-line empty state. The panel is 241 px tall with no notes (it was 561), 369 px with three (813).
6. **"Bütün ders kayıtları" appears only when there is something to choose**: more than one recording,
   or a lone one that does not play in the frame (it opens at its host, or is being prepared). It is a
   compact playlist in one card: each week's label on one line ("HAFTA 1 · Mâzî ve muzâri", or "HAFTA 2"
   alone when the week is titled "Hafta 2"); the whole row is the button that plays a recording; the one
   playing is tinted, has a filled play icon and "Oynatıcıda"; a row that opens at its host is one link
   ending in "Ders kaydını aç ↗"; a row being prepared is plain text with "Hazırlanıyor".
7. **On a phone** everything is one column, as before: the player at full width (356x200), the notes
   under it, the playlist's chips under each title instead of squeezing it. Nothing is wider than the
   screen (the page's `scrollWidth` is 390 at 390 on every screen; the tab strip scrolls inside itself).

## What changed

| Piece | Where |
| --- | --- |
| `PlayerWithNotes`: the player, then the notes, at every width; on a short window the block narrows, centred, to `min(100%, (100svh − the top bar − 3rem) × 16/9)` | `features/courses/components/player-with-notes.tsx` (new), used by `recordings-tab.tsx` and `session-page.tsx` |
| the recordings tab's panel over both columns, the card beside the header (not sticky) on that tab, the tab row held in place on a switch | `features/courses/components/course-page.tsx` |
| a finished session's recording above the page's two columns | `features/courses/components/session-page.tsx` |
| the compact panel, the time field, the growing note (`field-sizing: content`, two to ten lines), the timeline rows (narrow: time and actions on a row, text under; from a 30rem panel: three columns; the text at most 70ch) | `features/courses/components/lesson-notes.tsx` |
| the playlist, its rows, the week label | `features/courses/components/recordings-tab.tsx` |
| `listsRecordings`, `isPlainWeekTitle` | `features/courses/recordings-model.ts` |
| `showsBodyCount` | `features/courses/lesson-note-model.ts` |
| strings | `libs/i18n/src/locales/{tr,en,ar}/tedris-learn.json`, inside the existing `RecordingsTab` and `LessonNotes` blocks |

Strings: new `RecordingsTab.playingLabel` ("Oynatıcıda: {title}"), `LessonNotes.bodyPlaceholder`,
`bodyHint`, `bodyCount`, `timePlaceholder` ("dk:sn"); `LessonNotes.timeHelpManual` now reads "İsteğe
bağlı: oynatıcıdaki süreyi yaz." (was "Örneğin 12:34. Boş bırakabilirsin."); removed, no longer used:
`RecordingsTab.play`, `LessonNotes.bodyHelp`, `LessonNotes.edit`. tr first, en and ar for parity; the
three files have the same 119 keys (a key-set comparison over `tedris-learn.json`), and both blocks have a
parity test.

Accessible names the browser specs use are unchanged: the region "Notlarım", the note "Not" and the time
"Videodaki an" (now `aria-label`s, their visible labels are gone), "Notu ekle", "Şimdiki an", "Notu
düzenle, 1:05", "Notu sil, Zamansız", "Videoyu 1:05 anına götür", "Sil", and "Oynat: {title}" on each
playlist row that is not playing. The help that was a visible line is now the field's accessible
description (`aria-describedby`): "Oynatıcıdaki an yazılır; …" with YouTube (visually hidden), the
"İsteğe bağlı" line otherwise.

## Decided by the owner

- The notes stay under the video at every width; the video takes the page's width ("zaten notlar altta
  kalsın, video genişlesin"). No side-by-side mode and no notes in the aside column.

## Decided by default, owner may overrule

1. **Only the recordings tab is page-wide**, for every viewer of it (a visitor watching a public
   recording too). The other tabs keep the reading column with the sticky card beside them.
2. **The tab row is held in place by scrolling** the page by what it moved on a switch; it moves only
   when the card is taller than the header, and only between the recordings tab and the others.
3. **The short-window cap** leaves the top bar (64 px) and 1.5rem above and below the frame, and uses
   `svh` so a phone's toolbars do not resize the player as they come and go; on a phone it never applies
   (a 390 px wide frame is far shorter than the screen).
4. **The notes are as wide as the video** (their edges line up), with the note text held to 70ch for
   reading.
5. **A live stream is not page-wide**: it stays in the column after the join card, with the notes under it
   and then YouTube's chat.
6. **A lone recording that plays above is not listed again**; a lone one that only opens at its host or
   is still being prepared is (the list is then its only place).
7. **The time is taken when the talebe starts writing**, as MDRS-150 did, not shown ticking: with
   YouTube the field fills with the player's position on the first focus of the note, and "Şimdiki an"
   refreshes it; until then it shows `dk:sn`. A Bunny recording keeps the typed time (its position API is
   MDRS-264, not built here).
8. **The note's and the time's labels are not drawn** (the card's heading and the placeholders say
   what they are); they stay as accessible names.
9. **The count shows from 3600 characters** (the last tenth), as "3600/4000 karakter", after "Markdown
   yazabilirsin. ·".
10. **Edit and delete are icon buttons** (`IconButton`, the system's 24 px in-row size, with tooltips);
    the delete confirmation ("Silinsin mi? Sil Vazgeç") opens on a row under the note.
11. **A week title is "plain"** when, ignoring case, spaces and leading zeros, it is "Hafta N", "N. hafta",
    "N hafta", "Week N", "الأسبوع N" or empty. Then only the label "HAFTA N" is printed.
12. **"Bütün ders kayıtları"** keeps its h2 element but is drawn at the h3 size, and the playlist sits in
    one compact card instead of one card per week.
13. **The playing row is still a button** (pressing it again changes nothing), named "Oynatıcıda:
    {title}" with `aria-current="true"`; each row's date and length are its description.

## Tests

Vitest, from `apps/tedris`, with `NODE_OPTIONS=--no-experimental-webstorage`. The whole suite at the end
of round 2: `Test Files 83 passed (83)`, `Tests 854 passed (854)`.

**Round 1** (the panel, the playlist): the seven files it touched or added, on the branch, `Tests 180
passed (180)`; with the round's nine source and locale files put back to `origin/main` and
`player-with-notes.tsx` removed, `Tests 35 failed | 142 passed (177)`, and `player-with-notes.spec.ts` did
not load.

**Round 2** (the page-wide video): the five files it touched or added, on the branch, `Tests 46 passed
(46)`; with `course-page.tsx`, `player-with-notes.tsx`, `session-page.tsx` and `lesson-notes.tsx` put back
to round 1, `Tests 9 failed | 37 passed (46)`.

| Criterion | Test | Red without the change |
| --- | --- | --- |
| the player first, the notes under it, never two columns, no container or viewport query | `player-with-notes.spec.ts` › puts the player first and the notes under it; › is never two columns, at any width; › is the player alone …; `recordings-tab-notes.spec.ts` › comes under the player, at every width | yes, all (round 2) |
| a whole 16:9 frame on a short window | `player-with-notes.spec.ts` › narrows, centred, until a whole 16:9 frame fits under the top bar | yes |
| the recordings tab over both columns, the card beside the header, not sticking; the other tabs unchanged | `course-page-states.spec.ts` › gives the recordings tab both columns, and keeps an enrolled talebe's / a visitor's card beside the header, not sticking; › keeps the mufredat / muderrisler tab in the reading column, beside the sticky card | yes, both; the other two are guards |
| the tab row stays where it was clicked | `course-page-tab-row.spec.ts` › stays where the reader clicked it when the recordings tab widens the page | yes |
| a finished session's recording page-wide, above the join card and the agenda; a live stream in the column | `session-notes.spec.ts` › gives a finished session's recording the page's width …; › keeps a live stream in the column after the join card … | yes; the second is a guard |
| no blank space above the heading, header on one line | `lesson-notes.spec.ts` › names the panel and who reads it on one line, with no card header to stretch | yes (round 1) |
| a two-line note that grows | › starts the note at two lines that grow with the text | yes |
| Markdown hint only while writing, the count only near the limit | › says Markdown is welcome only once the talebe writes, …; `lesson-note-model.spec.ts` › the character count | yes, both |
| the time beside "Notu ekle": typed with `dk:sn` and the optional line, or with "Şimdiki an" | › puts the time next to the add button, …; › with a player, offers 'Şimdiki an' beside the field …; › offers a typed time and no button … | yes, all three |
| notes as a timeline | › reads each note as a timeline row: its time, its text, then its actions | yes |
| no list for one playable recording | `recordings-tab.spec.ts` › does not list a lone recording that is already playing above; `recordings-model.spec.ts` › listsRecordings (3) | yes, all |
| the whole row selects, the playing one marked | › makes the whole row the button: a click on the title plays it; › marks the row that is playing, and only that one; › names each row's facts as its description | yes, all three |
| a link-out row keeps its link | › makes a row that opens at its host one link, in a new tab | yes |
| the week title not repeated | › prints a week whose title only names the week once; `recordings-model.spec.ts` › isPlainWeekTitle (15 cases) | yes, all |
| guards that pass on both sides | › lists a lone recording that does not play in the frame (2); › says there are no notes in one short line; both parity tests | no (by design) |

Existing tests moved to the new markup only where a selector changed: the edit and delete buttons are
found by their accessible names (unchanged), the playlist row by `aria-label`, the week groups by
`section[aria-labelledby^="week-"]`, and the manual time help by its new words.

Other gates: `tsc --noEmit` in `apps/tedris` exit 0; `biome check` on the touched files "No fixes
applied" (3 warnings, the existing unused suppressions in `session-page.tsx`); `node
tools/ci/biome-ratchet.mjs` errors 0, warnings 70, infos 21, at the baselines.

### In a browser

Against a stack of this worktree (Postgres 17 in Docker, tedrisat from `dist`, tedris on `next build` +
`next start` on port 4010, tedrisat on 4011, the dev Keycloak realm `amel-tech-dev`, Bunny's dev library
id 769667 with placeholder keys, every Bunny request blocked), at the end of round 2:

| Spec | Result |
| --- | --- |
| `lesson-notes.e2e.ts` (15; new in this work: the tab at 1440x900, 1440x700 and 390x844, the player first, as wide as both columns or the phone, 16:9, whole under the 64 px top bar, the notes under it, nothing wider than the screen; and the tab row held across a switch on a course whose card is taller than its header) | 15 passed (the MDRS-265 expected failure counts as passed) |
| `lesson-questions.e2e.ts` | 7 passed |
| `course.e2e.ts`, `session.e2e.ts`, `celse-states.e2e.ts` | 9, 11 and 7 passed, with a throwaway change (not committed): their own `signIn` uses the Keycloak form, which the `tedris-dev` client accepts only on port 4000, so for the run each delegated to the shared `signIn` of `e2e/sign-in.ts` (the minted session off port 4000) and `E2E_API_URL` pointed at 4011 |

`lesson-notes.e2e.ts` changed with the markup: the YouTube help is checked as the time field's
accessible description, the Bunny test reads the new optional line, the recordings-tab test also checks
that the playing row is named and `aria-current`, and the live-stream test's name says "under".

The browser's tab-row test was not run against round 1, where nothing moved. Before the scroll hold was
added, a throwaway probe on the round-2 layout measured the row going from 405 to 597 px on the switch
(and back), on the course whose card is 412 px tall beside a 220 px header; with the hold it stays at
405.

The screenshots (before on `origin/main`, after round 1 and after round 2, same seed) are kept outside the
repository for the review.

## Not verified

- **Bunny playback.** The Bunny frame was served a local placeholder page (every request to Bunny's hosts
  was answered or aborted by the test); only the layout around it was judged.
- **A real phone.** 390x844 is Chromium's viewport, not a device: no touch, no mobile Safari.
- **Other browsers.** The note grows with the text through CSS `field-sizing`, looked at in Chromium
  only; a browser without it keeps two lines and the drag handle.
- Dark theme and the Arabic (right-to-left) page were not screenshotted.

## Found, not changed here

- `course.e2e.ts`, `session.e2e.ts` and `celse-states.e2e.ts` sign in only through the Keycloak form, so
  they cannot run on any port but 4000; `lesson-notes.e2e.ts` and `lesson-questions.e2e.ts` use the
  shared `signIn`, which can.
- At 768 px the page is 5 to 6 px wider than the window on most pages (`scrollWidth` 773 or 774), on
  main as on this branch; the cause was not looked into.
