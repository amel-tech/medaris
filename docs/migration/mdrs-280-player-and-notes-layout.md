# MDRS-280 — The talebe's player and notes, laid out to be used while watching

The owner sent the course page's "Ders kayıtları" tab, as a signed-in enrolled talebe, and said "bu
ekran kullanışlı değil". It is the screen of MDRS-150 where a talebe watches a recording and takes private
notes; the session page has the same pair. This note says what changed on both, why, what was decided by
default, and how it was checked: in vitest, in Playwright against a running stack, and by looking at
real screenshots before and after. Only `apps/tedris` and `libs/i18n` change; the API, the privacy and
gating rules, the YouTube player hook (`youtube-player.ts`) and the Bunny frame attributes
(`media-player.tsx`) are as they were. Every number below was read off a command's output.

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
| the session page | the player at full width, but the notes 380 px further down, under the join card | the same |

Two causes are not visible in the code at a glance:

- **`max-lg:` loses on these pages.** tedris loads two Tailwind builds: `@medaris/ui/globals.css` (the
  shadcn kit, Tailwind's default breakpoints) in the root layout, and `@medaris/ui/medaris.css` (the
  design system, whose `libs/tokens/tailwind.css` sets `--breakpoint-*: initial` and declares only `md`,
  MDS-TOK-01, MDS-LAY-04) in the course and session layouts. Only the first generates
  `max-lg:grid-cols-1`; the second, loaded after it, declares `grid-cols-[minmax(0,1fr)_minmax(0,24rem)]`
  again later in the same `utilities` layer, and that later rule wins at every width. So on a phone the
  tab kept two columns: the notes column took its 24rem and the player got what was left (32 px at 390).
  Read in the built CSS of `next build`: `max-lg\:grid-cols-1` is in one of the two stylesheets, the
  arbitrary grid class in both. The container-query rules this change uses (`@container`,
  `@min-[64rem]:`, `@min-[30rem]:`) and `grid-cols-1` are in both, so they do not depend on that order.
- **The blank space above "Notlarım"** is `.mds-card__title { flex: 1 1 12ch }` inside a
  `.mds-card__header` turned into a column (`flex flex-col`): the 12ch basis became a height (144 px at
  the h3 size) and the heading's `items-center` put the text in its middle.

## What the owner will notice

1. **The video is the largest thing.** On the tab and on the session page the player takes the full
   width of the main column at 16:9 (742x417 at 1440, 722x406 at 1180, 356x200 at 390) and the notes
   come directly under it. On the session page the panel moved up from under the join card and the agenda
   to right under the recording (or the live stream, before its chat).
2. **The notes panel is compact.** "Notlarım" and "Yalnızca sen görürsün." are one line; a two-line note
   field ("Notunu yaz…") that grows with the text; under it one row: the time field, "Şimdiki an" when the
   player is YouTube's, and "Notu ekle" at the end. With no position to read (Bunny, Drive, others) the
   time field says `dk:sn` and one line under the row says "İsteğe bağlı: oynatıcıdaki süreyi yaz.". The
   Markdown hint shows only once the talebe writes, and the character count only from 3600 of 4000.
   Notes read as a timeline: the time (a button that moves the YouTube player, a label otherwise), the
   text, then two icon buttons (edit, delete) with tooltips. "Bu celse için henüz notun yok." stays the
   one-line empty state. The panel is 241 px tall with no notes (it was 561), 369 px with three (813).
3. **"Bütün ders kayıtları" appears only when there is something to choose**: more than one recording,
   or a lone one that does not play in the frame (it opens at its host, or is being prepared). It is a
   compact playlist in one card: each week's label on one line ("HAFTA 1 · Mâzî ve muzâri", or "HAFTA 2"
   alone when the week is titled "Hafta 2"); the whole row is the button that plays a recording; the one
   playing is tinted, has a filled play icon and "Oynatıcıda"; a row that opens at its host is one link
   ending in "Ders kaydını aç ↗"; a row being prepared is plain text with "Hazırlanıyor".
