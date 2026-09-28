A native select in the input box, the sprite's chevron at inline-end. For about four to fifteen options.

```jsx
<Field label="Saat dilimi" help="Ders saatleri bu saat diliminde gösterilir.">
  <Select
    value={zone}
    onChange={(e) => setZone(e.target.value)}
    options={[
      { value: 'Europe/Istanbul', label: 'İstanbul' },
      { value: 'Europe/Berlin', label: 'Berlin' },
      { value: 'Europe/London', label: 'Londra' },
      { value: 'other', label: 'Diğer…' },
    ]}
  />
</Field>

<Field label="Medrese" required>
  <Select name="medrese" options={medreseler} />
</Field>
```

## Anatomy (HTML)

```html
<span class="mds-select">
  <select class="mds-input" id="f3" aria-describedby="f3-h">
    <option value="" disabled selected hidden>Seçin</option>
    <option value="Europe/Istanbul">İstanbul</option>
    <option value="Europe/Berlin">Berlin</option>
  </select>
</span>
```

Native attributes, `aria-*` included, go to the `<select>`; `className` goes to `.mds-select`. An option is `{ value, label, disabled? }`, or a plain string that is its own value and label. `placeholder` (default "Seçin") is a hidden, disabled first option; it shows until something is chosen, unless `value` or `defaultValue` is given. Pass `placeholder=""` for none. The chevron is `chevronDown` from the sprite, drawn by `.mds-select::after` as a mask; there is no chevron element.

## States

- **Placeholder showing:** the text in `--text-neutral-disabled`, like an input's placeholder; the options keep `--text-neutral-primary`.
- **Focus, error, disabled, sizes:** those of `.mds-input` (`:focus`, `[aria-invalid="true"]`, `:disabled`, `--mini`/`--small`/`--large`). Disabled turns the chevron `--icon-neutral-disabled`. The focus ring's colour is OPEN-1 (`--ring-focus`, 1.26:1 on white).
- **Chevron:** `--icon-neutral-tertiary`, 7.56:1 on white; `CanvasText` in forced colours.

## A11y contract

- The native control: keyboard, type-ahead, the platform's picker on a phone, form submission and validation, all without script.
- The placeholder can't be chosen; with `required`, a select left on it fails native validation.
- Named by `Field`'s label; `error` sets `aria-invalid="true"`.
- Option text is plain: an option cannot carry `.mds-arabic`, so a label in Arabic script falls back to the device's Arabic face.
- The boundary is 1.47:1 on white (OPEN-3), as for every field.

## Rules

MDS-A11Y-02, MDS-A11Y-06, MDS-A11Y-07, MDS-DOM-03, MDS-NUM-01, MDS-ICON-01, MDS-SHAPE-01, MDS-COMP-06, OPEN-1.

- Always inside `Field`.
- Two or three options are a RadioGroup or ChoiceChips, so every option stays visible. Beyond about fifteen, or to pick a person, use Combobox (reserved, not built yet).
- The time zone is a Select over `content/time-zones.json`: the course's zone, the viewer's detected zone, the short list, and "Diğer…" last, which opens a second native Select over `Intl.supportedValuesOf('timeZone')` until Combobox exists.
- The meeting platform is never a Select: it is read from the link's host.
- A static mock uses `<Select disabled>` or plain text; there is no display-only select.

## From #95

`pr95-migration/pr95-map.json#components.Select`
