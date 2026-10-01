# Contrast

Generated from `tokens/*.css` by `tools/design-system/verify-contrast.mjs --write` in the Medaris repository; do not edit it by hand. WCAG 2.x relative luminance; ratios are truncated to two decimals, never rounded up. A translucent colour is composited over its ground. "Day" is the default `:root`; "night" is `[data-theme="dark"]`, which is identical to the `prefers-color-scheme: dark` block.

## Summary

| category | threshold | pairs × themes | min day | min night |
| -- | --: | --: | --: | --: |
| Neutral text on every ground | 4.5:1 | 24 × 2 | 5.47 | 4.63 |
| Tone text on every ground | 4.5:1 | 36 × 2 | 5.90 | 7.07 |
| Text on tints | 4.5:1 | 18 × 2 | 6.68 | 7.38 |
| Text on bold fills | 4.5:1 | 8 × 2 | 6.01 | 5.97 |
| Control boundaries | 3:1 | 15 × 2 | 3.12 | 3.87 |
| Checked and on states | 3:1 | 6 × 2 | 3.89 | 4.61 |
| Focus indicator — ring against the ground | 3:1 | 7 × 2 | 5.38 | 7.07 |
| Focus indicator — against the component | 3:1 | 8 × 2 | 5.38 | 7.07 |
| Status marks | 3:1 | 36 × 2 | 4.70 | 5.51 |
| Covers | 4.5:1 | 4 × 2 | 8.69 | 8.69 |
| Text over media | 4.5:1 | 1 × 2 | 9.86 | 9.86 |
| Disabled text (policy) | 3:1 | 5 × 2 | 3.12 | 3.87 |

**Every required pair passes in both themes** (336 checks). 42 colour roles (ceiling 42); 46 primitives, every one read; no primitive is re-pointed by the night theme; every tone has its four tokens.

## Neutral text on every ground (≥ 4.5:1)

default, muted and subtle text — and links — on every ground text can sit on: page, surface, sunken, field, hover and the current-row tint.

| pair | day fg / bg | day | night fg / bg | night |
| -- | -- | --: | -- | --: |
| `text-neutral-default` on `background-neutral-page` | #181D26 / #F9F6EF | 15.65 | #EAE4D8 / #11151D | 14.43 |
| `text-neutral-default` on `background-neutral-surface` | #181D26 / #FEFDF9 | 16.60 | #EAE4D8 / #181D26 | 13.34 |
| `text-neutral-default` on `background-neutral-sunken` | #181D26 / #F2EDE3 | 14.48 | #EAE4D8 / #0B0E14 | 15.25 |
| `text-neutral-default` on `background-neutral-field` | #181D26 / #FEFDF9 | 16.60 | #EAE4D8 / #11151D | 14.43 |
| `text-neutral-default` on `background-neutral-hover` | #181D26 / #EAE4D8 | 13.34 | #EAE4D8 / #20252F | 12.13 |
| `text-neutral-default` on `background-brand-subtle` | #181D26 / #EBEFFD | 14.72 | #EAE4D8 / #1B2037 | 12.67 |
| `text-neutral-muted` on `background-neutral-page` | #40454F / #F9F6EF | 8.91 | #CBC3B6 / #11151D | 10.46 |
| `text-neutral-muted` on `background-neutral-surface` | #40454F / #FEFDF9 | 9.45 | #CBC3B6 / #181D26 | 9.67 |
| `text-neutral-muted` on `background-neutral-sunken` | #40454F / #F2EDE3 | 8.24 | #CBC3B6 / #0B0E14 | 11.05 |
| `text-neutral-muted` on `background-neutral-field` | #40454F / #FEFDF9 | 9.45 | #CBC3B6 / #11151D | 10.46 |
| `text-neutral-muted` on `background-neutral-hover` | #40454F / #EAE4D8 | 7.60 | #CBC3B6 / #20252F | 8.79 |
| `text-neutral-muted` on `background-brand-subtle` | #40454F / #EBEFFD | 8.38 | #CBC3B6 / #1B2037 | 9.18 |
| `text-neutral-subtle` on `background-neutral-page` | #555A63 / #F9F6EF | 6.42 | #948C82 / #11151D | 5.51 |
| `text-neutral-subtle` on `background-neutral-surface` | #555A63 / #FEFDF9 | 6.81 | #948C82 / #181D26 | 5.09 |
| `text-neutral-subtle` on `background-neutral-sunken` | #555A63 / #F2EDE3 | 5.94 | #948C82 / #0B0E14 | 5.82 |
| `text-neutral-subtle` on `background-neutral-field` | #555A63 / #FEFDF9 | 6.81 | #948C82 / #11151D | 5.51 |
| `text-neutral-subtle` on `background-neutral-hover` | #555A63 / #EAE4D8 | 5.47 | #948C82 / #20252F | 4.63 |
| `text-neutral-subtle` on `background-brand-subtle` | #555A63 / #EBEFFD | 6.04 | #948C82 / #1B2037 | 4.84 |
| `text-brand-default` on `background-neutral-page` | #343D93 / #F9F6EF | 8.70 | #9EADEE / #11151D | 8.41 |
| `text-brand-default` on `background-neutral-surface` | #343D93 / #FEFDF9 | 9.23 | #9EADEE / #181D26 | 7.77 |
| `text-brand-default` on `background-neutral-sunken` | #343D93 / #F2EDE3 | 8.05 | #9EADEE / #0B0E14 | 8.89 |
| `text-brand-default` on `background-neutral-field` | #343D93 / #FEFDF9 | 9.23 | #9EADEE / #11151D | 8.41 |
| `text-brand-default` on `background-neutral-hover` | #343D93 / #EAE4D8 | 7.42 | #9EADEE / #20252F | 7.07 |
| `text-brand-default` on `background-brand-subtle` | #343D93 / #EBEFFD | 8.18 | #9EADEE / #1B2037 | 7.38 |

