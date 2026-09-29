Rounded filter pill, and — with `tag` — the small static subject tag used on köşk and course cards.

```jsx
<div style={{ display: "flex", gap: 8 }}>
  <Pill active>Tümü</Pill>
  <Pill>Devam ediyorum</Pill>
  <Pill>Tamamlandım</Pill>
</div>

<Pill tag>Arapça</Pill> <Pill tag>Fıkıh</Pill>
```

Exactly one pill per filter row carries `active`. Tags are never interactive.
