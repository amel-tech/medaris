Bordered setting row with a checkbox, icon, title and explanation — the Nizam pattern for course and köşk options.

```jsx
<CheckboxRow
  icon={<Icon name="certificate" size={18} />}
  title="İcâzet verilsin"
  description="Müfredatı tamamlayan talebelere otomatik icâzet belgesi verilsin mi?"
  checked={icazet}
  onChange={() => setIcazet(v => !v)}
/>
```

Stack these in the right-hand settings column, never inline in the main form flow.
