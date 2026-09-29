# Medaris — rules

Every rule has an id. Prompts, cards, reviews and the checks cite the id; nothing else restates the
rule. A rule says what to do; *Why*, *Check* and *Source* follow where they add something, and a
rule without a *Check* line is checked by review. The tools named under *Check* live in the Medaris
repo under `tools/design-system/`.

"PRD" is `docs/PRD.md` in the Medaris repo. "Brief" is the launch design brief (MDRS-127, first
release 2026-09-30); its screen ids (A1–C13) are quoted as it wrote them. `SPEC-D3-nn` is one of the
owner's open decisions: the table at the end says what the system does until each is decided. None
of them is about how the system looks.

A retired rule keeps its id and a one-line tombstone, so an old citation still leads somewhere. An
id is never reused.

Where a rule names a component, class or file the system does not have yet, the rule is the
contract for adding it (MDS-AGENT-03): add it that way, never a stand-in.

## Tokens

### MDS-TOK-01 — Name the role, never the ramp
Rule: product code, components and pattern cards use the semantic roles. The six ramps (`--kagit-*`, `--murekkep-*`, `--laciverd-*`, `--lal-*`, `--safran-*`, `--zumrut-*`) appear only in `tokens/*.css`, in the `foundations/` cards that show them, and in `thumbnail.html`. No hex and no `rgb()` outside `tokens/`, with one exception in the class layers: the cover's spine shadow (black or white at low alpha). A foundations card may paint a literal where it stands for media, not for the system (a white poster pixel under the media scrim).
Why: a theme or a fix re-points the roles. The night theme works only because nothing outside `tokens/` names a ramp.
Check: `check.mjs` fails a ramp step anywhere else (MDS-TOK-01); `_adherence.oxlintrc.json` flags a raw hex in JSX.

### MDS-TOK-02 — Declare once
Rule: every custom property is declared in exactly one `tokens/*.css` `:root`. A contextual re-declaration (the night theme, the compact density region, the phone, an Arabic-script region and a Latin island inside it) is written before that `:root` block, so the last declaration of every name is its default. `components.css` and `medrese.css` declare no custom properties, not even a local one. A component may set a data variable inline — a `--mds-*` property carrying a runtime value (`--mds-progress` on the component; `--mds-fixed-end` on `<html>`) — which the class layer reads with a fallback. Every token is read by a class or shown on a card.
Why: the generated manifest records the last declaration of a name, and the manifest is the vocabulary agents read.
Check: `check.mjs` fails a declaration in a class layer and a Latin-island value that differs from its `:root` default (MDS-TOK-02); `verify-contrast.mjs` fails a primitive nothing reads.

### MDS-TOK-03 — Names that are not tokens
Rule: a name `tokens/*.css` does not declare is not a token. That includes `--background`, `--foreground`, `--accent`, `--muted` and `--muted-foreground` (the shadcn names in `libs/ui`), and every name of the earlier Medaris systems: the sky, gray, slate, blue, green, yellow and red ramps, `--background-neutral-primary`, the icon colour roles (`--icon-neutral-primary` and the rest), `--shadow-*`, `--radius-s`. Some names kept their spelling but not their value: `--fs-h1` was 64px and is 30px, `--fs-h4` was 32px and is 18px. A page written for an earlier system still resolves them, silently, at the new value.
Why: a retired name resolves to nothing and a kept one to a different size; neither fails a build.
Check: `check.mjs` fails every `var()` that names no token (TOKEN). A kept name with a new value shows only in the render.

### MDS-TOK-04 — Domain suffixes are the API's values
Rule: a domain token's suffix is the API value, lower-cased: `--icon-platform-google-meet` for the platform id `google-meet`.
Why: an agent derives the token from the data without a table.

### MDS-TOK-05 — On the scale, or wrong
Rule: sizes, gaps, radii and control heights come from the scales and roles (`--fs-*`, `--space-*`, `--radius-*`, `--size-control-*`). `--space-N` is N × 4px, so the name follows from the pixel value. A value off the scale takes the nearest step; on a tie, type and spacing take the larger step, radius the smaller. In spacing, 2px and 6px are not steps: they appear only inside components, as hairline offsets and icon gaps.
Check: `_adherence.oxlintrc.json` flags raw px in JSX; review.

### MDS-TOK-06 — Retired
It asked for a provenance label on every value. The system is designed from scratch, and `readme.md` says what is proposed.

