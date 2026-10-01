One glyph from the system's single icon source, `assets/icons.svg` (Phosphor Regular). Use it wherever an icon is needed, instead of pasting an SVG or importing an icon library.

```jsx
<Icon name="calendar" size="sm" />
<Icon name="star" filled label="Kaydedilen ders" />
<Button variant="ghost" iconLeft={<Icon name="arrowLeft" size="sm" />}>Derslere dön</Button>
```

## Anatomy (HTML)

```html
<!-- decorative, the default -->
<svg class="mds-icon mds-icon--sm" viewBox="0 0 256 256" aria-hidden="true" focusable="false"><path d="…"/></svg>
<!-- standalone, with label -->
<svg class="mds-icon" viewBox="0 0 256 256" role="img" aria-label="Kaydedilen ders"><path d="…"/></svg>
<!-- a name that points along the reading direction -->
<svg class="mds-icon mds-icon--directional" viewBox="0 0 256 256" aria-hidden="true" focusable="false"><path d="…"/></svg>
<!-- a card or static page: the same class markup, the glyph by reference -->
<svg class="mds-icon" aria-hidden="true"><use href="../assets/icons.svg#calendar"/></svg>
```

`md` (20) takes no size class; `.mds-icon--sm` is 16 and `.mds-icon--lg` is 24. The names and the path table are generated from the sprite by `tools/design-system/icons.mjs`: `iconNames` lists them, and `name` accepts nothing else. A name that points along the reading direction is marked `data-directional` in the sprite (the left and right arrows and chevrons, `sidebar`, `signIn`, `signOut`, `undo`). It gets `.mds-icon--directional` and mirrors under `dir="rtl"`. `filled` draws the fill twin of `star`, `play` or `bookmark`; any other name ignores it.

A `<use>` reference to the sprite renders over http, not from `file://`.

## States

None of its own. The glyph fills with `currentColor`, so it takes the colour of the text or control it sits in: hover, current, disabled and forced colours included. There are no icon colour roles in the grammar (MDS-ICON-01). Beside a label the icon is the label's role, or `--text-neutral-subtle` when it only decorates. The current nav item's glyph is `--text-brand-default`; an error's glyph is `--text-error-default`. Every text role is at least 4.5:1 on its ground, in both themes (`contrast.md`), which is more than the 3:1 a glyph needs. The domain tokens `--icon-rating` (a set star) and `--icon-platform-*` (the platform dot) are the only glyph colours of their own.

`filled` is itself a state: a set star, a saved bookmark. It is never decoration. An unknown `name` renders nothing.

## A11y contract

- Without `label`: `aria-hidden="true"` and `focusable="false"`. This is almost every use: beside a text label, or inside a control that has its own name.
- With `label`: `role="img"` and `aria-label`. Only for an icon that carries meaning with no text beside it and is not inside a named control.
- An icon-only control is named by the control (`IconButton label`), never by the icon.
- A filled/unfilled pair that shows a state is announced by the control around it (`aria-pressed`), not by the glyph.

## Rules

MDS-ICON-01, MDS-COMP-06, MDS-COL-03, MDS-A11Y-04, MDS-A11Y-08, MDS-LAY-05, MDS-AGENT-03, MDS-TOK-07.

- sm beside 14px text, in nav items and in 24–32px controls; md in 40–48px icon buttons; lg in empty states.
- One weight, Phosphor Regular. Its 1px stroke at 16px matches the text stem. Never mix in Light, Bold or Fill as decoration.
- A glyph a component fixes (a lesson type, a lock, a check, a chevron) is a CSS mask the class layer draws from the sprite, requested in `tools/design-system/icon-masks.json`. A component never renders `<Icon>` itself (MDS-COMP-06); the caller passes `<Icon>` into a slot.
- Social and sign-in provider logos are not in the registry.
- Adding a glyph: copy its Phosphor Regular path data from the installed `@phosphor-icons/react` package into a new `<symbol>` in `assets/icons.svg`, then run `icons.mjs`. Never draw a path by hand.
