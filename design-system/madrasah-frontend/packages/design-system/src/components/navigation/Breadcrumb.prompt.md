Chevron-separated location trail. The last item is the current page: weight 500, `--ink`, never a link.

```jsx
<Breadcrumb items={["Ev", "Köşkler", "Fâtih Köşkü"]} />
<Breadcrumb size="sm" items={[{label:"Öğrenme",href:"/"},{label:"Köşkler",href:"/kosk"},"Süleymaniye Köşkü"]} />
```

Nizam puts this in the panel's top bar at `md`; Tedris puts it above the page title at `sm`.
