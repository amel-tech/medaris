# Medaris — rules

Every rule has an id. Prompts, cards, reviews and (later) lint messages cite the id; nothing else
restates the rule. A rule says what to do; *Why*, *Check* and *Source* follow where they add
something, and a rule without a *Check* line is checked by review. "Manual" under *Check* means no
tool enforces it yet; the tools named there live in the Medaris repo under `tools/design-system/`.

"PRD" is `docs/PRD.md` in the Medaris repo. "Brief" is the launch design brief (MDRS-127, first
release 2026-09-30); its screen ids (A1–C13) are quoted as it wrote them. "#95" is the
madrasah-frontend design system, whose names this system retires. `OPEN-n` and `SPEC-D3-nn` are the
owner's open decisions: the table at the end says what the system does until each is decided.

Where a rule names a component, class or file the system does not have yet, the rule is the
contract for adding it (MDS-AGENT-03): add it that way, never a stand-in. The classes the rules and
`content/` already name are listed with the tokens they read under *Contracted, not built yet*.

## Tokens

### MDS-TOK-01 — Name the role, never the ramp
Rule: product code, components and pattern cards use semantic tokens. Primitives (`--sky-900`, `--gray-600`, `--brand-*`) appear only in `tokens/*.css`, in the `foundations/` cards that document them, and in `thumbnail.html`. Exception, pending SPEC-D3-02: the two asset colours of the Medaris mark in `.mds-logo__*` (gone if the mark is recoloured).
Why: the semantic layer is what a theme, a fix or dark mode can redefine.
Check: `var\(--(sky|gray|slate|blue|green|yellow|red|brand)-\d+\)` in `components.css`, `medrese.css` and `components/` = 0. Some pattern cards predate this rule and still name a gray step for a divider or a tint; move it to the matching role when you edit the card. `check-port.mjs` flags ramp names in ported files.
Source: canonical readme.

### MDS-TOK-02 — Declare once
Rule: every custom property is declared in exactly one `tokens/*.css` `:root`. A contextual re-declaration (the compact density region, the phone gutter, an Arabic-script region) is written before that `:root` block and wins by specificity, so the last declaration of every name is its default. `components.css` and `medrese.css` declare no custom properties. A component may set a data variable inline — a `--mds-*` property carrying a runtime value (`--mds-progress` on the component; `--mds-fixed-end` on `<html>`) — which the class layer reads with a fallback. Every token is read by a class or shown on a card.
Why: the generated manifest records the last declaration of a name, and the manifest is the vocabulary agents read.
Check: `--[\w-]+\s*:` in the class layers = 0; regenerate with `regen.mjs` and compare each manifest value with its `:root` value.
Source: this migration (the reduced-motion override made the manifest record every duration as 0ms).

### MDS-TOK-03 — Retired meanings
Rule: `--background`, `--foreground`, `--accent`, `--muted` and `--muted-foreground` are not tokens here (SPEC-D3-19). Every #95 token name is a retired meaning: port it by the map in the Medaris repo, `design-system/pr95-migration/pr95-map.json`. Twelve #95 names also exist here with a different value or role — `--white`, `--slate-500`, `--slate-600`, `--font-ui`, `--font-arabic`, `--font-mono`, `--tracking-normal`, `--lh-tight`, `--lh-snug`, `--lh-body`, `--lh-arabic`, `--transition-disclosure` — so a missed rename of one of them does not fail; it resolves silently to this system's value.
Why: each retired name means something else in #95, in `libs/ui` and here; `var(--muted)` used as text, as #95 does, measures 1.10:1 on white.
Check: `check-port.mjs` (warn), which lists the twelve first. Manual until it is enforced.
Source: #95 migration.

### MDS-TOK-04 — Domain suffixes are the API's values
Rule: a domain token's suffix is the API value, lower-cased: `--icon-platform-google-meet` for the platform id `google-meet`.
Why: an agent derives the token from the data without a table.

### MDS-TOK-05 — On the scale, or wrong
Rule: sizes, gaps and radii come from the scales (`--fs-*`, `--space-*`, `--radius-*`). Porting an off-scale value: take the nearest step; on a tie, type and spacing go to the larger step, radius to the smaller. 2, 6 and 12px are not steps: they appear only inside components, where the class layer draws them (the table-cell padding roles name the 12).
Check: `_adherence.oxlintrc.json` flags raw px in JSX; review.
Source: canonical `tokens/spacing.css`; #95 migration.

