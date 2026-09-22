# Medaris Design System

The design language for Medaris — the online medrese platform: müderris and talebe,
dersler, ezber kartları, medrese.

Everything here is extracted from **`Online Medrese UI UX.fig`** (exported
2026-09-04), not invented. Where a value is a proposal rather than an extraction,
it says so on the line.

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
tokens/
  fonts.css             Cairo, IBM Plex Sans / Arabic / Mono
  colors.css            seven primitive ramps + white/black
  semantic.css          background / text / border / icon x seven tones
  typography.css        scale + ready-made .mds-h1 .. .mds-footnote
  spacing.css           4 → 64, plus the three breakpoints
  borders.css           radii 4 → full, widths 0.5 → 4
  elevation.css         shadow-2xs → 2xl, focus rings
  motion.css            NOT extracted — proposal, clearly marked
  base.css              element defaults
  a11y-overrides.css    NOT imported — the six contrast fixes
components/             .jsx + .d.ts + .prompt.md per component
foundations/            token cards
patterns/               the app shell and the ezber card
```

Prototypes link `styles.css` and use the `.mds-*` classes; React work imports the
components. They are the same CSS, so the two cannot drift.

## Three things to decide

These are open questions in the source file, not bugs in the extraction. They are
written up with measurements in the **Contrast audit** card.

1. **Focus is invisible.** The extracted ring is `#E5E5E5` — 1.26:1 against the
   page. `--ring-focus-brand` (sky-600, 4.10:1) is proposed beside it.
2. **Six semantic pairs fail AA**, warning text worst at 1.79:1.
   `tokens/a11y-overrides.css` fixes all six using values already on the ramps.
3. **Field boundaries barely exist.** `gray-300` on white is 1.47:1, and the white
   field on the `slate-50` page is 1.05:1. There is no token that fixes this — it is
   a design decision about how a field announces itself.

One more, smaller: the Figma components still render in **Geist**, because the kit
was imported before the brand type was chosen. The brand type *is* chosen — the
`typography` collection names Cairo and IBM Plex Sans — so this system sets IBM Plex
Sans and the Figma kit is the side that needs retyping.

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
- Set `dir="rtl"` on the Arabic element itself, never on a shared ancestor.
