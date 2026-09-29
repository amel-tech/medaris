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
    { value: 'laciverd', label: 'Lâciverd', icon: <CoverPattern tone="laciverd" size="xs" /> },
    { value: 'bordo', label: 'Bordo', icon: <CoverPattern tone="bordo" size="xs" /> },
    { value: 'zumrut', label: 'Zümrüt', icon: <CoverPattern tone="zumrut" size="xs" /> },
    { value: 'murekkep', label: 'Mürekkep', icon: <CoverPattern tone="murekkep" size="xs" /> },
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

<!-- an option with an icon: the swatch sits between the radio and the text -->
<label class="mds-choice">
  <input type="radio" class="mds-radio" name="kapak" value="laciverd" aria-labelledby="g2-0-l">
  <span class="mds-choice__icon" aria-hidden="true"><span class="mds-cover mds-cover--laciverd mds-cover--xs"></span></span>
  <span class="mds-choice__text"><span class="mds-choice__label" id="g2-0-l">Lâciverd</span></span>
</label>
```

`RadioGroup` renders the Radio markup itself, since a component file never uses another. Options are 12px apart and the legend sits 8px above the first. `value` makes it controlled; `onChange(value, event)` receives the chosen value. An option's `icon` is decorative (`aria-hidden`), so its label still names the choice. `className` goes to the `<fieldset>`.

## States

Each option has the Radio states: hover (the strong edge), checked (the action fill with a 4px field ring), focus (one ring, composed with the inset when checked), invalid (the doubled red edge), disabled (`options[].disabled`: a sunken disc and `--text-neutral-disabled` text, no opacity). A bordered option's edge turns 2px lapis when checked; a disabled bordered option keeps its hairline. The group itself has none.

## A11y contract

- A native radio group: `<fieldset>` named by its `<legend>`; Tab enters at the checked option, arrow keys move the choice.
- Each option is named by its label span alone (`aria-labelledby`); a description is its `aria-describedby`. Every option's label is its hit area, at least 24px tall.
- One focus ring, in both themes. The unchecked edge is 3.89:1 on the field by day and 4.61:1 by night; the lapis edge of a checked bordered row 6.69:1 on the surface by day and 5.51:1 by night. Every pair is in `contrast.md`.

## Rules

MDS-A11Y-01, MDS-A11Y-02, MDS-A11Y-04, MDS-A11Y-05, MDS-A11Y-06, MDS-A11Y-07, MDS-A11Y-08, MDS-A11Y-11, MDS-COL-07, MDS-COL-08, MDS-MOD-02, MDS-VOICE-02, MDS-COMP-06.

- Never inside `Field`: the legend is the label.
- `bordered` for choices whose consequence needs a sentence (a ban's scope); plain for short answers.
- Widening a ban reads "Köşkten de yasakla", "Medreseden de yasakla", "Platformdan yasakla"; the last one is absent for anyone but the sistem yöneticisi.
- The kapak rengi field is this group: each option is a bookcloth tone, with an `xs` CoverPattern swatch as its icon and the tone's name as its label (Lâciverd, Bordo, Zümrüt, Mürekkep). With no choice, the course id decides the tone.