### MDS-TOK-06 — Proposal or extraction, on the line
Rule: a value not read from the Figma file says *proposed* on its line, or *NOT extracted* in its file's header.
Source: canonical readme.

## Colour

### MDS-COL-01 — One brand hue
Rule: `--background-brand-primary` (sky-900) fills the primary action and the active state; links are `--text-brand-primary`. No second brand, accent or create colour, in any app: creating something is the surface's one `primary` (MDS-COMP-03).
Why: calm and reading-first — "closer to ink than to a tech blue".
Check: review; no green `primary`.
Source: canonical; #95's Nizam create-green and Tedris accent are SPEC-D3-01.

### MDS-COL-02 — Slate for surfaces, gray for ink
Rule: slate carries surfaces; gray carries text, borders and icons; never both in one element.
Source: canonical readme.

### MDS-COL-03 — Colour never alone
Rule: a status has a label; a lesson type has an icon and a label; live-now has words and a dot; a rating star sits beside its number; a Stat's tone has a cue (an icon or a delta label); the current lesson has a text marker ("Sıradaki").
Source: WCAG 1.4.1.

### MDS-COL-04 — Two background tones
Rule: a screen uses the page (`--background-neutral-primary`) and white surfaces. A third tone needs a reason — a current row takes `--background-brand-subtle`, and never as its only signal.
Source: #95, adopted.

### MDS-COL-05 — A lesson type is not a status
Rule: lesson types are drawn neutral (icon + label) until a second type is authorable; states use the status tones. Live-now is a state (`Badge variant="live"`, "Şu an canlı"); "Canlı ders" is a type.
Why: only live lessons are authored at launch, so a type colour would paint every lesson the same, and red would read as an error.
Source: this migration.

### MDS-COL-06 — Platforms
Rule: a meeting platform shows as its name in neutral text with an 8px decorative dot (`--icon-platform-<id>`); a recording provider shows its name without a dot. Never a vendor colour behind text. This is the default of SPEC-D3-18.
Why: white on #95's Zoom and Meet fills measures 3.33:1 and 4.32:1.
Source: brief, this migration.

### MDS-COL-07 — Covers are the only decoration
Rule: `CoverPattern` is the only decorative colour, in four tones that carry no status: sky, blue, green, slate. One course, one tone — the tone chosen for it, or else the one its id hashes to (`seed`), everywhere it appears. No status chip on a cover.
Source: #95, re-toned.

### MDS-COL-08 — New pairs meet AA, and no default leans on an open decision
Rule: a new text pair reaches 4.5:1 and a new non-text pair 3:1 in the base system, without `a11y-overrides.css`. A pair that inherits an open decision (OPEN-1, OPEN-2, OPEN-3, SPEC-D3-03, SPEC-D3-21) says so, and a launch default never uses it: record the tone it would take as `target` + `inherits`, as `content/status-map.json` does.
Check: `verify-contrast.mjs`; `foundations/contrast-audit.card.html` lists the pairs the product renders.
Source: brief, canonical audit.

## Type

### MDS-TYPE-01 — Four families
Rule: Cairo for headings (`--font-display`), IBM Plex Sans for body and every control (`--font-ui`), IBM Plex Sans Arabic for Arabic (`--font-arabic`), IBM Plex Mono for code, IDs and meeting links (`--font-mono`). The classical-text face behind `--font-arabic-text` is SPEC-D3-06.
Check: `_adherence.oxlintrc.json` flags any other family.

### MDS-TYPE-02 — 14 for controls, 16 for reading
Rule: the whole control layer — buttons, inputs, table cells, nav, tabs — is 14 Medium; reading text is 16; nothing sits between.
Source: canonical readme.

### MDS-TYPE-03 — Titles
Rule: a page title is `.mds-h4` (Cairo 32/700) in every app; a card or dialog title is Cairo 20 semibold (`.mds-h6`, as `.mds-card__title` draws it). No `font-feature-settings`.

