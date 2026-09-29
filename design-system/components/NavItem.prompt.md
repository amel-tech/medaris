36px row on the inverse surface. The active item takes the full brand fill, not a tint.

```jsx
<NavSection>Genel</NavSection>
<NavItem icon={<HomeIcon />} active>Ana Sayfa</NavItem>
<NavItem icon={<BookIcon />}>Derslerim</NavItem>
<NavSection>Müderris</NavSection>
<NavItem icon={<SchoolIcon />}>Medresem</NavItem>
```

- Exactly one item carries `active`, and it also sets `aria-current="page"`.
- The `Müderris` section is role-gated — it does not render for a talebe. Hiding it is right; disabling it is not.
- Icons are 16px, stroke 2, `currentColor`. They inherit the item's state colour, so an active item's icon turns white with its label.