**Minimum:** day 5.47:1 · night 4.63:1

## Tone text on every ground (≥ 4.5:1)

a status word printed without its tint: an error under a field, a success figure in a table.

| pair | day fg / bg | day | night fg / bg | night |
| -- | -- | --: | -- | --: |
| `text-brand-default` on `background-neutral-page` | #343D93 / #F9F6EF | 8.70 | #9EADEE / #11151D | 8.41 |
| `text-brand-default` on `background-neutral-surface` | #343D93 / #FEFDF9 | 9.23 | #9EADEE / #181D26 | 7.77 |
| `text-brand-default` on `background-neutral-sunken` | #343D93 / #F2EDE3 | 8.05 | #9EADEE / #0B0E14 | 8.89 |
| `text-brand-default` on `background-neutral-field` | #343D93 / #FEFDF9 | 9.23 | #9EADEE / #11151D | 8.41 |
| `text-brand-default` on `background-neutral-hover` | #343D93 / #EAE4D8 | 7.42 | #9EADEE / #20252F | 7.07 |
| `text-brand-default` on `background-brand-subtle` | #343D93 / #EBEFFD | 8.18 | #9EADEE / #1B2037 | 7.38 |
| `text-success-default` on `background-neutral-page` | #1B6047 / #F9F6EF | 6.92 | #7ECAA9 / #11151D | 9.49 |
| `text-success-default` on `background-neutral-surface` | #1B6047 / #FEFDF9 | 7.34 | #7ECAA9 / #181D26 | 8.77 |
| `text-success-default` on `background-neutral-sunken` | #1B6047 / #F2EDE3 | 6.40 | #7ECAA9 / #0B0E14 | 10.03 |
| `text-success-default` on `background-neutral-field` | #1B6047 / #FEFDF9 | 7.34 | #7ECAA9 / #11151D | 9.49 |
| `text-success-default` on `background-neutral-hover` | #1B6047 / #EAE4D8 | 5.90 | #7ECAA9 / #20252F | 7.97 |
| `text-success-default` on `background-brand-subtle` | #1B6047 / #EBEFFD | 6.50 | #7ECAA9 / #1B2037 | 8.33 |
| `text-warning-default` on `background-neutral-page` | #6C411A / #F9F6EF | 8.07 | #E9B860 / #11151D | 10.00 |
| `text-warning-default` on `background-neutral-surface` | #6C411A / #FEFDF9 | 8.56 | #E9B860 / #181D26 | 9.24 |
| `text-warning-default` on `background-neutral-sunken` | #6C411A / #F2EDE3 | 7.47 | #E9B860 / #0B0E14 | 10.56 |
| `text-warning-default` on `background-neutral-field` | #6C411A / #FEFDF9 | 8.56 | #E9B860 / #11151D | 10.00 |
| `text-warning-default` on `background-neutral-hover` | #6C411A / #EAE4D8 | 6.88 | #E9B860 / #20252F | 8.40 |
| `text-warning-default` on `background-brand-subtle` | #6C411A / #EBEFFD | 7.59 | #E9B860 / #1B2037 | 8.78 |
| `text-error-default` on `background-neutral-page` | #972622 / #F9F6EF | 7.43 | #F09A92 / #11151D | 8.48 |
| `text-error-default` on `background-neutral-surface` | #972622 / #FEFDF9 | 7.88 | #F09A92 / #181D26 | 7.84 |
| `text-error-default` on `background-neutral-sunken` | #972622 / #F2EDE3 | 6.87 | #F09A92 / #0B0E14 | 8.96 |
| `text-error-default` on `background-neutral-field` | #972622 / #FEFDF9 | 7.88 | #F09A92 / #11151D | 8.48 |
| `text-error-default` on `background-neutral-hover` | #972622 / #EAE4D8 | 6.34 | #F09A92 / #20252F | 7.12 |
| `text-error-default` on `background-brand-subtle` | #972622 / #EBEFFD | 6.99 | #F09A92 / #1B2037 | 7.44 |
| `text-info-default` on `background-neutral-page` | #343D93 / #F9F6EF | 8.70 | #9EADEE / #11151D | 8.41 |
| `text-info-default` on `background-neutral-surface` | #343D93 / #FEFDF9 | 9.23 | #9EADEE / #181D26 | 7.77 |
| `text-info-default` on `background-neutral-sunken` | #343D93 / #F2EDE3 | 8.05 | #9EADEE / #0B0E14 | 8.89 |
| `text-info-default` on `background-neutral-field` | #343D93 / #FEFDF9 | 9.23 | #9EADEE / #11151D | 8.41 |
| `text-info-default` on `background-neutral-hover` | #343D93 / #EAE4D8 | 7.42 | #9EADEE / #20252F | 7.07 |
| `text-info-default` on `background-brand-subtle` | #343D93 / #EBEFFD | 8.18 | #9EADEE / #1B2037 | 7.38 |
| `text-live-default` on `background-neutral-page` | #972622 / #F9F6EF | 7.43 | #F09A92 / #11151D | 8.48 |
| `text-live-default` on `background-neutral-surface` | #972622 / #FEFDF9 | 7.88 | #F09A92 / #181D26 | 7.84 |
| `text-live-default` on `background-neutral-sunken` | #972622 / #F2EDE3 | 6.87 | #F09A92 / #0B0E14 | 8.96 |
| `text-live-default` on `background-neutral-field` | #972622 / #FEFDF9 | 7.88 | #F09A92 / #11151D | 8.48 |
| `text-live-default` on `background-neutral-hover` | #972622 / #EAE4D8 | 6.34 | #F09A92 / #20252F | 7.12 |
| `text-live-default` on `background-brand-subtle` | #972622 / #EBEFFD | 6.99 | #F09A92 / #1B2037 | 7.44 |

