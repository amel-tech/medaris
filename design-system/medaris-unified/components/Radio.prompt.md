One native 16px radio inside its own label. A set of radios is a `RadioGroup`; use `Radio` alone only inside a fieldset you write yourself.

```jsx
<fieldset className="mds-choice-group">
  <legend className="mds-label">Rol</legend>
  <Radio name="rol" value="muderris" label="Müderris" defaultChecked />
  <Radio name="rol" value="talebe" label="Talebe" />
</fieldset>
```

## Anatomy (HTML)

```html
<label class="mds-choice">
  <input type="radio" class="mds-radio" name="rol" value="muderris" checked aria-labelledby="r1-l">
  <span class="mds-choice__text">
    <span class="mds-choice__label" id="r1-l">Müderris</span>
  </span>
</label>
```

Native attributes go to the `<input>`; `className` goes to the `<label>`. `description` adds `<span class="mds-choice__desc" id="…">` and the matching `aria-describedby`; `bordered` adds `.mds-choice--bordered`.

## States

- **Unchecked:** white disc, `--border-neutral-secondary`; hover `--border-neutral-tertiary`, 2.54:1 (OPEN-3).
- **Checked:** a `--background-brand-primary` ring and dot; the white between them is an inset shadow, kept under the focus ring. Hover `--background-brand-secondary`.
- **Focus, invalid, disabled:** as for Checkbox; the ring's colour is OPEN-1 (`--ring-focus`, 1.26:1 on white).
- **Forced colours:** checked is a `Highlight` disc (shadows are not painted there).

## A11y contract

- Radios sharing a `name` are one group: Tab enters it at the checked radio, arrow keys move the choice.
- The group needs a `<fieldset>` and `<legend>`; that is what `RadioGroup` renders.
- Named by the label span alone (`aria-labelledby`); a description is its `aria-describedby`. The hit area is the whole label, at least 24px tall. The unchecked boundary is 1.47:1 (OPEN-3).

## Rules

MDS-A11Y-02, MDS-A11Y-05, MDS-A11Y-06, MDS-A11Y-08, MDS-SHAPE-01, MDS-COMP-06, OPEN-1.

- Prefer `RadioGroup`. A single radio can never be unchecked, so never use one alone.

## From #95

None: #95 has no radio; `.mds-radio` is canonical.
