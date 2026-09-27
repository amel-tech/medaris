Wraps a form control with its label, required marker and hint — every input in a Nizam form sits inside one.

```jsx
<Field label="Kurs adı" required>
  <Input defaultValue="Tefsir Usûlüne Giriş" />
</Field>

<Field label="Açıklama" hint="Birkaç cümle ile dersin amacı ve hedef kitlesi.">
  <Textarea rows={3} />
</Field>
```

Labels are 14px / weight 500, hints 13px `--muted`. Keep hints to one sentence.
