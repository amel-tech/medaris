12px radius, 1px hairline, `--shadow-xs`. Every list item, dashboard tile and dialog body is built from it.

```jsx
<Card title="Sarf Dersi" action={<Badge variant="success">Aktif</Badge>}>
  <p className="mds-card__body">12 talebe · haftada 2 ders</p>
</Card>

<Stat label="Geciken" value={3} tone="error" />
<Stat label="Bu hafta ezber" value={38}>
  <Progress value={72} />
</Stat>
```

- The card title is Cairo, `--fs-h6`, semibold — it is the smallest place display type appears, and it is what keeps a grid of tiles from reading as a form.
- `action` is a badge or a mini ghost button. A primary button in a card header competes with the page's own primary.
- `Stat` uses `--fs-h4` for the number so a row of four tiles has one clear reading order: label, number, context.
