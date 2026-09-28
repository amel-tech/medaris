A fieldset of radios under a visible legend, every option on screen. A list long enough to scroll is a Select.

```jsx
<RadioGroup
  legend="Yasağın kapsamı"
  name="kapsam"
  bordered
  defaultValue="kurs"
  options={[
    { value: 'kurs', label: 'Yalnızca bu kurs', description: 'Talebe bu kursa erişemez.' },
    { value: 'kosk', label: 'Köşkten de yasakla', description: 'Köşkün bütün kurslarına erişemez.' },
    { value: 'medrese', label: 'Medreseden de yasakla', description: 'Medresenin bütün köşklerine erişemez.' },
  ]}
/>

<RadioGroup
  legend="Kapak rengi"
  name="kapak"
  value={tone}
  onChange={(value) => setTone(value)}
  options={[
    { value: 'sky', label: <><CoverPattern tone="sky" size="sm" />Gök</> },
    { value: 'blue', label: <><CoverPattern tone="blue" size="sm" />Mavi</> },
    { value: 'green', label: <><CoverPattern tone="green" size="sm" />Yeşil</> },
    { value: 'slate', label: <><CoverPattern tone="slate" size="sm" />Arduvaz</> },
  ]}
/>
```

## Anatomy (HTML)

```html
<fieldset class="mds-choice-group">
  <legend class="mds-label">Yasağın kapsamı</legend>
  <label class="mds-choice mds-choice--bordered">
    <input type="radio" class="mds-radio" name="kapsam" value="kurs" checked aria-labelledby="g1-0-l" aria-describedby="g1-0-d">
    <span class="mds-choice__text">
      <span class="mds-choice__label" id="g1-0-l">Yalnızca bu kurs</span>
      <span class="mds-choice__desc" id="g1-0-d">Talebe bu kursa erişemez.</span>
    </span>
  </label>
  …
</fieldset>
```

`RadioGroup` renders the Radio markup itself, since a component file never uses another. Options are 12px apart and the legend sits 6px above the first. `value` makes it controlled; `onChange(value, event)` receives the chosen value. `className` goes to the `<fieldset>`.

## States

Each option has the Radio states: hover, checked, focus (the ring's colour is OPEN-1: `--ring-focus`, 1.26:1 on white), disabled (`options[].disabled`), and the bordered row's brand border when checked. The group itself has none.

## A11y contract

- A native radio group: `<fieldset>` named by its `<legend>`; Tab enters at the checked option, arrow keys move the choice.
- Each description is that option's `aria-describedby`.
- Each option is named by its label span alone (`aria-labelledby`); a description is its `aria-describedby`. Every option's label is its hit area, at least 24px tall. The unchecked boundary is 1.47:1 (OPEN-3).

## Rules

MDS-A11Y-02, MDS-A11Y-04, MDS-A11Y-05, MDS-A11Y-06, MDS-A11Y-07, MDS-MOD-02, MDS-COL-07, MDS-VOICE-02, MDS-COMP-06, OPEN-1.

- Never inside `Field`: the legend is the label.
- `bordered` for choices whose consequence needs a sentence (a ban's scope); plain for short answers.
- Widening a ban reads "Köşkten de yasakla", "Medreseden de yasakla", "Platformdan yasakla"; the last one is absent for anyone but the sistem yöneticisi.
- The kapak rengi field is this group with CoverPattern swatches and the tone's name; the tone names are drafts.

## From #95

None: #95 has no radio group; the classes are canonical plus `.mds-choice-group`.