**Minimum:** day 5.90:1 · night 7.07:1

## Text on tints (≥ 4.5:1)

a badge or an alert: its tone text, and the neutral body text an alert carries.

| pair | day fg / bg | day | night fg / bg | night |
| -- | -- | --: | -- | --: |
| `text-brand-default` on `background-brand-subtle` | #343D93 / #EBEFFD | 8.18 | #9EADEE / #1B2037 | 7.38 |
| `text-neutral-default` on `background-brand-subtle` | #181D26 / #EBEFFD | 14.72 | #EAE4D8 / #1B2037 | 12.67 |
| `text-neutral-muted` on `background-brand-subtle` | #40454F / #EBEFFD | 8.38 | #CBC3B6 / #1B2037 | 9.18 |
| `text-success-default` on `background-success-subtle` | #1B6047 / #E6F6EE | 6.68 | #7ECAA9 / #0E261C | 8.30 |
| `text-neutral-default` on `background-success-subtle` | #181D26 / #E6F6EE | 15.11 | #EAE4D8 / #0E261C | 12.63 |
| `text-neutral-muted` on `background-success-subtle` | #40454F / #E6F6EE | 8.60 | #CBC3B6 / #0E261C | 9.15 |
| `text-warning-default` on `background-warning-subtle` | #6C411A / #FBF2DE | 7.82 | #E9B860 / #2F1F10 | 8.67 |
| `text-neutral-default` on `background-warning-subtle` | #181D26 / #FBF2DE | 15.17 | #EAE4D8 / #2F1F10 | 12.52 |
| `text-neutral-muted` on `background-warning-subtle` | #40454F / #FBF2DE | 8.64 | #CBC3B6 / #2F1F10 | 9.07 |
| `text-error-default` on `background-error-subtle` | #972622 / #FDEDEB | 7.06 | #F09A92 / #361A18 | 7.39 |
| `text-neutral-default` on `background-error-subtle` | #181D26 / #FDEDEB | 14.88 | #EAE4D8 / #361A18 | 12.58 |
| `text-neutral-muted` on `background-error-subtle` | #40454F / #FDEDEB | 8.47 | #CBC3B6 / #361A18 | 9.12 |
| `text-info-default` on `background-info-subtle` | #343D93 / #EBEFFD | 8.18 | #9EADEE / #1B2037 | 7.38 |
| `text-neutral-default` on `background-info-subtle` | #181D26 / #EBEFFD | 14.72 | #EAE4D8 / #1B2037 | 12.67 |
| `text-neutral-muted` on `background-info-subtle` | #40454F / #EBEFFD | 8.38 | #CBC3B6 / #1B2037 | 9.18 |
| `text-live-default` on `background-live-subtle` | #972622 / #FDEDEB | 7.06 | #F09A92 / #361A18 | 7.39 |
| `text-neutral-default` on `background-live-subtle` | #181D26 / #FDEDEB | 14.88 | #EAE4D8 / #361A18 | 12.58 |
| `text-neutral-muted` on `background-live-subtle` | #40454F / #FDEDEB | 8.47 | #CBC3B6 / #361A18 | 9.12 |

