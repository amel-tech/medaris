Renders one glyph from the system's single line-icon set — use it anywhere an icon is needed instead of pasting SVG or importing another icon library.

```jsx
<Icon name="calendar" size={14} />
<Icon name="star" filled size={13} style={{ color: "var(--amber)" }} />
```

All line icons share `stroke-width: 1.6`, `currentColor`, and round caps, so they inherit
text color automatically. Only `star` and `play` have filled variants (`filled`). Size
should track adjacent type: 11-13px beside meta text, 14-17px beside body, 18-22px for
standalone controls.
