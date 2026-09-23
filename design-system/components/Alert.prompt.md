States what happened, then what to do about it. Two lines. A third line means it should have been a dialog.

```jsx
<Alert tone="warning" title="Üç talebe geride kaldı">
  Son bir haftada hiç ezber teslim etmediler.
</Alert>
```

- `error` renders as `role="alert"` (interrupts a screen reader), everything else as `role="status"` (waits its turn). Do not reach for `error` to get attention.
- An alert is page-level and persistent. Something that fades is a toast.
- Warning and error text need `tokens/a11y-overrides.css`; as extracted, warning text on its own background measures 1.79:1.