### MDS-TOK-07 — The colour grammar
Rule: a colour role is `--{property}-{tone}-{variant}`. The property is `background`, `text` or `border`; an icon takes `currentColor` or a text role. The tone is `neutral`, `action`, `brand`, `success`, `warning`, `error`, `info` or `live`. The focus ring has its own two, `--ring-focus-color` and `--ring-focus-gap`. The domain tokens (`tokens/domain.css`: platform dots, the logo, the rating star, covers) sit outside the grammar and read the same in both themes. Three things follow:
- any text or glyph on a `*-bold` fill is `--text-neutral-on-bold`, in every tone and both themes;
- a fill behind text is a `background-*` role; a 3:1 mark (a dot, a progress fill, an active underline, a selected edge) is a `border-*-default` role;
- "primary" is a component variant (Button, Badge), never a colour.
Why: an agent derives the role from the job, and every promise the grammar makes is proven in both themes.
Check: `verify-contrast.mjs` (every tone has its four tokens; the colour vocabulary stays under its ceiling, which rises only by decision).

## Colour

### MDS-COL-01 — Ink acts, lâciverd marks
Rule: the primary action is ink (`--background-action-bold`): an ink button by day, a paper button by night, never a brand fill. Every checked or on state takes the same fill. Lâciverd is the one accent: links, the current item, progress and the focus ring. No app gets a colour of its own, and there is no second accent or "create" colour: creating something is the surface's one `primary` (MDS-COMP-03).
Why: the page is a book. You act in ink; lâciverd shows where you are.
Check: review; no tone-coloured `primary`.

### MDS-COL-02 — Paper and ink
Rule: kâğıt (paper) carries the surfaces and the hairlines; mürekkep (ink) carries text, control edges and the action fill. The night theme swaps them: ink surfaces, paper text.

### MDS-COL-03 — Colour never alone
Rule: a status has a label; a lesson type has an icon and a label; live-now has words and a dot; an error has a glyph and words; a rating star sits beside its number; a Stat's tone has a cue (an icon or a delta label); the current lesson has a text marker ("Sıradaki").
Why: red ink marks both an error and a live session; the dot and the glyph keep them apart.
Source: WCAG 1.4.1.

### MDS-COL-04 — Page and surface
Rule: a screen uses the page (`--background-neutral-page`) and surfaces on it (`--background-neutral-surface`); wells (`--background-neutral-sunken`) and fields (`--background-neutral-field`) sit inside a surface. The third tone is `--background-brand-subtle` — the current row, the active nav item — and it is never the only signal.

### MDS-COL-05 — A lesson type is not a status
Rule: lesson types are drawn neutral (icon + label) until a second type is authorable; states use the status tones. Live-now is a state (`Badge variant="live"`, "Şu an canlı"); "Canlı ders" is a type.
Why: only live lessons are authored at launch, so a type colour would paint every lesson the same, and red would read as an error.

### MDS-COL-06 — Platforms
Rule: a meeting platform shows as its name in neutral text beside an 8px decorative dot. The dot is a domain token on a ramp step (`--icon-platform-<id>`; an unrecognised host takes `--icon-platform-unknown`). A recording provider shows its name without a dot. Never a vendor colour, and never a fill behind text.
Why: the printed name is what identifies the platform; a vendor fill would bring a second brand into the page.
Source: brief.

### MDS-COL-07 — Covers are bookcloth
Rule: `CoverPattern` is the only surface painted for decoration. A course is a bound book in one of four cloths — lâciverd, bordo, zümrüt, mürekkep — with a blind-stamped double frame and a şemse. The cloth carries no status and no chip, and it is the same by day and by night. One course, one cloth, everywhere it appears: the tone chosen for it, or else the one its id hashes to (`seed`: FNV-1a mod 4 gives laciverd, bordo, zumrut, murekkep in that order; with neither, murekkep). The label is the science's Arabic name (الصرف, النحو, المنطق …) or a short Latin word.

### MDS-COL-08 — Every pair is proven
Rule: a new text pair reaches 4.5:1 and a new non-text pair 3:1, by day and by night, and `verify-contrast.mjs` proves it: a new colour role, or a new ground that text can sit on, gets its line there first. There are no open contrast decisions: every pair the system promises passes in both themes (`contrast.md`). Disabled text is held to 3:1 by policy, although WCAG exempts it.
Check: `verify-contrast.mjs`, which also fails when `contrast.md` is stale; `check.mjs` measures every painted text node against its painted background, at rest and with every hoverable element hovered (CONTRAST).
Source: WCAG 2.2, 1.4.3 and 1.4.11.

