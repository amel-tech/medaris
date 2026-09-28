A square button that holds one glyph. Its `label` is its name and shows as a tooltip on hover and keyboard focus.

```jsx
<IconButton icon={<Icon name="bell" size="sm" />} label="Bildirimler" />
<IconButton icon={<Icon name="more" size="sm" />} label="Diğer işlemler" size="mini" />
<IconButton icon={<Icon name="close" size="sm" />} label="Kapat" variant="ghost" />
```

## Anatomy (HTML)

```html
<span class="mds-tooltip-anchor">
  <button type="button" class="mds-btn mds-icon-btn mds-btn--regular mds-btn--ghost" aria-label="Bildirimler">
    <svg class="mds-icon mds-icon--sm" viewBox="0 0 256 256" aria-hidden="true" focusable="false">…</svg>
  </button>
  <span class="mds-tooltip" role="tooltip" aria-hidden="true">Bildirimler</span>
</span>
```

Square at the Button heights: 24 / 32 / 36 / 42 (`.mds-icon-btn` with a size class). The default variant is `ghost`. The file renders Tooltip's markup itself, because a component file cannot use another component; `className` and native attributes go to the `<button>`. The glyph comes from the caller.

## States

- Hover and focus as Button; the ring's colour is OPEN-1 (`--ring-focus`, 1.26:1 on white). The tooltip shows on hover and on keyboard focus (`:focus-visible`), not after a mouse click; hidden, it is `display: none`, and shown, the binding shifts it inside the viewport and any clipping frame (a table's), via `--mds-tooltip-shift`.
- The pointer can move onto the tooltip without it closing; Esc hides it, wherever focus is, until the pointer leaves or focus moves (`data-dismissed` on the anchor). That Esc is consumed while the tooltip shows, so in a Dialog header it does not also close the dialog.
- Disabled: native `disabled`; it takes no pointer events, so its tooltip does not show either. Prefer leaving the action out.

## A11y contract

- The name is `aria-label` from `label`. The tooltip repeats it, so it is `aria-hidden` and not wired to `aria-describedby`.
- Never `title=`: it shows only to a mouse and cannot be dismissed.
- The glyph is decorative (`aria-hidden`); the button names it.
- A toggle (a saved bookmark) adds `aria-pressed` and swaps to the filled glyph; the label stays the action's name.
- Forced colours: the button's border and glyph follow the system colours; the tooltip gets an outline.

## Rules

MDS-A11Y-04, MDS-A11Y-10, MDS-A11Y-01, MDS-A11Y-05, MDS-COMP-06, MDS-ICON-01, MDS-VOICE-02, OPEN-1.

- `label` is required: no glyph in this system survives without a name. It names the action or the place: "Bildirimler", "Diğer işlemler", "Bağlantıyı kopyala".
- Row actions are `mini` ghost at inline-end; a primary action is a `Button` with words.

## From #95

`pr95-migration/pr95-map.json#components.IconButton`
