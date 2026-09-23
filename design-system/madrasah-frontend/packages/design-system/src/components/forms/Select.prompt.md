Select control. Without `onChange` it renders the display-only surface used in static mocks; with `onChange` it renders a real `<select>` styled to match.

```jsx
<Select value="Başlangıç" />
<Select value={level} options={["Başlangıç","Orta","İleri"]} onChange={e => setLevel(e.target.value)} />
```

The trailing chevron is always `chevronDown` at 16px in `--faint`.