### MDS-TYPE-04 — Arabic
Rule: `lang="ar" dir="rtl"` on the Arabic element itself, never on a shared ancestor. `.mds-arabic` for UI and inline runs (one step above its context, never below 16, 1.9 leading); `.mds-arabic-text` for classical and Qur'anic text (24). An Arabic-script region re-points tracking to 0 and heading leading to `--lh-arabic`, so no class needs its own Arabic override. Ottoman in Arabic script is `lang="ota-Arab"`.
Why: harakat need the leading and the size; tracking breaks joining; IBM Plex Sans has no Arabic glyphs, so an unmarked run falls back to whatever face the device has.
Source: canonical; type measurements made for this migration.

### MDS-TYPE-05 — Turkish case
Rule: Turkish text is uppercased only through CSS under `lang="tr"`, and in code with `toLocaleUpperCase('tr-TR')` — `i` becomes `İ`; text in any other language carries its own `lang`. No hard-coded uppercase strings. Ottoman vocabulary written in Latin script (müderris, icâzet, mütalaa) is Turkish, `lang="tr"` — never `ota`, which switches off Turkish casing.
Check: `lang` on every `<html>`; grep for all-caps Turkish literals.

### MDS-TYPE-06 — Prose measure
Rule: running text is at most `--layout-measure-prose` wide, dialogs included.
Source: WCAG 1.4.8.

### MDS-TYPE-07 — Isolate what users and authors write
Rule: an author- or user-supplied string renders with `dir="auto"` on its block, or in `<bdi>` inside an inline or `·`-joined run. URLs, hosts, IDs and meeting links take `dir="ltr"`. An Arabic run inside Turkish copy is its own element with `lang="ar" dir="rtl" class="mds-arabic"`.
Why: the bidi algorithm reorders mixed runs; an unmarked Arabic run falls back to a system face.
Check: `check-port.mjs` flags Arabic-script characters outside a `lang="ar"` element.

## Layout

### MDS-LAY-01 — Gap, not margin
Rule: siblings are spaced with flex or grid `gap` on the scale; margins only in prose flow (a reading page).

### MDS-LAY-02 — Density is a region
Rule: `data-density="compact"` on a list or table region re-points the card inset, the stack gap, the page gutter and table cell padding (`tokens/spacing.css`). No per-app padding: an app is compact only where a region says so.

### MDS-LAY-03 — Root attributes
Rule: `<html lang="<active locale>" dir="<its direction>" data-app="tedris|nizam|nazir|landing|giris">`.
Check: `<html` in each app's root layout sets `lang` and `dir` from the active locale; the apps that do not yet are SPEC-D3-23.

### MDS-LAY-04 — Breakpoints and the phone
Rule: frames at 390, 768 and 1440 (`--bp-mobile`, `--bp-tablet`, `--bp-desktop`); `var()` does not work in a media query, so write the px there. A 390 layout is a real layout: below 768 the sidebar becomes the AppBar and its nav sheet; a table either scrolls or stacks (`responsive="stack"`), and its primary row action stays reachable.
Source: canonical; the PRD's 375/768/1024 is SPEC-D3-07.

### MDS-LAY-05 — Logical properties
Rule: `inline`/`block` properties only, shorthands included; directional icons mirror under `:dir(rtl)`.
Why: an Arabic UI locale is P1 in the PRD.
Check: grep the class layers for `left|right|margin-left|padding-right|text-align: left`, and for 4-value `padding`, `margin` or `inset` whose 2nd and 4th values differ.

## Shape and depth

### MDS-SHAPE-01 — Radii by role
Rule: inputs, nav items and tooltips `--radius-xs`; buttons, badges, platform chips, alerts and entity tiles `--radius-s`; mini controls, checkboxes and skeletons `--radius-xxs`; cards and dialogs `--radius-m`; large panels `--radius-l`; choice chips (`.mds-chip`), avatars, radios, switches and progress bars `--radius-full`.
Source: canonical `components.css`; entity tiles, dialogs and large panels are this migration's.

### MDS-SHAPE-02 — Hairlines, not lifts
Rule: a resting surface is a hairline plus at most `--elevation-resting`. Hover never lifts or scales. Only floating layers use `--elevation-overlay`, `--elevation-raised`, `--elevation-modal` or `--elevation-stage`.

