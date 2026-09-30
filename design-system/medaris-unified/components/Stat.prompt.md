A number on a card: its label, the number, then any context. A row of four has one reading order: label, number, context.

```jsx
<Stat label="Kayıtlı talebe" value={1248} />
<Stat label="Dersi tamamlayan" value={38} tone="success" cue="+6 bu hafta" />
<Stat label="Yüklenemeyen ders kaydı" value={2} tone="error" cue={<Icon name="warning" size="sm" />} />
<Stat label="Bu hafta ezber" value={38}>
  <Progress label="Haftalık hedef" value={72} showValue />
</Stat>
```

## Anatomy (HTML)

```html
<div class="mds-card mds-stat mds-stat--success">
  <span class="mds-caption">Dersi tamamlayan</span>
  <span class="mds-stat__value"><span class="mds-stat__cue">+6 bu hafta</span>38</span>
</div>
```

- The tile is `.mds-card`: surface, hairline, no shadow.
- The label is `.mds-caption`: 13, `--text-neutral-subtle`.
- The number is `.mds-stat__value`: Literata 30/500 (`--fs-h1`) with lining tabular figures, in default text. `.mds-stat--success` or `--error` colours it with `--text-success-default` or `--text-error-default`.
- `.mds-stat__cue` is printed before the number, in `--font-ui` 14/600.
- A numeric `value` is formatted with `Intl.NumberFormat` in the page's locale (1.248 in Turkish). Any other node is printed as given.
- `children` follow the number.
- A row of stats is the page's grid. Give the row `grid-template-rows: repeat(4, auto)` and `row-gap: 0`, and each Stat `display: grid; grid-row: span 4; grid-template-rows: subgrid`. Then the labels share one row height, and a two-line label never drops its number below its neighbours'.

## States

None of its own. The tone is a state of the number: `neutral` (the default), `success` or `error`. The binding draws a tone only when there is a cue. Without one it renders neutral, because colour alone would say good or bad.

## A11y contract

- The reading order is the source order: label, cue, number, context.
- An icon cue is decorative (`aria-hidden`). The label and a delta label say what the colour means. A delta that matters to a screen reader is a text cue, not an icon.
- Both themes: the success and error text pass AA on the surface by day and at night (`contrast.md`, "Tone text on every ground").
- Forced colours: the tone is lost with the colours, which is why the cue is required. The number takes snug leading there, so the plate behind it does not cover the label.

## Rules

MDS-COL-03, MDS-NUM-01, MDS-VOICE-03, MDS-TYPE-01, MDS-TYPE-03, MDS-SHAPE-02, MDS-COMP-06, MDS-COL-08, MDS-COL-09.

- `cue` is required whenever `tone` is not `neutral`: an icon (`check`, `warning`) or a delta label ("+12 bu hafta").
- `error` is for something that is wrong now (a failed upload), not for a low number. A low count is neutral.
