A number on a card: its label, the number, then any context. A row of four has one reading order: label, number, context.

```jsx
<Stat label="Kayıtlı talebe" value={1248} />
<Stat label="Kursu tamamlayan" value={38} tone="success" cue="+6 bu hafta" />
<Stat label="Yüklenemeyen ders kaydı" value={2} tone="error" cue={<Icon name="warning" size="sm" />} />
<Stat label="Bu hafta ezber" value={38}>
  <Progress label="Haftalık hedef" value={72} showValue />
</Stat>
```

## Anatomy (HTML)

```html
<div class="mds-card mds-stat mds-stat--success">
  <span class="mds-caption">Kursu tamamlayan</span>
  <span class="mds-stat__value"><span class="mds-stat__cue">+6 bu hafta</span>38</span>
</div>
```

The tile is `.mds-card`. The number is `.mds-stat__value`, Cairo at `--fs-h4` bold with tight leading; `.mds-stat--success` or `--error` colours it. `.mds-stat__cue` is printed before the number, in 14px semibold. A numeric `value` is formatted with `Intl.NumberFormat` in the page's locale (1.248 in Turkish); any other node is printed as given. `children` follow the number.

## States

None of its own. The tone is a state of the number: `neutral` (the default), `success`, `error`. The binding draws a tone only when there is a cue: without one it renders neutral, because colour alone would say good or bad.

## A11y contract

- The reading order is the source order: label, cue, number, context.
- An icon cue is decorative (`aria-hidden`); the label and a delta label say what the colour means. A delta that matters to a screen reader is a text cue, not an icon.
- Success text on white is 5.02:1; error text 4.83:1 as extracted (OPEN-2 would raise it to 6.47:1).
- Forced colours: the tone is lost with the colours, which is why the cue is required. The number takes snug leading there, so the plate behind it does not cover the label.

## Rules

MDS-COL-03, MDS-NUM-01, MDS-VOICE-03, MDS-TYPE-01, MDS-SHAPE-02, OPEN-2.

- `cue` is required whenever `tone` is not `neutral`: an icon (`check`, `warning`) or a delta label ("+12 bu hafta").
- `error` is for something that is wrong now (a failed upload), not for a low number; a low count is neutral.

## From #95

No #95 component: `pr95-migration/pr95-map.json` has no entry.