**Minimum:** day 6.68:1 · night 7.38:1

## Text on bold fills (≥ 4.5:1)

--text-neutral-on-bold on the action fill, its hover and every *-bold fill: the primary button, the count, the current medallion, the destructive hover.

| pair | day fg / bg | day | night fg / bg | night |
| -- | -- | --: | -- | --: |
| `text-neutral-on-bold` on `background-action-bold` | #FEFDF9 / #181D26 | 16.60 | #11151D / #EAE4D8 | 14.43 |
| `text-neutral-on-bold` on `background-action-bold-hover` | #FEFDF9 / #2B313B | 12.85 | #11151D / #F9F6EF | 16.93 |
| `text-neutral-on-bold` on `background-brand-bold` | #FEFDF9 / #343D93 | 9.23 | #11151D / #9EADEE | 8.41 |
| `text-neutral-on-bold` on `background-success-bold` | #FEFDF9 / #1B6047 | 7.34 | #11151D / #7ECAA9 | 9.49 |
| `text-neutral-on-bold` on `background-warning-bold` | #FEFDF9 / #86531F | 6.30 | #11151D / #E9B860 | 10.00 |
| `text-neutral-on-bold` on `background-error-bold` | #FEFDF9 / #972622 | 7.88 | #11151D / #F09A92 | 8.48 |
| `text-neutral-on-bold` on `background-info-bold` | #FEFDF9 / #343D93 | 9.23 | #11151D / #9EADEE | 8.41 |
| `text-neutral-on-bold` on `background-live-bold` | #FEFDF9 / #B3332E | 6.01 | #11151D / #E47168 | 5.97 |

**Minimum:** day 6.01:1 · night 5.97:1

## Control boundaries (≥ 3:1)

the edge that identifies a field, select, checkbox, radio or switch on every ground it can sit on; its hover edge; the invalid edge.