### MDS-SHAPE-03 — A person is a circle
Rule: people are circles in every app; an institution or object (köşk, medrese, deste) is a square `entity` tile.

### MDS-SHAPE-04 — Things this system does not do
Rule: no coloured left-border accents, no decorative gradients (covers and the media scrim excepted), no glass or blur, no hover lifts, no emoji as icons, no mascots, no dark mode until it is defined (SPEC-D3-16).

## Motion

### MDS-MOT-01 — Functional motion only
Rule: state changes use `--transition-colors`, disclosure `--transition-disclosure`. Nothing enters, bounces or reveals on scroll. Reduced motion is handled once, globally, in `tokens/base.css`; a component adds no reduced-motion rule of its own.

## Accessibility

### MDS-A11Y-01 — Focus is always visible
Rule: every interactive element shows `box-shadow: var(--ring-focus)` on `:focus-visible` (`tokens/base.css` gives it to every element; a class that overrides it draws it again). `outline: none` never appears without it. The ring colours are OPEN-1.

### MDS-A11Y-02 — Native first
Rule: `<dialog>`, `<select>`, `<input type=checkbox|radio>`, `<table>`, `<nav>` with `<ol>`, `<time>`, `<details>`, `popover`. Where native falls short, the WAI-ARIA APG pattern is the spec.

### MDS-A11Y-03 — State from attributes
Rule: style `aria-current`, `aria-selected`, `aria-expanded`, `aria-invalid`, `aria-disabled`, `:checked`, `[open]`; the canonical `.is-*` classes remain as aliases. `aria-current` sits on the focusable element (the link), not its container.

### MDS-A11Y-04 — Everything has a name
Rule: icon-only controls take `label`; tables take `caption`; progress bars take `label`; tab sets take `label`; dialogs are labelled by their title; every `<nav>` on a page has a distinct `aria-label`.

### MDS-A11Y-05 — Targets
Rule: a hit area is at least 24×24 CSS px; a 16px checkbox lives inside a label at least 24px tall.
Source: WCAG 2.5.8.

### MDS-A11Y-06 — Open decisions stay open
Rule: OPEN-1 (focus rings), OPEN-2 (the six failing pairs), OPEN-3 (control boundaries) and the two gaps measured since (info text, SPEC-D3-03; switch off state, SPEC-D3-21) are the owner's. Do not fix them silently in either direction; name the gap where a design depends on it.

### MDS-A11Y-07 — Absent, not disabled
Rule: an action this viewer cannot take is not shown.
Source: brief.

### MDS-A11Y-08 — Forced colours
Rule: every state drawn with a background or a box-shadow alone (selected chip, switch, active nav item, current lesson, focus) has a `@media (forced-colors: active)` rule in system colours (`Highlight`, `CanvasText`).
Check: render with forced colours emulated (Chromium) and compare each state with its neighbour.
Source: PRD accessibility scope (high contrast).

### MDS-A11Y-09 — Nothing covers focus
Rule: a fixed layer (the toaster, a sticky enrol card) reports its height in `--mds-fixed-end` on `<html>` (a `ResizeObserver` calling `document.documentElement.style.setProperty`), which `tokens/base.css` turns into scroll padding. Set on the layer itself it reaches nothing.
Source: WCAG 2.4.11.

### MDS-A11Y-10 — Content on hover or focus
Rule: content that appears on hover or focus (a tooltip, a popover) is dismissible (Esc), hoverable (the pointer can move onto it) and persistent until dismissed or left. `title=` tooltips are not used.
Source: WCAG 1.4.13.

### MDS-A11Y-11 — Busy and disabled controls
Rule: a busy control is `aria-disabled="true"`, ignores click and keydown, and announces its state through a status region; a disabled link is `<a role="link" aria-disabled="true">` without `href`.

## Components

