Progress indicators: `ProgressBar` is the pill track used in every card, list row and header; `ProgressRing` is reserved for dashboard tiles.

```jsx
<ProgressBar value={0.35} showLabel />
<ProgressBar value={1} height={6} />
<ProgressRing value={0.42} />
```

Fill is `--accent` while in progress and flips to `--success` at 100%. Percentages are
written Turkish-style: **%35**.
