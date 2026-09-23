The text action button — `primary` (dark) for the main action on a screen, `ghost` for secondary, `create` (green) exclusively for creation actions in Nizam.

```jsx
<Button icon={<Icon name="plus" size={16} />}>Yeni Köşk</Button>
<Button variant="create" icon={<Icon name="plus" size={16} />}>Yeni Ders Aç</Button>
<Button variant="ghost">Taslak Kaydet</Button>
<Button variant="link" iconAfter={<Icon name="arrowRight" size={13} />}>Tüm müfredatı gör</Button>
```

Sizes: `sm` in dense toolbars and table rows, `md` default, `lg` for the one hero action
(e.g. "Derse devam et"). `fullWidth` for the sticky enroll card. Green is *never* a
primary button in Tedris and never destructive.