### MDS-COMP-01 — HTML is the contract
Rule: each component's `.prompt.md` gives its HTML anatomy; the `.jsx` is a thin wrapper; no inline style except a data variable (MDS-TOK-02).
Why: the system must survive a change of frontend framework.

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
Rule: a 24 grid, `currentColor` only, one weight; sm 16, md 20, lg 24 by context; a decorative icon is hidden from assistive technology; filled only as a state (a set star, a saved bookmark), never as decoration; a glyph outside `assets/icons.svg` is an error. The glyph source is SPEC-D3-05.

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
Rule: `content/vocabulary.json` is the list; SPEC-D3-20 decides whether it binds code strings. In design artifacts its `forbid` entries are errors; entries carrying `openDecision` are non-binding until decided; where it and the PRD disagree, the PRD wins. The ones most often wrong: a köşk is a subject lodge, not a school or a publisher; medrese is the institution; kurs holds the weeks, ders is what is taught, oturum is one dated live meeting and never a sign-in (that is *giriş*); "Canlı ders" is the live lesson type's only label (never "Canlı halka"), and "Şu an canlı" is its live-now state; the agenda is "Ders akışı"; a recording is a *ders kaydı*, and bare *kayıt* is enrolment or sign-up; *bağlantı* is qualified wherever two kinds can meet on one screen (toplantı bağlantısı, takvim bağlantısı, ders kaydı bağlantısı) and never means affiliation; a deck is a *deste* of *ezber kartları*; icâzet is a chain-authorised licence, never automatic; the product is Medaris.
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
Rule: every domain state takes its label, badge and icon from `content/status-map.json`. The identity family (primary, secondary, outline, ghost, destructive) says what a thing is, and `primary` also marks a thing's published state (course PUBLISHED); the progress family (brand, live, success, warning, info) says how it is going; secondary, outline and ghost may stand in a progress column as the neutral state. A row's `target` is the tone it takes once its `inherits` decision is made.

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

### MDS-AGENT-02 — Port by map
Rule: #95 screens move through `design-system/pr95-migration/` in the Medaris repo (map, copy map, README). A #95 name the map lacks is a bug in the map, never an alias. `check-port.mjs` flags what is left (warn only); until it is enforced the check is manual.

### MDS-AGENT-03 — Adding to the system
Rule: a token in the right `tokens/*.css`, declared once and marked proposed; classes in `components.css` or `medrese.css`; a component as `.jsx` + `.d.ts` + `.prompt.md` + a card; an icon in `assets/icons.svg`; then regenerate the `_ds_*` files with `regen.mjs`.

### MDS-AGENT-04 — Reading the manifest
Rule: trust a token's `name`, `value` and `definedIn`; do not trust its `kind`, a generator heuristic that labels many non-colour tokens `color` (`--space-inset-card`, `--elevation-modal`, `--transition-colors`) and some non-font tokens `font` (`--tracking-wide`). Take a token's category from `definedIn` and its name prefix.

## Contracted, not built yet

The rules above and `content/` name these classes; the Phase 1b class layer adds them. Until it
does, nothing draws them: port the tokens, literals and copy of a screen that needs one now, and the
element once it exists (MDS-AGENT-03). Each reads only tokens that exist today; the ratios are
measured by `verify-contrast.mjs`.

| class | draws | reads |
| -- | -- | -- |
| `.mds-badge--brand` | Badge `brand` ("Devam ediyor") | `--text-brand-primary` on `--background-brand-tertiary`, 8.24:1 |
| `.mds-badge--live` + `.mds-badge__dot` | Badge `live` with its dot ("Şu an canlı") | `--text-live-primary` on `--background-live-subtle`, 5.30:1; the dot is 8px, `currentColor`, `--radius-full`, `aria-hidden` |
| `.mds-alert--neutral` | the neutral Alert (MDS-VOICE-07) | `--text-neutral-primary` on `--background-neutral-secondary`, border `--border-neutral-primary`, 16.19:1; its icon `--icon-neutral-tertiary`, 6.90:1 |
| `.mds-nav--light` | the light sidebar: on the `<nav>` around the nav items | item `--text-neutral-tertiary` on white, 7.56:1; hover `--text-neutral-primary` on `--background-neutral-secondary`; active (`.is-active` or `aria-current="page"`) `--text-brand-primary` on `--background-brand-tertiary`, semibold, 8.24:1; section label `--text-neutral-tertiary`. Without it, the canonical nav colours measure 1.24:1 on white |
| `.mds-nav-item__count` | a count at a nav item's end | inverse: white on `--background-neutral-inverse-tertiary`, 10.35:1; current `--text-brand-primary` on white, 9.46:1. Light: `--text-brand-primary` on `--background-brand-tertiary`, 8.24:1; current white on `--background-brand-primary`, 9.46:1 |
| `.mds-platform-chip` + `__dot`, `--<platform id>` | a meeting platform (MDS-COL-06) | the name `--text-neutral-primary` on `--background-neutral-secondary`, 16.19:1, `--radius-s`; the 8px dot `--icon-platform-<id>`, or `--icon-neutral-disabled` for an unknown host |
| forced-colours rules for component states | MDS-A11Y-08 | today only focus has one (`tokens/base.css`) |

