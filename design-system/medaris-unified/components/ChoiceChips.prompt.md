Native radios or checkboxes drawn as 32px chips: a filter over a list on screen, or a form field such as the weekdays. Chips never navigate.

```jsx
<ChoiceChips
  legend="Alan"
  name="alan"
  value={alan}
  onChange={(value) => setAlan(value)}
  options={[
    { value: 'tumu', label: 'Tümü' },
    { value: 'fikih', label: 'Fıkıh' },
    { value: 'hadis', label: 'Hadis' },
    { value: 'tefsir', label: 'Tefsir' },
  ]}
/>

<ChoiceChips
  legend="Günler"
  legendVisible
  multiple
  name="gunler"
  defaultValue={['pzt', 'cmt']}
  options={gunler}  // labels from Intl.DateTimeFormat(locale, { weekday: 'short' }), Monday first
/>
```

## Anatomy (HTML)

```html
<fieldset class="mds-chips">
  <legend class="mds-visually-hidden">Alan</legend>
  <label class="mds-chip"><input type="radio" name="alan" value="tumu" checked>Tümü</label>
  <label class="mds-chip"><input type="radio" name="alan" value="fikih">Fıkıh</label>
</fieldset>

<fieldset class="mds-chips">
  <legend class="mds-label">Günler</legend>
  <label class="mds-chip"><input type="checkbox" name="gunler" value="pzt" checked>Pzt</label>
  …
</fieldset>
```

Each chip is a `<label>` around a transparent native input that covers it. `multiple` switches the radios to checkboxes; `onChange(value, event)` then receives every checked value, in option order. An option's `icon` (a 16px `<Icon>`) goes before its label. `className` goes to the `<fieldset>`. The hidden legend reads `.mds-visually-hidden` from the utilities section.

## States

- **Idle:** `--text-neutral-primary` on `--background-neutral-secondary`, 16.19:1; hover `--background-neutral-tertiary`, 14.39:1.
- **Checked:** `--text-white` on `--background-brand-primary`, 9.46:1; hover `--background-brand-secondary`, 5.93:1.
- **Focus:** `--ring-focus` on the chip, from the input's `:focus-visible` (OPEN-1).
- **Disabled:** 50%, `not-allowed`, no hover.
- **Forced colours:** every chip outlined by its transparent border; checked is `Highlight` with `HighlightText`, opted out of forcing so the label is not lost on the text backplate; focus a `CanvasText` outline.

## A11y contract

- A `<fieldset>` named by its legend, visible or not: a filter's legend ("Alan") is still announced.
- Single: a radio group, Tab to enter, arrow keys to move. Multiple: a checkbox per chip, Tab through, Space to toggle.
- Checked and idle fills differ by 8.63:1 and their ink is reversed, so the state never rests on hue. The idle fill is 1.10:1 on white: the text, not the fill, marks the chip. The chip is 32px tall, above the 24px target.

## Rules

MDS-A11Y-02, MDS-A11Y-03, MDS-A11Y-04, MDS-A11Y-05, MDS-A11Y-08, MDS-COL-01, MDS-COL-03, MDS-NUM-01, MDS-SHAPE-01, MDS-VOICE-02, MDS-COMP-06.

- Chips filter a list that is on screen, or answer a form question; they never navigate. Moving between views is `Tabs`.
- A single-choice filter has exactly one chip checked, "Tümü" when nothing narrows the list.
- Weekday labels come from `Intl.DateTimeFormat(<page locale>, { weekday: 'short' })`, Monday first: "Pzt Sal Çar Per Cum Cmt Paz" in tr-TR.
- A static subject tag on a card is a `Badge variant="secondary"`, not a chip.

## From #95

`pr95-migration/pr95-map.json#components.Pill`
