The default container — 1px hairline, 14px radius, white fill, and deliberately no shadow.

```jsx
<Card
  app="nizam"
  interactive
  media={<CoverPattern hue={165} height={150} />}
  footer={<div style={{display:"flex",gap:18,color:"var(--muted)",fontSize:"var(--fs-14)"}}>
    <span>2 hafta</span><span>4 ders</span>
  </div>}
>
  <h3 style={{margin:0,font:"var(--fw-bold) var(--fs-19)/1.3 var(--font-ui)"}}>Tefsir Usûlüne Giriş</h3>
</Card>
```

Pass `app="nizam"` inside Nizam so padding jumps to 22px and the hairline matches.
Never add a drop shadow to a plain card.