### MDS-COL-09 — Night is a theme
Rule: the night theme re-points the semantic roles and nothing else. A page follows the system preference; `data-theme="dark"` or `data-theme="light"` on `<html>` forces one. Each forced theme is an `html[data-theme="…"]` rule (`tokens/theme.css`), the form a theme switcher lists and applies; `--theme` names the theme that is on. `data-theme="dark"` on an element below `<html>` makes a night island; a light island inside a night page is not supported. Covers and the domain tokens are the same in both themes. Every card, prototype and screen is looked at by day and by night.
Why: a 60-minute lesson at 21:00 is read on the night page.
Check: `verify-contrast.mjs` fails a night block that re-points a primitive, or whose two copies differ; `check.mjs` renders every page by day, dark by preference, dark by `data-theme`, as a night island, and light by `data-theme` on a dark system (THEME, RESOLVE, CONTRAST).

## Type

### MDS-TYPE-01 — Five families
Rule: one job each.

| token | face | job |
| -- | -- | -- |
| `--font-ui` | Instrument Sans | every control, table, nav, label and meta |
| `--font-reading` | Literata | reading text and every title |
| `--font-arabic` | Noto Naskh Arabic | classical Arabic text and the whole Arabic interface |
| `--font-quran` | Scheherazade New | the Qur'an, nothing else |
| `--font-mono` | Atkinson Hyperlegible Mono | meeting links, hosts and IDs |

Weights are 400, 500 and 600. Instrument Sans draws I and l almost alike, so an identifier is always mono. DİA transliteration (ḥ ṣ ṭ ẓ ʿ ʾ) is set in Literata. The Latin stacks list Naskh second, so an Arabic word under a Latin class (a title with only `dir="auto"`) is still Naskh, never a system face.
Check: `_adherence.oxlintrc.json` flags any other family in JSX; `check.mjs` fails DİA transliteration outside Literata, and any Arabic-script glyph painted in a system face (MDS-TYPE-01).
Source: the owner chose the two Arabic faces.

### MDS-TYPE-02 — 14 for controls, 16 for text, 18 for reading
Rule: the whole control layer — buttons, inputs, table cells, nav, tabs — is 14 (`--fs-body-sm`). Sans running text is 16 (`--fs-body`); Literata reading text is 18 (`--fs-reading`, `.mds-reading`). Meta, help, badges and table headers are 13 (`--fs-caption`), the smallest mixed-case size. 12 (`--fs-eyebrow`) is only for an uppercase running head. On a phone a text field or a select is 16 (a mini one excepted), so the page does not zoom when it takes focus. An Arabic-script region steps every size up (`tokens/typography.css`).

### MDS-TYPE-03 — Titles
Rule: a page title is `.mds-h1` (Literata 30/500), one per page, in every app. A section is `.mds-h2` (24/600). A card or dialog title is Literata 20/600 (`.mds-h3`, as `.mds-card__title` draws it). Lesson and week titles are Literata 16/600. No `font-feature-settings`; figures that must line up (tables, times, counts) take `.mds-num`.

### MDS-TYPE-04 — Arabic and the Qur'an
Rule: `lang="ar" dir="rtl"` goes on the Arabic element itself, never on a shared ancestor. Three classes, one job each:
- `.mds-arabic` — a run inside Latin text: 1.2em and never below 16px, no wrap, isolated. It carries harakat only inside reading text (`--lh-reading`); in UI text an inline Arabic word is written without them. A run longer than three words is a block.
- `.mds-arabic-text` — a classical block (matn): Naskh 26/2.0.
- `.mds-quran` — the Qur'an and nothing else: Scheherazade New 34/2.25, 28 on a phone. Each ayah's end mark is bound to the word before it with U+00A0. The harakat switch acts on the matn only, never on the Qur'an.

An Arabic-script region (`lang="ar"` on a page or a region) switches the interface to Naskh: larger sizes, Arabic leading, no tracking, one weight heavier. No class needs its own Arabic override. Ottoman in Arabic script is `lang="ota-Arab"`. A single clipped line that can hold Arabic uses `overflow: clip visible`, never `overflow: hidden`.
Why: the leading was measured, not guessed: the ink of Qur'an 96:1–5 reaches 1.27em above the baseline and 0.69em below it. At 1.25em an inline vocalised word touches the line above; at 1.2em it clears it. A vertical clip cuts the descent, and a final ي loses its dots. The Qur'an face is requested as one file with `font-display: block`, so a waqf sign never falls back to a system face and a verse never flashes in one.
Check: `check.mjs` fails a Qur'an glyph painted in a system font, Naskh text set below 1.7 leading, and an `.mds-arabic` inside a block that clips vertically (MDS-TYPE-04).
Source: the measurements are in `tokens/typography.css` and `tokens/fonts.css`.

