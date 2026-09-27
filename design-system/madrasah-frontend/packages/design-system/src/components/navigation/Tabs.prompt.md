Underline tab bar — the only tab style in the system. Active tab goes weight 600 with a 2px underline.

```jsx
<Tabs
  value={tab} onChange={setTab}
  items={[
    { id: "mufredat", label: "Müfredat", badge: 40 },
    { id: "muderris", label: "Müderrisler" },
    { id: "kaynak", label: "Kaynaklar", badge: 3 },
  ]}
/>

<Tabs underline="green" value="dersler" items={[{id:"dersler",label:"Dersler",badge:11},{id:"talebeler",label:"Talebeler",badge:364}]} />
```

Use `underline="accent"` in Tedris, `"green"` for Nizam contextual sub-tabs.
