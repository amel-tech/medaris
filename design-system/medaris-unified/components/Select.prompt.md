A native select in the input box, with the sprite's chevron at inline-end. For about four to fifteen options.

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

Native attributes, `aria-*` included, go to the `<select>`; `className` goes to `.mds-select`. An option is `{ value, label, disabled? }`, or a plain string that is its own value and label. `placeholder` (default "Seçin") is a hidden, disabled first option. It shows until something is chosen, unless `value` or `defaultValue` is given. Pass `placeholder=""` for none. The chevron is `chevronDown` from the sprite, drawn by `.mds-select::after` as a 16px mask, 12px in from the inline-end edge; there is no chevron element. In a right-to-left page it sits on the left.

## States

- **Placeholder showing:** the text is `--text-neutral-subtle`, like an input's placeholder; the options keep `--text-neutral-default`.
- **Hover, focus, invalid, disabled, sizes:** those of `.mds-input` (`:hover`, `:focus` or `.is-focus`, `[aria-invalid="true"]`, `:disabled`, `--mini` / `--small` / `--large`, and 32px inside `data-density="compact"`). Invalid is the doubled red edge; focused, the one ring is added outside it. Chromium fades a disabled select to 0.7 on its own; the class resets that to 1, and a disabled select left on its placeholder shows the disabled ink, not the placeholder's (MDS-A11Y-11).
- **Chevron:** `--text-neutral-muted`, 9.45:1 on the field by day and 10.46:1 by night. Disabled, it turns `--text-neutral-disabled`. `CanvasText` in forced colours, `GrayText` when disabled.
- **Phone:** below 768px the text is 16px (the mini size excepted), so a phone does not zoom into it.

## A11y contract

- The native control: keyboard, type-ahead, the platform's picker on a phone, form submission and validation, all without script.
- The placeholder cannot be chosen; with `required`, a select left on it fails native validation.
- Named by `Field`'s label; `error` sets `aria-invalid="true"`.
- Option text is plain: an option cannot carry `.mds-arabic`, so a label in Arabic script on a Turkish page falls back to the device's Arabic face. In an Arabic region the select itself takes the Arabic face (`.mds-input:dir(rtl)`).
- One focus ring, in both themes. The edge is 3.89:1 on the field by day and 4.61:1 by night; the ring 6.69:1 and 8.41:1. Every pair is in `contrast.md`.

## Rules

MDS-A11Y-01, MDS-A11Y-02, MDS-A11Y-06, MDS-A11Y-07, MDS-A11Y-11, MDS-COL-08, MDS-DOM-03, MDS-NUM-01, MDS-ICON-01, MDS-SHAPE-01, MDS-LAY-05, MDS-COMP-06.

- Always inside `Field`, or named with `aria-label` in a filter bar ("Durum: tümü", "Müderris: tümü").
- Two or three options are a RadioGroup or ChoiceChips, so every option stays visible. Beyond about fifteen, or to pick a person, use Combobox (reserved, not built yet).
- The time zone is a Select over `content/time-zones.json`: the course's zone, the viewer's detected zone, the short list, and "Diğer…" last. An option's label is the zone's city from that file ("İstanbul"). "Diğer…" opens a second native Select over `Intl.supportedValuesOf('timeZone')` until Combobox exists.
- The meeting platform is never a Select: it is read from the link's host.
- A static mock uses `<Select disabled>` or plain text; there is no display-only select.
