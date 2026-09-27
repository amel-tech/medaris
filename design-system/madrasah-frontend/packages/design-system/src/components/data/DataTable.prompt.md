Dense hairline table — the Nizam pattern for lists of desteler, köşkler or talebeler. CSS grid, tinted header row, hairline dividers.

```jsx
<DataTable
  columns={[
    { header: "Köşk", width: "2fr", strong: true, key: "name" },
    { header: "Ders", width: "90px", muted: true, key: "courses" },
    { header: "Durum", width: "110px", cell: r => <Badge tone={r.active ? "success" : "neutral"}>{r.status}</Badge> },
    { header: "İşlem", width: "80px", align: "right",
      cell: () => <><IconButton variant="bare" label="Gör" icon={<Icon name="eye" size={16}/>} />
                   <IconButton variant="bare" label="Sil" icon={<Icon name="trash" size={16}/>} /></> },
  ]}
  rows={kosks}
  rowKey={r => r.name}
/>
```

Prefer this over cards when the user needs to scan or compare many records.
