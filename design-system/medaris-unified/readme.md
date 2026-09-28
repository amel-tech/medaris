# Medaris Design System

The design language for Medaris — the online medrese platform: müderris and talebe,
dersler, ezber kartları, medrese.

Everything here is extracted from **`Online Medrese UI UX.fig`** (exported
2026-09-04), not invented. Where a value is a proposal rather than an extraction,
it says so on the line. `rules.md` and `content/` are not in the Figma file at all:
they are written from the PRD, the owner's decisions, the launch brief and the #95
system.

## Where it came from

The Figma file has six pages. Two of them define this system:

- **Design System** — 4 token sections and 50 component frames, a shadcn-shaped UI
  kit retinted to the Medaris brand.
- The **variable collections** — `color` (primitives + a four-role semantic layer),
  `typography` (families, weights, sizes, spacing) and `size` (radii, border widths).
  These are the real source of truth; the styles panel holds three overlapping
  generations of the same tokens and only the newest one is carried forward here.

Wireframes, User Flow and Landing Page are drawn in Albert Sans and Poppins. Those
are wireframe faces, not brand faces, and nothing from them is in this system.

## The shape of it

**Brand is sky.** `sky-900` (`#0C4A6E`) fills every primary control; `sky-700` is
its hover; `sky-100` is the tint behind brand badges and avatars. Deep, quiet,
closer to ink than to a tech blue — right for a platform about reading.

**Type is Cairo over IBM Plex Sans.** Cairo carries headings (64 → 20) and has the
Arabic coverage the product needs; IBM Plex Sans carries body and the entire control
layer at 14px Medium. IBM Plex Sans Arabic is the Arabic companion, so an ayah and
its Turkish gloss sit on one optical baseline.

**Two neutrals, on purpose.** `slate` carries surfaces, `gray` carries text, borders
and icons. Never mix them inside one element.

**One semantic layer.** Product code names `--background-brand-primary`, never
`--sky-900`. The primitives exist so the semantic layer has something to point at.

## Files

```
styles.css              everything, in the right order
components.css          the .mds-* class layer
rules.md                every rule, with an id — the only place a rule is stated
tokens/
  fonts.css             Cairo, IBM Plex Sans / Arabic / Mono
  colors.css            seven primitive ramps + white/black
  semantic.css          background / text / border / icon x seven tones, plus proposed roles
  typography.css        scale, Arabic roles, .mds-h1 .. .mds-footnote, .mds-eyebrow, .mds-arabic(-text)
  spacing.css           4 → 64, breakpoints, spacing roles, density
  layout.css            NOT extracted — sidebar, pane, aside, content width, prose measure
  borders.css           radii 4 → full, widths 0.5 → 4
  elevation.css         shadow-2xs → 2xl, elevation roles, focus rings
  motion.css            NOT extracted — durations, easings, transitions
  domain.css            NOT extracted — live state, platform dots, rating, media scrim, covers
  base.css              element defaults, reduced motion, forced colours, bidi face
  a11y-overrides.css    NOT imported — the six contrast fixes
components/             .jsx + .d.ts + .prompt.md per component, and its card
foundations/            token cards
patterns/               the app shell and the ezber card
content/                vocabulary, status map, platforms, providers, time zones — data, not prose
```

Prototypes link `styles.css` and use the `.mds-*` classes; React work imports the
components. They are the same CSS, so the two cannot drift.

## Three things to decide

These are open questions in the source file, not bugs in the extraction. They are
written up with measurements in the **Contrast audit** card.

1. **Focus is invisible.** The extracted ring is `#E5E5E5` — 1.26:1 against
   white. `--ring-focus-brand` (sky-600, 4.10:1) is proposed beside it.
2. **Six semantic pairs fail AA**, warning text worst at 1.79:1.
   `tokens/a11y-overrides.css` fixes all six using values already on the ramps.
3. **Field boundaries barely exist.** `gray-300` on white is 1.47:1, and the white
   field on the `slate-50` page is 1.05:1. There is no token that fixes this — it is
   a design decision about how a field announces itself.

One more, smaller: the Figma components still render in **Geist**, because the kit
was imported before the brand type was chosen. The brand type *is* chosen — the
`typography` collection names Cairo and IBM Plex Sans — so this system sets IBM Plex
Sans and the Figma kit is the side that needs retyping.

Two more measured gaps, smaller, not covered by `a11y-overrides.css`:

- **Info text on its tint** is 4.24:1 (`--text-info-primary` is blue-600; the contrast
  card used to show 5.49:1, which was blue-700). Until it is decided (SPEC-D3-03),
  nothing puts body text on the info tint: a notice that only explains is a neutral
  one (MDS-VOICE-07).
- **The switch off state** is 1.23:1 — track against white, and the white knob
  against the track (SPEC-D3-21).

Decision 1 covers two rings: `--ring-focus` (#E5E5E5, 1.26:1) **and**
`--ring-focus-error` (#FECACA, 1.45:1), which a focused invalid field shows.
`a11y-overrides.css` re-points only the first. Decision 3 covers every control
boundary on gray-300 (1.47:1): fields, selects, checkboxes, radios.

`rules.md` cites the three decisions as OPEN-1, OPEN-2 and OPEN-3, and ends with a
table of every open decision the system cites and what it does until each is decided.

## Rules that are easy to get wrong

- Line height in Figma is 100% on every text style. Correct for a one-line heading,
  wrong the moment it wraps. `--lh-tight` keeps the extracted value; `--lh-snug` and
  `--lh-body` are proposals.
- 14px Medium is the whole control layer — buttons, inputs, table cells, nav, tabs.
  Reading text is 16. Nothing sits between them.
- Inputs are the only control on `--radius-xs` (6). Everything else is `--radius-s`
  (8), except mini controls at `--radius-xxs` (4).
- `initials()` upper-cases with `tr-TR`. Every name in this product is Turkish, and
  `i` must become `İ`.
- Set `lang="ar" dir="rtl"` and `.mds-arabic` (`.mds-arabic-text` for classical
  text) on the Arabic element itself, never on a shared ancestor (MDS-TYPE-04).

## One system, five surfaces

Tedris (talebe), Nizam (müderris and managers), Nazır (moderation and
administration), the Giriş theme and the landing page share this one system (the
landing page keeps its current palette until SPEC-D3-22 is decided). Put `lang` and
`data-app` on `<html>`: `<html lang="tr" data-app="tedris">`. What differs per app at
launch is chrome (the sidebar surface, SPEC-D3-04), density (Nizam's tables sit in a
`data-density="compact"` region, which tightens card insets, the stack gap, the page
gutter and table cells) and register (*sen* in Tedris, *siz* in Nizam) — never a
second brand colour. Rules: MDS-LAY-02, MDS-LAY-03, MDS-VOICE-01.

## The domain, briefly

Medrese (optional) → köşk → kurs → hafta → oturum. Only live lessons are authored for
now; each oturum has its own meeting link, which changes every week. Managers hide,
they do not delete. The words and states are data: `content/vocabulary.json`,
`content/status-map.json`, and beside them the meeting platforms, recording
providers and time zones. Rules: MDS-WORD-01, MDS-STAT-01, and the MDS-DOM and
MDS-VOICE sections of `rules.md`.
