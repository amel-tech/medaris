Text controls. `Input` for single-line, `Textarea` for multi-line; `mono` switches Input to monospace for URLs.

```jsx
<Input placeholder="örn. Birinci bab müzakeresi" />
<Input mono defaultValue="https://meet.google.com/bqx-mfzn-rde" />
<Textarea rows={3} />
```

Export `controlStyle` when you need a non-input element (a fake select, a read-only value
box) to line up pixel-for-pixel with real inputs.
