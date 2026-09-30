A native 18px checkbox inside its own label, which is the hit area (at least 24px tall). `bordered` makes it a settings row.

```jsx
<Checkbox name="hatirlat" label="10 dk önce hatırlat" defaultChecked />

<Checkbox
  bordered
  icon={<Icon name="icazet" size="sm" />}
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

Native attributes, `aria-*` included, go to the `<input>`; `className` goes to the `<label>`. The check is the sprite's `check` glyph, drawn by `.mds-check::after` as a mask 2px inside the box; there is no check element. Without `bordered`, drop the modifier; `icon` and `description` are optional. The label is 14px regular, the description 13px in `--text-neutral-subtle`, and the mark sits 12px before them. A bordered row has 16px padding, a `--border-neutral-subtle` hairline, `--radius-control` and a surface fill.

## States

- **Unchecked:** a `--background-neutral-field` box with a `--border-neutral-control` edge and `--radius-mark` (2px). Hover, on the box or its label: `--border-neutral-strong`. A bordered row's hairline turns `--border-neutral-control` on hover.
- **Checked:** the action fill `--background-action-bold`: ink by day, paper by night. The check is `--text-neutral-on-bold`. Hover: `--background-action-bold-hover`. A bordered row's edge turns 2px lapis (`--border-brand-default` plus a 1px inset).
- **Focus:** the ring from `tokens/base.css`, around the box.
- **Invalid:** `[aria-invalid="true"]`, unchecked: the edge is `--border-error-default`, doubled by a 1px inset; hover keeps it red. Focused, the ring is added outside the inset. `Field` sets it.
- **Disabled:** a `--background-neutral-sunken` box with a `--border-neutral-subtle` edge; checked, the check is `--text-neutral-disabled`. The label, icon and description turn `--text-neutral-disabled`. There is no opacity. A disabled bordered row keeps its hairline, checked or not, and does not answer the pointer.
- **Forced colours:** checked is a `Highlight` box with a `HighlightText` check; disabled is `GrayText`; invalid is a 2px `CanvasText` edge.

## A11y contract

- A native checkbox: Space toggles it. Its name is the label's text alone: `aria-labelledby` points at `.mds-choice__label`, because the wrapping `<label>` would also fold the description into the name.
- The description is its `aria-describedby`; a `Field` help or error is appended to it.
- The hit area is the whole label, at least 24px tall.
- One focus ring, in both themes. The unchecked edge is 3.89:1 on the field by day and 4.61:1 by night; the check is 16.60:1 on the action fill by day and 14.43:1 by night; disabled text is 3:1 or more (a policy: WCAG exempts it). Every pair is in `contrast.md`.

## Rules

MDS-A11Y-01, MDS-A11Y-02, MDS-A11Y-05, MDS-A11Y-06, MDS-A11Y-07, MDS-A11Y-08, MDS-A11Y-11, MDS-COL-08, MDS-ICON-01, MDS-SHAPE-01, MDS-VOICE-01, MDS-COMP-06.

- A checkbox waits for a submit. A setting that applies the moment it changes is a Switch.
- Bordered rows stack in the settings column, never inline in the main form flow.
- The description is one neutral sentence. The icâzet row promises nothing while SPEC-D3-09 is open.
- A choice this viewer cannot make is absent, not disabled. When a choice is disabled for everyone, its description says why ("Ders yayında olduğu için değiştirilemez.").