| pair | day fg / bg | day | night fg / bg | night |
| -- | -- | --: | -- | --: |
| `border-neutral-control` on `background-neutral-page` | #7C8088 / #F9F6EF | 3.67 | #7C8088 / #11151D | 4.61 |
| `border-neutral-strong` on `background-neutral-page` | #40454F / #F9F6EF | 8.91 | #AEA69B / #11151D | 7.59 |
| `border-error-default` on `background-neutral-page` | #B3332E / #F9F6EF | 5.67 | #E47168 / #11151D | 5.97 |
| `border-neutral-control` on `background-neutral-surface` | #7C8088 / #FEFDF9 | 3.89 | #7C8088 / #181D26 | 4.26 |
| `border-neutral-strong` on `background-neutral-surface` | #40454F / #FEFDF9 | 9.45 | #AEA69B / #181D26 | 7.02 |
| `border-error-default` on `background-neutral-surface` | #B3332E / #FEFDF9 | 6.01 | #E47168 / #181D26 | 5.52 |
| `border-neutral-control` on `background-neutral-sunken` | #7C8088 / #F2EDE3 | 3.39 | #7C8088 / #0B0E14 | 4.87 |
| `border-neutral-strong` on `background-neutral-sunken` | #40454F / #F2EDE3 | 8.24 | #AEA69B / #0B0E14 | 8.02 |
| `border-error-default` on `background-neutral-sunken` | #B3332E / #F2EDE3 | 5.24 | #E47168 / #0B0E14 | 6.31 |
| `border-neutral-control` on `background-neutral-field` | #7C8088 / #FEFDF9 | 3.89 | #7C8088 / #11151D | 4.61 |
| `border-neutral-strong` on `background-neutral-field` | #40454F / #FEFDF9 | 9.45 | #AEA69B / #11151D | 7.59 |
| `border-error-default` on `background-neutral-field` | #B3332E / #FEFDF9 | 6.01 | #E47168 / #11151D | 5.97 |
| `border-neutral-control` on `background-neutral-hover` | #7C8088 / #EAE4D8 | 3.12 | #7C8088 / #20252F | 3.87 |
| `border-neutral-strong` on `background-neutral-hover` | #40454F / #EAE4D8 | 7.60 | #AEA69B / #20252F | 6.38 |
| `border-error-default` on `background-neutral-hover` | #B3332E / #EAE4D8 | 4.83 | #E47168 / #20252F | 5.01 |

**Minimum:** day 3.12:1 · night 3.87:1

## Checked and on states (≥ 3:1)

a checked box, a selected radio and an on switch are the action fill against their ground; the check glyph against the fill; the off switch's knob (border-neutral-control) on its track.

| pair | day fg / bg | day | night fg / bg | night |
| -- | -- | --: | -- | --: |
| `background-action-bold` on `background-neutral-page` | #181D26 / #F9F6EF | 15.65 | #EAE4D8 / #11151D | 14.43 |
| `background-action-bold` on `background-neutral-surface` | #181D26 / #FEFDF9 | 16.60 | #EAE4D8 / #181D26 | 13.34 |
| `background-action-bold` on `background-neutral-field` | #181D26 / #FEFDF9 | 16.60 | #EAE4D8 / #11151D | 14.43 |
| `background-action-bold` on `background-neutral-hover` | #181D26 / #EAE4D8 | 13.34 | #EAE4D8 / #20252F | 12.13 |
| `text-neutral-on-bold` on `background-action-bold` | #FEFDF9 / #181D26 | 16.60 | #11151D / #EAE4D8 | 14.43 |
| `border-neutral-control` on `background-neutral-field` | #7C8088 / #FEFDF9 | 3.89 | #7C8088 / #11151D | 4.61 |

**Minimum:** day 3.89:1 · night 4.61:1

## Focus indicator — ring against the ground (≥ 3:1)

the outer 2px band in --ring-focus-color against every ground it can be drawn on, and against its own gap. The page under a modal's scrim is not a ground: no ring is drawn outside a modal layer (a focused dialog body draws its ring inside itself), and check.mjs fails a ring that escapes its modal.

| pair | day fg / bg | day | night fg / bg | night |
| -- | -- | --: | -- | --: |
| `ring-focus-color` on `background-neutral-page` | #4551B3 / #F9F6EF | 6.31 | #9EADEE / #11151D | 8.41 |
| `ring-focus-color` on `background-neutral-surface` | #4551B3 / #FEFDF9 | 6.69 | #9EADEE / #181D26 | 7.77 |
| `ring-focus-color` on `background-neutral-sunken` | #4551B3 / #F2EDE3 | 5.84 | #9EADEE / #0B0E14 | 8.89 |
| `ring-focus-color` on `background-neutral-field` | #4551B3 / #FEFDF9 | 6.69 | #9EADEE / #11151D | 8.41 |
| `ring-focus-color` on `background-neutral-hover` | #4551B3 / #EAE4D8 | 5.38 | #9EADEE / #20252F | 7.07 |
| `ring-focus-color` on `background-brand-subtle` | #4551B3 / #EBEFFD | 5.93 | #9EADEE / #1B2037 | 7.38 |
| `ring-focus-color` on `ring-focus-gap` | #4551B3 / #FEFDF9 | 6.69 | #9EADEE / #11151D | 8.41 |

