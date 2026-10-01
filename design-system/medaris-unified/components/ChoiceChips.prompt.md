Native radios or checkboxes drawn as 32px chips: a filter over a list on screen, or a form field such as the weekdays. Chips never navigate.

```jsx
<ChoiceChips
  legend="İlim"
  name="ilim"
  value={ilim}
  onChange={(value) => setIlim(value)}
  options={[
    { value: 'tumu', label: 'Tümü' },
    { value: 'sarf', label: 'Sarf' },
    { value: 'nahiv', label: 'Nahiv' },
    { value: 'mantik', label: 'Mantık' },
  ]}
/>

<ChoiceChips
  legend="Ders günleri"
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
  <legend class="mds-visually-hidden">İlim</legend>
  <label class="mds-chip"><input type="radio" name="ilim" value="tumu" checked>Tümü</label>
  <label class="mds-chip"><input type="radio" name="ilim" value="sarf">Sarf</label>
</fieldset>

<fieldset class="mds-chips">
  <legend class="mds-label">Ders günleri</legend>
  <label class="mds-chip"><input type="checkbox" name="gunler" value="pzt" checked>Pzt</label>
  …
</fieldset>
```

Each chip is a `<label>` around a transparent native input that covers it. `multiple` switches the radios to checkboxes; `onChange(value, event)` then receives every checked value, in option order. An option's `icon` (a 16px `<Icon>`) goes before its label. `className` goes to the `<fieldset>`. The hidden legend reads `.mds-visually-hidden` from the utilities section.

## Look

32px high, inline padding 12, gap 6, `--radius-full`, Instrument Sans 14/500. A glyph is 16px.

## States

- **Idle:** `--background-neutral-surface`, a `--border-neutral-control` edge, `--text-neutral-muted`. The edge is at least 3:1 on every ground, so the chip reads as a control before it is chosen.
- **Hover:** `--background-neutral-hover`, default text.
- **Checked:** `--background-action-bold` for the fill and the edge, `--text-neutral-on-bold`: an ink chip by day, a paper chip by night. Hover: `--background-action-bold-hover`, the text stays `--text-neutral-on-bold`.
- **Focus:** the chip draws the two-band ring for its hidden input (`.mds-chip:has(> input:focus-visible)`), checked or not.
- **Disabled:** the tone drops without fading: a `--background-neutral-sunken` fill, a `--border-neutral-subtle` edge, `--text-neutral-disabled`, `not-allowed`, no hover. A disabled checked chip keeps the `--background-neutral-hover` fill and a doubled `--border-neutral-control` edge (1px border and a 1px inset), so it still reads as selected beside a disabled chip that is not.
- **Forced colours:** every chip is outlined by its edge; checked is `Highlight` with `HighlightText`, opted out of forcing so the label is not lost on the text backplate; focus is a 2px `CanvasText` outline; disabled is `GrayText` on `Canvas`, and a disabled checked chip adds a second `GrayText` line inside its edge. A hovered checked chip keeps `HighlightText` on `Highlight`.

Every pair is in `contrast.md`, in both themes. `check.mjs` tabs through the chips and measures each one.

## A11y contract

- A `<fieldset>` named by its legend, visible or not: a filter's legend ("İlim") is still announced.
- Single: a radio group, Tab to enter, arrow keys to move. Multiple: a checkbox per chip, Tab through, Space to toggle.
- Checked and idle differ in fill and in ink (ink on paper against paper on ink), so the state never rests on hue.
- The chip is 32px tall, above the 24px target.
- Under `dir="rtl"` the chips run from the right and the glyph sits at inline-start.

## Rules

MDS-A11Y-01, MDS-A11Y-02, MDS-A11Y-03, MDS-A11Y-04, MDS-A11Y-05, MDS-A11Y-08, MDS-COL-01, MDS-COL-03, MDS-NUM-01, MDS-SHAPE-01, MDS-VOICE-02, MDS-COMP-06.

- Chips filter a list that is on screen, or answer a form question; they never navigate. Moving between views is `Tabs`.
- A single-choice filter has exactly one chip checked, "Tümü" when nothing narrows the list.
- Weekday labels come from `Intl.DateTimeFormat(<page locale>, { weekday: 'short' })`, Monday first: "Pzt Sal Çar Per Cum Cmt Paz" in tr-TR.
- A static subject tag on a card is a `Badge variant="secondary"`, not a chip.