4. **On a phone** everything is one column: the player at full width, the notes under it, the playlist's
   chips under each title instead of squeezing it. Nothing is wider than the screen (the page's
   `scrollWidth` is 390 at 390 on every screen; the tab strip scrolls inside itself, as before).

## What changed

| Piece | Where |
| --- | --- |
| `PlayerWithNotes`: the player, then the notes, in one column; a second column (`minmax(0,1fr) minmax(0,22rem)`) only from a 64rem **container** (`@container` on the column, `@min-[64rem]:`), never a viewport breakpoint | `features/courses/components/player-with-notes.tsx` (new), used by `recordings-tab.tsx` and `session-page.tsx` |
| the compact panel, the time field, the growing note (`field-sizing: content`, two to ten lines), the timeline rows (narrow: time and actions on a row, text under; from a 30rem panel: three columns) | `features/courses/components/lesson-notes.tsx` |
| the playlist, its rows, the week label | `features/courses/components/recordings-tab.tsx` |
| `listsRecordings`, `isPlainWeekTitle` | `features/courses/recordings-model.ts` |
| `showsBodyCount` | `features/courses/lesson-note-model.ts` |
| the panel under the video it is about | `features/courses/components/session-page.tsx` |
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

## Decided by default, owner may overrule

1. **The notes go beside the player only in a column of 64rem or more.** No page has such a column today
   (the course and session pages' main column is at most 744 px beside the 344 px aside), so in practice
   the notes are always under the player. The side column would be 22rem.
2. **A lone recording that plays above is not listed again**; a lone one that only opens at its host or
   is still being prepared is (the list is then its only place).
3. **The time is taken when the talebe starts writing**, as MDRS-150 did, not shown ticking: with
   YouTube the field fills with the player's position on the first focus of the note, and "Şimdiki an"
   refreshes it; until then it shows `dk:sn`. A Bunny recording keeps the typed time (its position API is
   MDRS-264, not built here).
4. **The note's and the time's labels are not drawn** (the card's heading and the placeholders say
   what they are); they stay as accessible names.
5. **The count shows from 3600 characters** (the last tenth), as "3600/4000 karakter", after "Markdown
   yazabilirsin. ·".
6. **Edit and delete are icon buttons** (`IconButton`, the system's 24 px in-row size, with tooltips);
   the delete confirmation ("Silinsin mi? Sil Vazgeç") opens on a row under the note.
7. **A week title is "plain"** when, ignoring case, spaces and leading zeros, it is "Hafta N", "N. hafta",
   "N hafta", "Week N", "الأسبوع N" or empty. Then only the label "HAFTA N" is printed.
8. **"Bütün ders kayıtları"** keeps its h2 element but is drawn at the h3 size, and the playlist sits in
   one compact card instead of one card per week.
9. **During a live lesson** the order is the stream, the notes, then YouTube's chat.
10. **The playing row is still a button** (pressing it again changes nothing), named "Oynatıcıda:
    {title}" with `aria-current="true"`; each row's date and length are its description.

## Tests

Vitest, from `apps/tedris`, with `NODE_OPTIONS=--no-experimental-webstorage`:

- the whole suite: `Test Files 81 passed (81)`, `Tests 843 passed (843)`;
- the seven files this change touches or adds, on the branch: `Test Files 7 passed (7)`, `Tests 180
  passed (180)`;
- **red without the change**: the same seven files with the feature commit's nine source and locale
  files put back to `origin/main` and `player-with-notes.tsx` removed (then restored from `HEAD`):
  `Test Files 7 failed (7)`, `Tests 35 failed | 142 passed (177)`, and `player-with-notes.spec.ts` does
  not load ("Failed to resolve import ~/features/courses/components/player-with-notes").

| Criterion | Test | Red without the change |
| --- | --- | --- |
| player first, full width, notes under it; a second column only from a 64rem container; no viewport breakpoint | `player-with-notes.spec.ts` (3); `recordings-tab-notes.spec.ts` › comes under the player, in one column at the widths the course page has | yes (module missing; the old grid had no `grid-cols-1`) |
| on the session page, right under the video | `session-notes.spec.ts` › comes right under the recording, before the join card and the agenda; › comes right under the live stream, before its chat | yes, both |
| no blank space above the heading, header on one line | `lesson-notes.spec.ts` › names the panel and who reads it on one line, with no card header to stretch | yes |
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
`section[aria-labelledby^="week-"]`, and the manual time help by its new words. Each of them passes on
the old markup too, except the one about the help's words.

The feature and the test commits are separate, as asked: the feature commit alone fails seven existing
specs that the test commit moves to the new markup.

Other gates: `tsc --noEmit` in `apps/tedris` exit 0, 0 errors; the spec name-resolution check prints only
the known `vitest.config.ts` TS2307 line; `biome check` on the 14 touched files "No fixes applied" (3
warnings, the existing unused suppressions in `session-page.tsx`); `node tools/ci/biome-ratchet.mjs`
errors 0, warnings 70, infos 21, at the baselines.

### In a browser

Against a stack of this worktree (Postgres 17 in Docker, tedrisat from `dist`, tedris on `next build` +
`next start` on port 4010, tedrisat on 4011, the dev Keycloak realm `amel-tech-dev`, Bunny's dev library
id 769667 with placeholder keys, every Bunny request blocked):

| Spec | Result |
| --- | --- |
| `lesson-notes.e2e.ts` (13, two new: the tab at 1440x900 and at 390x844, player first, 16:9, full width, the panel under it, nothing wider than the screen) | 13 passed (the MDRS-265 expected failure counts as passed) |
| `lesson-questions.e2e.ts` | 7 passed |
| `course.e2e.ts`, `session.e2e.ts`, `celse-states.e2e.ts` | 9, 11 and 7 passed, with a throwaway change (not committed): their own `signIn` uses the Keycloak form, which the `tedris-dev` client accepts only on port 4000, so for the run each delegated to the shared `signIn` of `e2e/sign-in.ts` (the minted session off port 4000) and `E2E_API_URL` pointed at 4011 |

`lesson-notes.e2e.ts` changed with the markup: the YouTube help is checked as the time field's
accessible description, the Bunny test reads the new optional line, the recordings-tab test also checks
that the playing row is named and `aria-current`, and the live-stream test's name says "under".

The screenshots (before on `origin/main`, after on this branch, same seed, full page) are kept outside the
repository for the review; what they show is the table at the top and the list under "What the owner will
notice".

## Not verified

- **Bunny playback.** The Bunny frame was served a local placeholder page (every request to Bunny's hosts
  was answered or aborted by the test); only the layout around it was judged.
- **A real phone.** 390x844 is Chromium's viewport, not a device: no touch, no mobile Safari.
- **Other browsers.** The note grows with the text through CSS `field-sizing`, looked at in Chromium
  only; a browser without it keeps two lines and the drag handle.
- **The two-column mode** (a 64rem column) is reached by no page today; it was checked by its classes,
  not by eye.
- Dark theme and the Arabic (right-to-left) page were not screenshotted.

## Found, not changed here

- Other `lg:` and `max-lg:` classes in tedris depend on the same two-stylesheet order and on whether a
  page loads `medaris.css`: `max-lg:grid-cols-2` in `flashcards/components/decks-page.tsx`,
  `explore-decks-page.tsx` and `app/[locale]/decks/(medaris)/(liste)/loading.tsx`, `lg:grid-cols-[…]`
  in `account/components/account-settings.tsx`, `public-profile/components/public-profile-page.tsx` and
  `kosk-application/components/kosk-application-page.tsx`. Not checked here; the design system's own
  answer is `md:` or a container query.
- `course.e2e.ts`, `session.e2e.ts` and `celse-states.e2e.ts` sign in only through the Keycloak form, so
  they cannot run on any port but 4000; `lesson-notes.e2e.ts` and `lesson-questions.e2e.ts` use the
  shared `signIn`, which can.