**Minimum:** day 5.38:1 · night 7.07:1

## Focus indicator — against the component (≥ 3:1)

the inner band (--ring-focus-gap) or, where the gap matches the component, the ring itself, against every fill a focusable control can have. The better of the two is shown; the other is in brackets.

| pair | day fg / bg | day | night fg / bg | night |
| -- | -- | --: | -- | --: |
| `ring-focus-gap` / `ring-focus-color` on `background-neutral-surface` | #FEFDF9·#4551B3 / #FEFDF9 | ring 6.69 (1.00) | #11151D·#9EADEE / #181D26 | ring 7.77 (1.08) |
| `ring-focus-gap` / `ring-focus-color` on `background-neutral-sunken` | #FEFDF9·#4551B3 / #F2EDE3 | ring 5.84 (1.14) | #11151D·#9EADEE / #0B0E14 | ring 8.89 (1.05) |
| `ring-focus-gap` / `ring-focus-color` on `background-neutral-field` | #FEFDF9·#4551B3 / #FEFDF9 | ring 6.69 (1.00) | #11151D·#9EADEE / #11151D | ring 8.41 (1.00) |
| `ring-focus-gap` / `ring-focus-color` on `background-neutral-hover` | #FEFDF9·#4551B3 / #EAE4D8 | ring 5.38 (1.24) | #11151D·#9EADEE / #20252F | ring 7.07 (1.18) |
| `ring-focus-gap` / `ring-focus-color` on `background-action-bold` | #FEFDF9·#4551B3 / #181D26 | gap 16.60 (2.47) | #11151D·#9EADEE / #EAE4D8 | gap 14.43 (1.71) |
| `ring-focus-gap` / `ring-focus-color` on `background-action-bold-hover` | #FEFDF9·#4551B3 / #2B313B | gap 12.85 (1.91) | #11151D·#9EADEE / #F9F6EF | gap 16.93 (2.01) |
| `ring-focus-gap` / `ring-focus-color` on `background-error-subtle` | #FEFDF9·#4551B3 / #FDEDEB | ring 6.00 (1.11) | #11151D·#9EADEE / #361A18 | ring 7.33 (1.14) |
| `ring-focus-gap` / `ring-focus-color` on `background-error-bold` | #FEFDF9·#4551B3 / #972622 | gap 7.88 (1.17) | #11151D·#9EADEE / #F09A92 | gap 8.48 (1.00) |

**Minimum:** day 5.38:1 · night 7.07:1

## Status marks (≥ 3:1)

3:1 marks: an alert or selected-choice edge, the live dot, the progress fill (on the sunken track), a bold fill as a shape.