### MDS-TYPE-05 — Turkish case
Rule: Turkish text is uppercased only through CSS under `lang="tr"`, and in code with `toLocaleUpperCase('tr-TR')` — `i` becomes `İ`; text in any other language carries its own `lang`. No hard-coded uppercase strings. Ottoman vocabulary written in Latin script (müderris, icâzet, mütalaa) is Turkish, `lang="tr"` — never `ota`, which switches off Turkish casing.
Check: `lang` on every `<html>`; grep for all-caps Turkish literals. `check.mjs` draws i ı İ I â î û in every face, size and weight the class layers use, under `lang="tr"` and `lang="en"`, and fails a dot or circumflex that fuses with its stem (MDS-TYPE-05).

### MDS-TYPE-06 — Prose measure
Rule: running text is at most `--layout-measure-prose` wide, dialogs included: 58ch, about 604px and about 70 characters a line in Literata 18, inside the 45–75 a reading page holds.
Source: WCAG 1.4.8.

### MDS-TYPE-07 — Isolate what users and authors write
Rule: an author- or user-supplied string renders with `dir="auto"` on its block, or in `<bdi>` inside an inline or `·`-joined run. URLs, hosts, IDs and meeting links take `dir="ltr"`. An Arabic run inside Turkish copy is its own element with `lang="ar" dir="rtl" class="mds-arabic"`.
Why: the bidi algorithm reorders mixed runs; an unmarked Arabic run falls back to a system face.
Check: `check.mjs` fails Arabic script outside a `lang="ar"` element, and a Latin island in an Arabic region that loses its Latin face or size (MDS-TYPE-07).

### MDS-TYPE-08 — Name the source
Rule: a matn, a şerh or a haşiye carries its source in a `.mds-source` line: "Author (ö. hicrî/milâdî) · *Work*, place", with the work in a `<cite>`. For example: "Esîrüddîn el-Ebherî (ö. 663/1265) · *İsâgûcî*, giriş".

## Layout

### MDS-LAY-01 — Gap, not margin
Rule: siblings are spaced with flex or grid `gap` on the scale; margins only in prose flow (a reading page).

### MDS-LAY-02 — Density is a region
Rule: `data-density="compact"` on a list, table or form region re-points the card inset, the stack gap, the table cell padding and the regular control height (`tokens/spacing.css`). No per-app padding: an app is compact only where a region says so. Nizam puts it on its main region; Tedris stays comfortable.

### MDS-LAY-03 — Root attributes
Rule: `<html lang="<active locale>" dir="<its direction>" data-app="tedris|nizam|nazir|landing|giris">`.
Check: `<html` in each app's root layout sets `lang` and `dir` from the active locale; the apps that do not yet are SPEC-D3-23. `check.mjs` fails a specimen without the three (MDS-LAY-03).

### MDS-LAY-04 — Breakpoints and the phone
Rule: frames at 390, 768 and 1440 (`--bp-mobile`, `--bp-tablet`, `--bp-desktop`); `var()` does not work in a media query, so write the px there. A 390 layout is a real layout: below 768 the sidebar becomes the AppBar and its nav sheet; a table either scrolls or stacks (`responsive="stack"`), and its primary row action stays reachable. Tedris reading pages are at most `--layout-content-max` wide; Nizam runs full width beside the sidebar.
Check: `check.mjs` fails a page or a frame that scrolls sideways (MDS-LAY-04).

### MDS-LAY-05 — Logical properties
Rule: `inline`/`block` properties only, shorthands included; directional icons mirror under `:dir(rtl)`.
Why: an Arabic UI locale is P1 in the PRD.
Check: `check.mjs` fails `left`, `right`, `margin-left`, `padding-right` and the like, and `text-align` or `float` with `left` or `right`, in the class layers (MDS-LAY-05). A 4-value `padding`, `margin` or `inset` whose 2nd and 4th values differ is found by review.

## Shape and depth

