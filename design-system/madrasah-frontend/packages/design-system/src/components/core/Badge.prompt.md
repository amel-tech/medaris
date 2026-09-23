Status label. The tone carries meaning — pick it from the system's status vocabulary rather than by color preference.

```jsx
<Badge tone="published" shape="chip">Yayında</Badge>
<Badge tone="draft" shape="chip">Taslak</Badge>
<Badge tone="success">Tamamlandı</Badge>
<Badge tone="accent">Devam ediyor</Badge>
<Badge tone="live" icon={<Icon name="headset" size={12} />}>Canlı ders</Badge>
<Badge tone="live" dot>14 dk sonra</Badge>
```

`shape="chip"` is for the status tag overlaid on a Nizam course cover; everything else is a pill.
