A 2px brand underline on the active tab — the only place `--border-m` is used.

```jsx
<Tabs
  value={tab}
  onChange={setTab}
  tabs={[
    { value: 'genel', label: 'Genel' },
    { value: 'talebeler', label: 'Talebeler' },
    { value: 'kartlar', label: 'Ezber Kartları' },
  ]}
/>
```

- Tabs cut one object into views. If the panels are different objects, they are navigation, and belong in the sidebar.
- Four tabs is the practical ceiling at the 390px breakpoint. Beyond that the row scrolls, and a scrolling tab row hides its own options.
- Tabs and a breadcrumb together are normal here: the breadcrumb says which ders, the tabs say which part of it.