| pair | day fg / bg | day | night fg / bg | night |
| -- | -- | --: | -- | --: |
| `border-brand-default` on `background-neutral-page` | #4551B3 / #F9F6EF | 6.31 | #7E8EE2 / #11151D | 5.96 |
| `background-brand-bold` on `background-neutral-page` | #343D93 / #F9F6EF | 8.70 | #9EADEE / #11151D | 8.41 |
| `border-brand-default` on `background-neutral-surface` | #4551B3 / #FEFDF9 | 6.69 | #7E8EE2 / #181D26 | 5.51 |
| `background-brand-bold` on `background-neutral-surface` | #343D93 / #FEFDF9 | 9.23 | #9EADEE / #181D26 | 7.77 |
| `border-brand-default` on `background-neutral-sunken` | #4551B3 / #F2EDE3 | 5.84 | #7E8EE2 / #0B0E14 | 6.30 |
| `background-brand-bold` on `background-neutral-sunken` | #343D93 / #F2EDE3 | 8.05 | #9EADEE / #0B0E14 | 8.89 |
| `border-success-default` on `background-neutral-page` | #277659 / #F9F6EF | 5.09 | #58AF8C / #11151D | 6.89 |
| `background-success-bold` on `background-neutral-page` | #1B6047 / #F9F6EF | 6.92 | #7ECAA9 / #11151D | 9.49 |
| `border-success-default` on `background-neutral-surface` | #277659 / #FEFDF9 | 5.39 | #58AF8C / #181D26 | 6.37 |
| `background-success-bold` on `background-neutral-surface` | #1B6047 / #FEFDF9 | 7.34 | #7ECAA9 / #181D26 | 8.77 |
| `border-success-default` on `background-neutral-sunken` | #277659 / #F2EDE3 | 4.70 | #58AF8C / #0B0E14 | 7.29 |
| `background-success-bold` on `background-neutral-sunken` | #1B6047 / #F2EDE3 | 6.40 | #7ECAA9 / #0B0E14 | 10.03 |
| `border-warning-default` on `background-neutral-page` | #86531F / #F9F6EF | 5.94 | #D89A3D / #11151D | 7.49 |
| `background-warning-bold` on `background-neutral-page` | #86531F / #F9F6EF | 5.94 | #E9B860 / #11151D | 10.00 |
| `border-warning-default` on `background-neutral-surface` | #86531F / #FEFDF9 | 6.30 | #D89A3D / #181D26 | 6.92 |
| `background-warning-bold` on `background-neutral-surface` | #86531F / #FEFDF9 | 6.30 | #E9B860 / #181D26 | 9.24 |
| `border-warning-default` on `background-neutral-sunken` | #86531F / #F2EDE3 | 5.50 | #D89A3D / #0B0E14 | 7.91 |
| `background-warning-bold` on `background-neutral-sunken` | #86531F / #F2EDE3 | 5.50 | #E9B860 / #0B0E14 | 10.56 |
| `border-error-default` on `background-neutral-page` | #B3332E / #F9F6EF | 5.67 | #E47168 / #11151D | 5.97 |
| `background-error-bold` on `background-neutral-page` | #972622 / #F9F6EF | 7.43 | #F09A92 / #11151D | 8.48 |
| `border-error-default` on `background-neutral-surface` | #B3332E / #FEFDF9 | 6.01 | #E47168 / #181D26 | 5.52 |
| `background-error-bold` on `background-neutral-surface` | #972622 / #FEFDF9 | 7.88 | #F09A92 / #181D26 | 7.84 |
| `border-error-default` on `background-neutral-sunken` | #B3332E / #F2EDE3 | 5.24 | #E47168 / #0B0E14 | 6.31 |
| `background-error-bold` on `background-neutral-sunken` | #972622 / #F2EDE3 | 6.87 | #F09A92 / #0B0E14 | 8.96 |
| `border-info-default` on `background-neutral-page` | #4551B3 / #F9F6EF | 6.31 | #7E8EE2 / #11151D | 5.96 |
| `background-info-bold` on `background-neutral-page` | #343D93 / #F9F6EF | 8.70 | #9EADEE / #11151D | 8.41 |
| `border-info-default` on `background-neutral-surface` | #4551B3 / #FEFDF9 | 6.69 | #7E8EE2 / #181D26 | 5.51 |
| `background-info-bold` on `background-neutral-surface` | #343D93 / #FEFDF9 | 9.23 | #9EADEE / #181D26 | 7.77 |
| `border-info-default` on `background-neutral-sunken` | #4551B3 / #F2EDE3 | 5.84 | #7E8EE2 / #0B0E14 | 6.30 |
| `background-info-bold` on `background-neutral-sunken` | #343D93 / #F2EDE3 | 8.05 | #9EADEE / #0B0E14 | 8.89 |
| `border-live-default` on `background-neutral-page` | #B3332E / #F9F6EF | 5.67 | #E47168 / #11151D | 5.97 |
| `background-live-bold` on `background-neutral-page` | #B3332E / #F9F6EF | 5.67 | #E47168 / #11151D | 5.97 |
| `border-live-default` on `background-neutral-surface` | #B3332E / #FEFDF9 | 6.01 | #E47168 / #181D26 | 5.52 |
| `background-live-bold` on `background-neutral-surface` | #B3332E / #FEFDF9 | 6.01 | #E47168 / #181D26 | 5.52 |
| `border-live-default` on `background-neutral-sunken` | #B3332E / #F2EDE3 | 5.24 | #E47168 / #0B0E14 | 6.31 |
| `background-live-bold` on `background-neutral-sunken` | #B3332E / #F2EDE3 | 5.24 | #E47168 / #0B0E14 | 6.31 |

