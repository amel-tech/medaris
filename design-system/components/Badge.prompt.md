A 24px pill that states a fact about the row it sits in. Never clickable.

```jsx
<Badge variant="success">Tamamlandı</Badge>
<Badge variant="warning">Bekliyor</Badge>
<Badge variant="destructive">Gecikti</Badge>
<Badge variant="primary">Müderris</Badge>
```

- Two families: `primary`/`secondary`/`outline`/`ghost`/`destructive` came with the Figma kit and label *what a thing is*; `success`/`warning`/`info` were added for the product and label *how a thing is going*. Do not mix the two in one column.
- Ezber state uses the second family, always in the same order: info (new) → warning (pending) → success (done) → destructive (late).
- The warning and error tones need `tokens/a11y-overrides.css` to be readable. See the contrast audit.