### MDS-SHAPE-01 — Radii by role
Rule: `--radius-mark` (2px) for a checkbox, a skeleton, a course cover and the mütalaa folio; `--radius-tag` (4px) for a badge, a platform chip, a tooltip, a link box, an entity tile and a mini control; `--radius-control` (6px) for a button, an input, a select, a textarea and a nav item; `--radius-surface` (10px) for a card, a dialog, a table frame, an alert, a toast, a week and the join card; `--radius-full` for people, radios, switches, progress bars, counts and choice chips. Nothing else is pill-shaped.
Why: books are nearly square.

### MDS-SHAPE-02 — Hairlines, not lifts
Rule: nothing at rest casts a shadow: a resting surface is a `--border-neutral-subtle` hairline. Hover never lifts or scales. Only floating layers lift: `--elevation-overlay` (menu, popover, tooltip), `--elevation-raised` (toast, sticky enrol card) and `--elevation-modal` (dialog, nav sheet). An elevation is never listed before `--ring-focus` in one `box-shadow`: the first shadow paints on top and would dim the ring.
Check: `check.mjs` fails an elevation composed before the ring (MDS-A11Y-01).

### MDS-SHAPE-03 — A person is a circle
Rule: people are circles in every app; an institution or object (köşk, medrese, deste) is a square `entity` tile.

### MDS-SHAPE-04 — Things this system does not do
Rule: ornament comes only from the book — the cetvel (a hairline frame), the nokta and the blind-stamped cover — and it never carries status. No gold, no gradient (the media scrim excepted), no arabesque, no tile pattern, no mosque silhouette as decoration. No coloured left-border accents, no glass or blur, no hover lifts, no emoji as icons, no mascots.

## Motion

### MDS-MOT-01 — Functional motion only
Rule: state changes use `--transition-colors`, disclosure `--transition-disclosure`. Nothing enters, bounces or reveals on scroll. Reduced motion is handled once, globally, in `tokens/base.css`; a component adds no reduced-motion rule of its own.

## Accessibility

### MDS-A11Y-01 — Focus is always visible
Rule: every `:focus-visible` draws `--ring-focus` with `outline: var(--ring-focus-outline)`: a 2px gap in paper (ink by night), then a 2px lâciverd ring. `tokens/base.css` gives it to every element; a component that draws the ring for a child (a row for its link, a chip for its hidden input) writes the same outline, offset and box-shadow. A state with its own box-shadow (an invalid field, a checked radio) composes the ring back in, after any inset. No outer shadow is listed before it. No ring is drawn outside a modal layer: a scrolling dialog body draws it inside itself. There is one ring for every state; an invalid field shows its state with its edge, not with a red ring.
Why: the ring is at least 3:1 against every ground and the gap at least 3:1 against every filled control, so it reads on ink, paper and red alike (`contrast.md`). The transparent outline is what forced-colours mode paints.
Check: `check.mjs` presses Tab through every page and every modal dialog, in three theme paths; every stop must paint the ring, and a ring inside a modal must stay inside it (MDS-A11Y-01).

### MDS-A11Y-02 — Native first
Rule: `<dialog>`, `<select>`, `<input type=checkbox|radio>`, `<table>`, `<nav>` with `<ol>`, `<time>`, `<details>`, `popover`. Where native falls short, the WAI-ARIA APG pattern is the spec.

### MDS-A11Y-03 — State from attributes
Rule: style `aria-current`, `aria-selected`, `aria-expanded`, `aria-invalid`, `aria-disabled`, `:checked`, `[open]`; the `.is-*` classes remain as aliases. `aria-current` sits on the focusable element (the link), not its container.

### MDS-A11Y-04 — Everything has a name
Rule: icon-only controls take `label`; tables take `caption`; progress bars take `label`; tab sets take `label`; dialogs are labelled by their title; every `<nav>` on a page has a distinct `aria-label`.

### MDS-A11Y-05 — Targets
Rule: a hit area is at least 24×24 CSS px; an 18px checkbox lives inside a label at least 24px tall.
Check: `check.mjs` fails a smaller target (MDS-A11Y-05).
Source: WCAG 2.5.8.

### MDS-A11Y-06 — AA by construction
Rule: the system passes WCAG 2.2 AA in both themes by construction. Every text role is at least 4.5:1 on every ground it can sit on, and every control edge, status mark and focus ring at least 3:1, by day and by night (`contrast.md`). Nothing about contrast is left open. Build on the roles as they are: do not re-point a role for one screen, and do not use a pair `verify-contrast.mjs` does not prove (MDS-COL-08).
Check: `verify-contrast.mjs`; `check.mjs`.

### MDS-A11Y-07 — Absent, not disabled
Rule: an action this viewer cannot take is not shown.
Source: brief.