## Open decisions these rules cite

The owner decides these. Until then, the right-hand column is what the system does: build on it,
and name the decision where a design depends on it (MDS-A11Y-06). Decisions 1–3 in `readme.md` are
OPEN-1–3.

| id | the question | until it is decided |
| -- | -- | -- |
| OPEN-1 | Focus rings: `--ring-focus` (#E5E5E5) is 1.26:1 on white and `--ring-focus-error` (#FECACA) 1.45:1 | both as extracted in `styles.css`; `a11y-overrides.css`, which user-facing work adds (`SKILL.md`), re-points only `--ring-focus` |
| OPEN-2 | The six semantic pairs that fail AA, warning text worst at 1.79:1 | as extracted in `styles.css`; user-facing work adds `a11y-overrides.css` after `semantic.css` (`SKILL.md`); no default tone is `warning` or `destructive` |
| OPEN-3 | Control boundaries: gray-300 on white is 1.47:1 for fields, selects, checkboxes and radios | as extracted |
| SPEC-D3-01 | Does an app get its own colour (a create-green in Nizam, an accent in Tedris)? | one brand everywhere |
| SPEC-D3-02 | The Medaris mark: the live mark as it is, recoloured to sky-900/sky-100, or another | the live mark as it is |
| SPEC-D3-03 | Info text on its tint is 4.24:1 | no token change; nothing at launch puts text on the info tint |
| SPEC-D3-04 | The sidebar: inverse in both apps, light in both, or inverse in Nizam and light in Tedris | screens ported from #95 use the light sidebar; `patterns/app-shell.card.html` keeps its inverse one |
| SPEC-D3-05 | The icon glyphs: #95's hand-drawn set, #95's names on Phosphor, or Lucide | #95's names on Phosphor regular |
| SPEC-D3-06 | The classical and Qur'anic face behind `--font-arabic-text` (Scheherazade New, Amiri, Noto Naskh Arabic, the apps' Uthmanic face, or none) | the IBM Plex Sans Arabic stack |
| SPEC-D3-07 | Breakpoints: 390/768/1440 or the PRD's 375/768/1024 | 390/768/1440 |
| SPEC-D3-09 | İcâzet at launch: no control or claim, non-promising copy, or "katılım belgesi" | the Nizam course form keeps its icâzet control with copy that promises nothing; no public page claims icâzet |
| SPEC-D3-10 | Circumflex spelling of domain terms | as today: "icâzet" with its circumflex, the other terms without |
| SPEC-D3-11 | The container word: kurs / ders / oturum, or ders / ders / oturum as the PRD's glossary has it | kurs / ders / oturum, non-binding |
| SPEC-D3-12 | The nazır app's display name: "Nazır" or "Nazir" | no change until the app is built |
| SPEC-D3-16 | Dark mode | none |
| SPEC-D3-18 | What the brief's "branded" platform chips mean | a neutral chip: the name in neutral text beside an 8px dot on a ramp step |
| SPEC-D3-19 | Retire the five flat aliases (`--background` … `--muted-foreground`) | retired: `tokens/semantic.css` does not declare them |
| SPEC-D3-20 | Do the `content/` files bind code strings and override the PRD's vocabulary? | advisory: the PRD wins, `openDecision` entries are non-binding |
| SPEC-D3-21 | The switch off state is 1.23:1 (track on white, and the white knob on the track) | named only |
| SPEC-D3-22 | The landing page's own palette and faces | the landing page keeps them; its new calls to action use Button `primary` |
| SPEC-D3-23 | When nizam, nazir and tedris set `<html lang>` from the active locale | the apps are unchanged; MDS-LAY-03 is the target |
