36px tall, 6px radius — the one control that is not on the 8px radius, which is what separates it from a button beside it.

```jsx
<Field label="E-posta" help="Davet bu adrese gider.">
  <Input placeholder="talebe@example.com" />
</Field>

<Field label="E-posta" error="Geçerli bir e-posta girin.">
  <Input defaultValue="ahmed@" />
</Field>

<Field label="Ders açıklaması">
  <Textarea rows={4} />
</Field>
```

- Always wrap in `Field`. It wires `htmlFor`, `aria-describedby` and `aria-invalid`, and it is the only thing that guarantees the error message is announced.
- `help` and `error` occupy the same slot: an error replaces the hint, it does not stack under it.
- A field's own boundary is a 1.47:1 hairline. On a white card it is effectively invisible — put fields on `--background-neutral-primary`, or take the decision in the contrast audit.
