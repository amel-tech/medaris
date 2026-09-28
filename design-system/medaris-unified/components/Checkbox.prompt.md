A native 16px checkbox inside its own label, which is the 24px hit area. `bordered` makes it a settings row.

```jsx
<Checkbox name="tekrar" label="Tekrar gerekiyor" />

<Checkbox
  bordered
  icon={<Icon name="certificate" size="sm" />}
  label="İcâzet verilebilir"
  description="Müfredatı tamamlayan talebeler, müderrisin değerlendirmesiyle icâzete aday olur."
  checked={icazet}
  onChange={(e) => setIcazet(e.target.checked)}
/>
```

## Anatomy (HTML)

```html
<label class="mds-choice mds-choice--bordered">
  <input type="checkbox" class="mds-check" name="icazet" aria-labelledby="c1-l" aria-describedby="c1-d">
  <span class="mds-choice__icon" aria-hidden="true"><svg class="mds-icon mds-icon--sm">…</svg></span>
  <span class="mds-choice__text">
    <span class="mds-choice__label" id="c1-l">İcâzet verilebilir</span>
    <span class="mds-choice__desc" id="c1-d">Müfredatı tamamlayan talebeler, müderrisin değerlendirmesiyle icâzete aday olur.</span>
  </span>
</label>
```

Native attributes, `aria-*` included, go to the `<input>`; `className` goes to the `<label>`. The check is the sprite's `check` glyph, drawn by `.mds-check::after` as a mask; there is no check element. Without `bordered`, drop the modifier; `icon` and `description` are optional.

## States

- **Unchecked:** white box, `--border-neutral-secondary`; hover `--border-neutral-tertiary`, 2.54:1, still below 3:1 (OPEN-3).
- **Checked:** `--background-brand-primary` fill, the white check 9.46:1 on it; hover `--background-brand-secondary`, 5.93:1. A bordered row's border turns `--border-brand-primary`.
- **Focus:** `--ring-focus` on the box (OPEN-1); in forced colours the outline from `tokens/base.css`.
- **Invalid:** `[aria-invalid="true"]`, unchecked: `--border-error-primary`. `Field` sets it.
- **Disabled:** the whole choice at 50% and `not-allowed`.
- **Forced colours:** checked is a `Highlight` box with a `HighlightText` check.

## A11y contract

- A native checkbox: Space toggles it, and its name is the label's text alone: `aria-labelledby` points at `.mds-choice__label`, because the wrapping `<label>` would also fold the description into the name.
- The description is its `aria-describedby`; a `Field` help or error is appended to it.
- The hit area is the whole label, at least 24px tall.
- The unchecked boundary is gray-300 on white, 1.47:1 (OPEN-3): named, not fixed.

## Rules

MDS-A11Y-02, MDS-A11Y-05, MDS-A11Y-06, MDS-A11Y-07, MDS-A11Y-08, MDS-ICON-01, MDS-SHAPE-01, MDS-VOICE-01, MDS-COMP-06.

- A checkbox waits for a submit. A setting that applies the moment it changes is a Switch.
- Bordered rows stack in the settings column, never inline in the main form flow.
- The description is one neutral sentence. The icâzet row promises nothing while SPEC-D3-09 is open.
- A choice this viewer cannot make is absent, not disabled.

## From #95

`pr95-migration/pr95-map.json#components.CheckboxRow`
