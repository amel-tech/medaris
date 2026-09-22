An 8px track that only ever moves forward. Ezber completion is the reason it exists.

```jsx
<Progress value={72} label="Bakara sûresi" />
<Skeleton width="60%" height={14} />
```

- Determinate only. There is no spinner variant here; an unknown wait is a `Skeleton` shaped like the content that is coming.
- The bar is `--background-brand-primary` at every value. Do not turn it red when it is low — a low number is not an error, and the label already says what it is.
- Skeletons mirror the real layout's line lengths. Three equal grey bars communicate nothing.