**Minimum:** day 4.70:1 · night 5.51:1

## Covers (≥ 4.5:1)

the label printed on each bookcloth (theme-independent).

| pair | day fg / bg | day | night fg / bg | night |
| -- | -- | --: | -- | --: |
| `text-on-cover` on `cover-laciverd` | #F2EDE3 / #272E6E | 10.57 | #F2EDE3 / #272E6E | 10.57 |
| `text-on-cover` on `cover-bordo` | #F2EDE3 / #581B1A | 11.34 | #F2EDE3 / #581B1A | 11.34 |
| `text-on-cover` on `cover-zumrut` | #F2EDE3 / #164A37 | 8.69 | #F2EDE3 / #164A37 | 8.69 |
| `text-on-cover` on `cover-murekkep` | #F2EDE3 / #20252F | 13.16 | #F2EDE3 / #20252F | 13.16 |

**Minimum:** day 8.69:1 · night 8.69:1

## Text over media (≥ 4.5:1)

--text-on-cover on --gradient-scrim-media where text may start (70% down the ramp), over a pure white poster pixel, the worst an image can be (theme-independent).

| pair | day fg / bg | day | night fg / bg | night |
| -- | -- | --: | -- | --: |
| `text-on-cover` on `@scrim-at-text-start` | #F2EDE3 / #37393E | 9.86 | #F2EDE3 / #37393E | 9.86 |

**Minimum:** day 9.86:1 · night 9.86:1

## Disabled text (policy) (≥ 3:1)

--text-neutral-disabled on every ground a disabled control or its label can sit on. WCAG 1.4.3 exempts disabled text; the system holds it to 3:1 anyway, and a disabled control drops its tone instead of fading.

| pair | day fg / bg | day | night fg / bg | night |
| -- | -- | --: | -- | --: |
| `text-neutral-disabled` on `background-neutral-page` | #7C8088 / #F9F6EF | 3.67 | #7C8088 / #11151D | 4.61 |
| `text-neutral-disabled` on `background-neutral-surface` | #7C8088 / #FEFDF9 | 3.89 | #7C8088 / #181D26 | 4.26 |
| `text-neutral-disabled` on `background-neutral-sunken` | #7C8088 / #F2EDE3 | 3.39 | #7C8088 / #0B0E14 | 4.87 |
| `text-neutral-disabled` on `background-neutral-field` | #7C8088 / #FEFDF9 | 3.89 | #7C8088 / #11151D | 4.61 |
| `text-neutral-disabled` on `background-neutral-hover` | #7C8088 / #EAE4D8 | 3.12 | #7C8088 / #20252F | 3.87 |

**Minimum:** day 3.12:1 · night 3.87:1

## Not required — decorative or exempt

Shown so nobody mistakes them for a gap. A hairline never identifies a control on its own. The current-row tint is never the only signal (the "Sıradaki" marker and the medallion are). Platform dots and the rating star repeat printed words. The cover stamp is ornament. The logo is exempt: its arch sits on its own ground by day and by night, and the ground is the mark's edge.

| pair | day | night |
| -- | --: | --: |
| `border-neutral-subtle` on `background-neutral-page` | 1.32 | 1.39 |
| `border-neutral-subtle` on `background-neutral-surface` | 1.40 | 1.29 |
| `background-brand-subtle` on `background-neutral-surface` | 1.12 | 1.05 |
| `icon-platform-zoom` on `background-neutral-surface` | 4.00 | 4.14 |
| `icon-platform-google-meet` on `background-neutral-surface` | 3.83 | 4.32 |
| `icon-platform-jitsi` on `background-neutral-surface` | 3.32 | 5.00 |
| `icon-platform-unknown` on `background-neutral-surface` | 3.89 | 4.26 |
| `icon-rating` on `background-neutral-surface` | 3.32 | 5.00 |
| `stamp-on-cover` on `cover-laciverd` | 1.93 | 1.93 |
| `icon-logo-arch` on `icon-logo-ground` | 8.18 | 8.18 |
| `icon-logo-ground` on `background-neutral-page` | 8.70 | 1.94 |
