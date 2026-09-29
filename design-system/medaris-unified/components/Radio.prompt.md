One native 18px radio inside its own label. A set of radios is a `RadioGroup`; use `Radio` alone only inside a fieldset you write yourself.

```jsx
<fieldset className="mds-choice-group">
  <legend className="mds-label">Ders kaydı kimlere açık</legend>
  <Radio name="kayit" value="kayitli" label="Yalnızca kayıtlı talebeler" defaultChecked />
  <Radio name="kayit" value="herkes" label="Herkese açık" description="Kursa kayıtlı olmayanlar da bu ders kaydını izleyebilir." />
</fieldset>
```

## Anatomy (HTML)

```html
<label class="mds-choice">
  <input type="radio" class="mds-radio" name="kayit" value="kayitli" checked aria-labelledby="r1-l">
  <span class="mds-choice__text">
    <span class="mds-choice__label" id="r1-l">Yalnızca kayıtlı talebeler</span>
  </span>
</label>
```

Native attributes go to the `<input>`; `className` goes to the `<label>`. `description` adds `<span class="mds-choice__desc" id="…">` and the matching `aria-describedby`. `icon` adds `<span class="mds-choice__icon" aria-hidden="true">` before the text: a glyph, or a `CoverPattern` swatch in the kapak rengi group. `bordered` adds `.mds-choice--bordered`.

## States

- **Unchecked:** a round `--background-neutral-field` disc with a `--border-neutral-control` edge. Hover, on the disc or its label: `--border-neutral-strong`.
- **Checked:** the action fill `--background-action-bold` (ink by day, paper by night) seen through a 4px inset ring of `--background-neutral-field`: that is the dot. Hover: `--background-action-bold-hover`. A bordered row's edge turns 2px lapis.
- **Focus:** unchecked, the ring from `tokens/base.css`. Checked, `:focus-visible` composes the inset ring and the focus ring: `inset 0 0 0 4px var(--background-neutral-field), var(--ring-focus)`.
- **Invalid:** `[aria-invalid="true"]`, unchecked: the edge is `--border-error-default`, doubled by a 1px inset; hover keeps it red. Focused, the ring is added outside the inset.
- **Disabled:** a sunken disc with a subtle edge; checked, the dot is `--text-neutral-disabled` inside a 4px sunken ring. The label and description turn `--text-neutral-disabled`. There is no opacity.
- **Forced colours:** checked is a `Highlight` disc, because shadows are not painted there; disabled and checked, a `GrayText` disc; invalid, a 2px `CanvasText` edge.

## A11y contract

- Radios sharing a `name` are one group: Tab enters it at the checked radio, arrow keys move the choice.
- The group needs a `<fieldset>` and `<legend>`; that is what `RadioGroup` renders.
- Named by the label span alone (`aria-labelledby`); a description is its `aria-describedby`. The hit area is the whole label, at least 24px tall.
- One focus ring, in both themes. The unchecked edge is 3.89:1 on the field by day and 4.61:1 by night; the checked fill 16.60:1 and 14.43:1. Every pair is in `contrast.md`.

## Rules

MDS-A11Y-01, MDS-A11Y-02, MDS-A11Y-05, MDS-A11Y-06, MDS-A11Y-08, MDS-A11Y-11, MDS-COL-08, MDS-SHAPE-01, MDS-COMP-06.

- Prefer `RadioGroup`. A single radio can never be unchecked, so never use one alone.