### MDS-A11Y-08 — Forced colours
Rule: every state drawn with a background or a box-shadow alone (selected chip, switch, active nav item, current lesson, focus) has a `@media (forced-colors: active)` rule in system colours (`Highlight`, `CanvasText`).
Check: render with forced colours emulated (Chromium) and compare each state with its neighbour.
Source: PRD accessibility scope (high contrast).

### MDS-A11Y-09 — Nothing covers focus
Rule: a fixed layer reports its height on `<html>`: at the bottom (the toaster, a sticky enrol card) in `--mds-fixed-end`, at the top in `--mds-fixed-start`, set by a `ResizeObserver` calling `document.documentElement.style.setProperty`. `tokens/base.css` turns them into scroll padding. Set on the layer itself, the value reaches nothing.
Source: WCAG 2.4.11.

### MDS-A11Y-10 — Content on hover or focus
Rule: content that appears on hover or focus (a tooltip, a popover) is dismissible (Esc), hoverable (the pointer can move onto it) and persistent until dismissed or left. `title=` tooltips are not used.
Source: WCAG 1.4.13.

### MDS-A11Y-11 — Busy and disabled controls
Rule: a busy control is `aria-disabled="true"`, ignores click and keydown, and announces its state through a status region; it keeps its tone at full contrast. A disabled link is `<a role="link" aria-disabled="true">` without `href`. A disabled control drops its tone and never fades — no `opacity`: it becomes a `--background-neutral-sunken` well with a `--border-neutral-subtle` edge and `--text-neutral-disabled` ink, in every variant, destructive included; a ghost or link control keeps its transparent ground. A text field or a select keeps its `--border-neutral-control` edge, dashed, so it still reads as a field. A disabled chip that is selected keeps the hover fill and a doubled control edge, so it still reads as selected.
Check: `check.mjs` holds disabled text to 3:1 and fails a control under an `opacity` below 1.

## Components

### MDS-COMP-01 — HTML is the contract
Rule: each component's `.prompt.md` gives its HTML anatomy; the `.jsx` is a thin wrapper; no inline style except a data variable (MDS-TOK-02).
Why: the system must survive a change of frontend framework.
Check: `check.mjs` fails any other inline style in a specimen (MDS-COMP-01); a card may set a state inline to show it.

### MDS-COMP-02 — Types the linter can read
Rule: one component per `.d.ts`; its `<Name>Props` interface first; enumerations as inline string-literal unions; lowercase names for non-component exports (`iconNames`).
Why: the generator reads only the first interface, and takes every capitalised export for a component.

### MDS-COMP-03 — One primary per surface
Rule: creating something is the surface's one `primary`; a `destructive` Button is only "Kalıcı olarak sil".

### MDS-COMP-04 — Every state drawn
Rule: every interactive element has hover, focus, disabled and loading; every list has empty, loading and error.
Source: brief.

### MDS-COMP-05 — Confirmation footers
Rule: "Kalıcı olarak sil" — ghost "Vazgeç" + destructive, and the body names what is lost. A consequential but reversible or non-destructive action ("Yasakla", "Kurstan çıkar", "Oturumu iptal et", "Bağlantıyı yenile", "Gizle") — ghost "Vazgeç" + primary with the exact verb, the consequence in the body, initial focus on "Vazgeç".

### MDS-COMP-06 — A component file stands alone
Rule: a `.jsx` never references another component; it renders that component's class markup, and a caller passes components into slots.
Why: the bundle compiles each file in its own scope, so a cross-file reference throws at render.
Check: `smoke.mjs`.

### MDS-ICON-01 — The icon contract
Rule: Phosphor Regular, one weight, from `assets/icons.svg` only. A 24 grid in `currentColor`; 16, 20 or 24 by context. There are no icon colour roles in the grammar: an interface icon takes the text colour of its role. The domain tokens (`--icon-rating`, `--icon-platform-*`, `--icon-logo-ground`, `--icon-logo-arch`, MDS-TOK-07) colour a set star, a platform dot and the logo, and nothing else. A decorative icon is hidden from assistive technology. A glyph is filled only as a state (a set star, a saved bookmark), never as decoration. A glyph outside the sprite is an error.
Why: Regular's stroke (1px at 16) matches the text stem; Light turns grey at 16px and Bold outweighs Literata.
Check: `check.mjs` fails a `<use>` of a name the sprite lacks (MDS-ICON-01); `icons.mjs --check` fails when a generated copy (the `Icon` union, its path table, the CSS masks) differs from the sprite.

