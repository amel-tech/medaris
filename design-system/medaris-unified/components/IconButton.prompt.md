A square button that holds one glyph. Its `label` is its name and shows as a tooltip on hover and keyboard focus.

```jsx
<IconButton icon={<Icon name="bell" size="sm" />} label="Bildirimler" />
<IconButton icon={<Icon name="more" size="sm" />} label="Diğer işlemler" size="mini" />
<IconButton icon={<Icon name="copy" size="sm" />} label="Bağlantıyı kopyala" variant="outline" />
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

`.mds-icon-btn` with a Button size and variant. It is square at the Button heights: 24 / 32 / 40 / 48, and 32 for `regular` in a `data-density="compact"` region. The default variant is `ghost`. The file renders Tooltip's markup itself, because a component file cannot use another component. `className` and native attributes go to the `<button>`. The glyph comes from the caller: 16px (`size="sm"`) up to `regular`, 20px on `large`.

## States

- Hover, focus, disabled and the night theme are Button's: the fill of the variant, the two-band focus ring, and a disabled button that drops its tone without fading (`ghost` stays transparent).
- The tooltip is a paper slip (see Tooltip). It shows on hover and on keyboard focus (`:focus-visible`), not after a mouse click. Hidden, it is `display: none`. Shown, the binding shifts it inside the viewport and any clipping frame (a table's) through `--mds-tooltip-shift`. In an AppBar or a Dialog header it opens below; anywhere else it moves below when there is no room above (`data-placement`).
- The pointer can move onto the tooltip without it closing. Esc hides it, wherever focus is, until the pointer leaves or focus moves (`data-dismissed` on the anchor). That Esc is consumed while the tooltip shows, so in a Dialog header it does not also close the dialog.
- Pressed (a toggle): `aria-pressed="true"` and the filled glyph. The fill of the button does not change.
- Disabled: native `disabled`. It takes no pointer events, so its tooltip does not show either. Prefer leaving the action out.

## A11y contract

- The name is `aria-label` from `label`. The tooltip repeats it, so it is `aria-hidden` and not wired to `aria-describedby`.
- Never `title=`: it shows only to a mouse and cannot be dismissed.
- The glyph is decorative (`aria-hidden`); the button names it. The glyph takes the text colour of the button, so it is at least 4.5:1 on its fill, and a disabled one at least 3:1 (`contrast.md`).
- A toggle (a saved lesson) passes `aria-pressed` and `<Icon filled>`; the label stays the action's name ("Dersi kaydet").
- The smallest size, `mini`, is a 24px square: the smallest target allowed.
- Forced colours: the glyph and any edge follow the system colours; the tooltip gets a `CanvasText` outline; the focus ring becomes a 2px `CanvasText` outline.

## Rules

MDS-A11Y-01, MDS-A11Y-04, MDS-A11Y-05, MDS-A11Y-08, MDS-A11Y-10, MDS-COMP-06, MDS-ICON-01, MDS-SHAPE-01, MDS-VOICE-02.

- `label` is required: no glyph in this system survives without a name. It names the action or the place: "Bildirimler", "Diğer işlemler", "Bağlantıyı kopyala".
- Row actions are `mini` ghost at inline-end. A page's main action is a `Button` with words.
- A filled glyph is a state (a saved lesson), never decoration.
