Stand-in cover art for a course, köşk or medrese: one of four calm tones with the arc motif. Use it wherever a cover image would go until real art exists.

```jsx
<CoverPattern seed={course.id} label="Sarf" />
<CoverPattern seed={course.id} size="lg" />
<CoverPattern tone="green" size="sm" />
```

## Anatomy (HTML)

```html
<div class="mds-cover mds-cover--green">
  <p class="mds-eyebrow mds-cover__label" dir="auto">Sarf</p>
</div>
<div class="mds-cover mds-cover--sky mds-cover--sm"></div>
```

`md` (140) takes no size class; `.mds-cover--sm` is 84, `.mds-cover--lg` 220. The motif is the `::before` of `.mds-cover`, a CSS mask painted in the tone's ink at 18%, so there is no SVG and no id per instance. The tone is `tone` when given; otherwise `seed` hashed — FNV-1a 32-bit over the UTF-8 bytes of `seed` (offset basis 2166136261, prime 16777619, `Math.imul`, `>>> 0`), mod 4 into `sky, blue, green, slate`; neither gives `slate`. `coverTone(seed)`, exported beside the component, returns the same tone for any other surface that has to agree with the cover.

## States

None: a cover has no hover, focus or status. The label is optional.

## A11y contract

- Decorative: the motif is CSS and the root has no role. The label is real text, read in order; leave it out when the title next to the cover says the same.
- The label is in the tone's ink, measured on both stops with the motif composited under it: sky 6.12 · 5.38, blue 6.27 · 5.47, green 6.18 · 5.66, slate 11.18 · 10.00:1. `.mds-cover__label` overrides the eyebrow's grey, which fails on three of the tones.
- Forced colours drop the gradient and the motif; a hairline keeps the tile's extent.

## Rules

MDS-COL-07, MDS-SHAPE-01, MDS-SHAPE-04, MDS-TYPE-05, MDS-TYPE-07, MDS-TOK-01, MDS-COMP-01.

- One course, one tone, everywhere it appears: `seed={course.id}`, or the tone its manager chose. Never pick a tone per screen.
- No badge or status chip on a cover, and no status hue: the four tones carry none.
- In a card it goes in the `media` slot; on the course page it is `lg`.
- Never a flat grey box in its place.

## From #95

`pr95-migration/pr95-map.json#components.CoverPattern`