## Voice

### MDS-VOICE-01 — The reader decides the register
Rule: Tedris, Giriş and mail to talebe say *sen* ("Kaldığın yerden devam et"); Nizam, Nazır and the landing page say *siz* ("Müfredat ekleyin"); legal and disciplinary notices are formal and impersonal everywhere.

### MDS-VOICE-02 — Sentence case
Rule: everything the system writes is sentence case ("Ders oluştur", "Talebe ekle"); proper nouns and müderris-written titles keep their casing.

### MDS-VOICE-03 — Plain
Rule: no emoji, no exclamation marks; a number is stated, not celebrated. The greeting is "Selâmün aleyküm, {ad}".

### MDS-VOICE-04 — Empty, locked, error
Rule: empty is one sentence about what is missing plus at most one action this viewer can take. Locked says, visibly, why and what unlocks it — once per page, not once per row. An error says what happened and what to do, in two lines at most; "Bir hata oluştu" alone is not allowed.

### MDS-VOICE-05 — Sanctions
Rule: the person a sanction affects reads what changed ("Bu kursa erişimin kaldırıldı."), never "yasak". "Yasak" is management vocabulary.

### MDS-VOICE-06 — Real samples
Rule: sample content uses long, real Turkish names and course titles ("Süleymaniye Medresesi", "Nûruosmaniye Köşkü", "Müderris Abdülhamit Karaosmanoğlu"), with Arabic where natural; never "test" or lorem ipsum.
Source: brief.

### MDS-VOICE-07 — Which notice
Rule: a neutral Alert explains or restricts; an error Alert reports a failed action; a warning Alert asks this reader to act; success confirms. A notice is never alarming when nothing is wrong.

## Words

### MDS-WORD-01 — The vocabulary file
Rule: `content/vocabulary.json` is the list. It is advisory for code strings, and where it and the PRD disagree, the PRD wins. In design artifacts its `forbid` entries are errors; entries carrying `openDecision` are non-binding until decided. The ones most often wrong: a köşk is a subject lodge, not a school or a publisher; medrese is the institution; kurs holds the weeks, ders is what is taught, oturum is one dated live meeting and never a sign-in (that is *giriş*); "Canlı ders" is the live lesson type's only label (never "Canlı halka"), and "Şu an canlı" is its live-now state; the agenda is "Ders akışı"; a recording is a *ders kaydı*, and bare *kayıt* is enrolment or sign-up; *bağlantı* is qualified wherever two kinds can meet on one screen (toplantı bağlantısı, takvim bağlantısı, ders kaydı bağlantısı) and never means affiliation; a deck is a *deste* of *ezber kartları*; icâzet is a chain-authorised licence, never automatic; the product is Medaris.
Check: manual; a copy lint is a later issue.
Source: PRD §4.2, the owner's decisions, brief.

## Numbers and time

### MDS-NUM-01 — Intl, in the page's locale
Rule: format through `Intl` with the page's `lang` (tr-TR at launch): `%35`, `4,8`, `12.480`, `Cmt 21:00`, `3 Ekim 2026 Cumartesi`, "A, B ve C"; sort with `Intl.Collator`. Meta runs join with " · ". A session is counted in minutes, always "dk" ("60 dk"); a course in hours, "saat" ("22 saat"), shortened to "sa" only in dense rows. Times are shown in the viewer's zone, and in both zones when the course's differs: "21:00 İstanbul · 20:00 senin saatinle" in Tedris, "… sizin saatinizle" in Nizam.

## Domain

### MDS-DOM-01 — Live only, for now
Rule: only live lessons are authored; Nizam has no video, document or quiz editor. The other three types exist to be rendered.
Source: brief.

### MDS-DOM-02 — The link belongs to the oturum
Rule: one meeting link per oturum, changed weekly; no course-level link; calendar entries link to the session page, never to the meeting.
Why: a banned talebe must not reach the next session.
Source: brief.

### MDS-DOM-03 — Platform from the host
Rule: the platform is resolved from the link's hostname by `resolveMeetingPlatform` in `libs/utils` (described in `content/meeting-platforms.json`) — never by substring, never picked by hand. An unrecognised host is "Bilinmeyen platform", shown with its host. (Accepting only https links is a proposal for `libs/utils`, not what it does today.)
Why: a substring match lets any URL wear a platform's chip.

