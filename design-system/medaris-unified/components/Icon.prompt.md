One glyph from the system's single icon source, `assets/icons.svg` — use it wherever an icon is needed instead of pasting an SVG or importing an icon library.

```jsx
<Icon name="calendar" size="sm" />
<Icon name="star" filled label="Kaydedilen kurs" />
<Button variant="ghost" iconLeft={<Icon name="arrowLeft" size="sm" />}>Derslere dön</Button>
```

## Anatomy (HTML)

```html
<!-- decorative, the default -->
<svg class="mds-icon mds-icon--sm" viewBox="0 0 256 256" aria-hidden="true" focusable="false"><path d="…"/></svg>
<!-- standalone, with label -->
<svg class="mds-icon" viewBox="0 0 256 256" role="img" aria-label="Kaydedilen kurs"><path d="…"/></svg>
<!-- a name that points along the reading direction -->
<svg class="mds-icon mds-icon--directional" viewBox="0 0 256 256" aria-hidden="true" focusable="false"><path d="…"/></svg>
<!-- a card or static page: the same class markup, the glyph by reference -->
<svg class="mds-icon" aria-hidden="true"><use href="../assets/icons.svg#calendar"/></svg>
```

`md` (20) takes no size class; `.mds-icon--sm` is 16, `.mds-icon--lg` 24. The names and the path table are generated from the sprite by `tools/design-system/icons.mjs`: `iconNames` lists them, and `name` accepts nothing else. A name that points along the reading direction is marked `data-directional` in the sprite (the left and right arrows and chevrons, `sidebar`, `signIn`, `signOut`, `undo`); it gets `.mds-icon--directional` and mirrors under `dir="rtl"`. `filled` draws the fill twin of `star`, `play` or `bookmark`; any other name ignores it.

## States

None of its own. The glyph fills with `currentColor`, so it takes the state colour of the text or control it sits in (hover, active, disabled, forced colours). `filled` is itself a state: a set star, a saved bookmark — never decoration. An unknown `name` renders nothing.

## A11y contract

- Without `label`: `aria-hidden="true"` and `focusable="false"`. This is almost every use — beside a text label, or inside a control that has its own name.
- With `label`: `role="img"` and `aria-label`. Only for an icon that carries meaning with no text beside it and is not inside a named control.
- An icon-only control is named by the control (`IconButton label`), never by the icon.
- A filled/unfilled pair that shows a state is announced by the control around it (`aria-pressed`), not by the glyph.

## Rules

MDS-ICON-01, MDS-COMP-06, MDS-COL-03, MDS-A11Y-04, MDS-LAY-05, MDS-AGENT-03.

- sm beside 14px text and in 24–36px controls; md in navigation and 42px controls; lg in empty states.
- A glyph a component fixes (a lesson type, a lock, a check, a chevron) is a CSS mask the class layer draws from the sprite, requested in `tools/design-system/icon-masks.json`; a component never renders `<Icon>` itself (MDS-COMP-06). The caller passes `<Icon>` into a slot.
- Social and sign-in provider logos are not in the registry.
- Adding a glyph: its Phosphor regular path data as a new `<symbol>` in `assets/icons.svg`, then run `icons.mjs`. Never a hand-drawn path.
- The glyph set is SPEC-D3-05: #95's names on Phosphor regular until it is decided.

## From #95

`pr95-migration/pr95-map.json#components.Icon`
