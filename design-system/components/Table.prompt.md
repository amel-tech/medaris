Hairline rows inside a 12px-radius frame. The talebe list is the reference case.

```jsx
<Table
  columns={[
    { key: 'name', header: 'Talebe', render: r => <><Avatar name={r.name} size="sm" /> {r.name}</> },
    { key: 'ders', header: 'Ders' },
    { key: 'state', header: 'Ezber durumu', render: r => <Badge variant={r.tone}>{r.state}</Badge> },
    { key: 'due', header: 'Son teslim' },
    { key: 'a', header: '', align: 'right', render: r => <Button variant="ghost" size="mini">Aç</Button> },
  ]}
  rows={talebeler}
  empty="Bu derse henüz talebe kayıtlı değil."
/>
```

- Headers are Medium in `--text-neutral-tertiary`. Never bold, never a filled header band — the data is what is being read.
- No zebra striping. Rows are separated by a hairline and lift on hover.
- The row action is always present, right-aligned, mini ghost. Revealing it on hover loses it on touch.
- `empty` is a sentence about this table, not the word "Empty".