### MDS-DOM-04 — Joining
Rule: the talebe joins with the primary "Derse katıl"; the platform is a chip; the meeting URL stays behind "Bağlantıyı göster"; no copy button for the meeting link on the talebe side (the personal calendar link in the settings, B11, has one).

### MDS-DOM-05 — Public course, locked lessons
Rule: a course page is public: every week expands, and week titles, lesson titles and session dates are visible to everyone. Bodies, meeting links and recordings are locked for anyone not enrolled, and the page says why once. A recording belongs to an oturum and is not a video lesson; "Herkese açık" marks one that everyone may watch.
Source: brief, PRD M3-3.

## Status

### MDS-STAT-01 — The status map
Rule: every domain state takes its label, badge and icon from `content/status-map.json`. The identity family (primary, secondary, outline, ghost, destructive) says what a thing is, and `primary` also marks a thing's published state (course PUBLISHED, drawn as an inked tint); the progress family (brand, live, success, warning, info) says how it is going; secondary, outline and ghost may stand in a progress column as the neutral state. Every tone is available: each passes AA in both themes (`contrast.md`).

## Moderation

### MDS-MOD-01 — Hide, don't delete
Rule: managers "Gizle" (not destructive; reversible from "Arşiv" with "Geri al"); only the sistem yöneticisi sees "Kalıcı olarak sil", in a dialog that names what is lost.
Source: brief.

### MDS-MOD-02 — Bans
Rule: a ban and its removal carry a reason; widening reads "Köşkten de yasakla", "Medreseden de yasakla", "Platformdan yasakla". The device-restriction page uses the owner's sentence verbatim — "Bu bilgisayar erişim kısıtlamasına alınmıştır. Lütfen sistem yöneticisiyle görüşün." — and never reveals the device mark or the reason.
Source: brief.

## Working with the system

### MDS-AGENT-01 — Read before building
Rule: `readme.md`, this file, the component's `.prompt.md` and the `content/` files — before any UI.

### MDS-AGENT-02 — Retired
It pointed at a port map for the earlier madrasah-frontend screens; that map is gone, and every screen is designed fresh on this system.

### MDS-AGENT-03 — Adding to the system
Rule: a token in the right `tokens/*.css`, declared once, and a colour's pairs added to `verify-contrast.mjs`; classes in `components.css` or `medrese.css`; a component as `.jsx` + `.d.ts` + `.prompt.md` + a card, looked at by day and by night; an icon in `assets/icons.svg`, then `icons.mjs`; then regenerate the `_ds_*` files with `regen.mjs`. The full check in `tools/design-system/README.md` must pass.

### MDS-AGENT-04 — Reading the manifest
Rule: trust a token's `name`, `value` and `definedIn`; do not trust its `kind`, a generator heuristic. It labels every `--text-*` colour role `font` (`--text-neutral-default`, `--text-error-default` …), many non-colour tokens `color` (`--space-inset-card`, `--transition-colors`, `--ring-focus`) and `--tracking-*` `font`. Take a token's category from `definedIn` and its name prefix.

## Open decisions

The owner decides these. None is about how the system looks. Until each is decided, the right-hand
column is what the system does: build on it, and name the decision where a design depends on it.

| id | the question | until it is decided |
| -- | -- | -- |
| SPEC-D3-08 | Who holds the system: the claude.ai/design project, which the repo mirrors and contributes to through directories like this one, or the repo, from which the project is built | the claude.ai/design project holds it; this directory reaches it when the owner pulls it with design sync (the Medaris repo's `.claude/skills/medaris-design-system/SKILL.md`, §6) |
| SPEC-D3-09 | İcâzet at launch: no control or claim, copy that promises nothing, or "katılım belgesi" | the Nizam course form keeps its icâzet control with copy that promises nothing; no public page claims icâzet |
| SPEC-D3-11 | The container word: kurs / ders / oturum, or ders / ders / oturum as the PRD's glossary has it | kurs / ders / oturum, non-binding |
| SPEC-D3-22 | When the landing page moves onto this system | the landing page keeps its own palette and faces |
| SPEC-D3-23 | When nizam, nazir and tedris set `<html lang>` from the active locale (today nazir and nizam hard-code "en" and tedris hard-codes "tr") | the apps are unchanged; MDS-LAY-03 is the target |

The owner chose the two Arabic faces. Everything else about the look is this system's proposal
(`readme.md`), and `contrast.md` proves every colour pair in it. SPEC-D3-10, -12 and -20 are stated by
`content/vocabulary.json` and MDS-WORD-01.
