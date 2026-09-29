A short supplement to one focusable element, shown on hover and keyboard focus. Never the only place a piece of information lives.

```jsx
<Tooltip label="Takvim dosyası (.ics) indirilir">
  <Button variant="ghost" size="small" iconLeft={<Icon name="calendarPlus" size="sm" />}>Takvime ekle</Button>
</Tooltip>
<Tooltip label="Arşiv’den geri alınabilir" placement="bottom">
  <Button variant="ghost" size="mini">Gizle</Button>
</Tooltip>
```

## Anatomy (HTML)

```html
<span class="mds-tooltip-anchor">
  <button type="button" class="mds-btn mds-btn--small mds-btn--ghost" aria-describedby="mds-tooltip-r1"><svg class="mds-icon mds-icon--sm" viewBox="0 0 256 256" aria-hidden="true" focusable="false">…</svg>Takvime ekle</button>
  <span class="mds-tooltip" role="tooltip" id="mds-tooltip-r1">Takvim dosyası (.ics) indirilir</span>
</span>
```

`.mds-tooltip-anchor--bottom` places it below. In an AppBar or a Dialog header the bubble opens below by default, since there is no room above. The id is per instance (`React.useId`). A child's own `aria-describedby` is kept and the tooltip's id is added after it. `.mds-tooltip` on its own is the static bubble; `.mds-tooltip-anchor.is-open` shows an anchored one on a card.

## Look

A slip of paper over the page: `--background-neutral-surface`, a `--border-neutral-subtle` hairline, `--radius-tag` (4), `--elevation-overlay`, Instrument Sans 13 in default text, line-height 1.4, padding 6 / 8. It sits 6px from its anchor. An anchored bubble is one line; the static bubble wraps at 280px. By night the same tokens give a dark slip with light text; the overlay shadow is black with a 1px ring. The text is at least 4.5:1 in both themes (`contrast.md`).

## States

- Hidden at rest (`display: none`, so it never widens a scrolling frame); shown on hover and on keyboard focus of the child (`:focus-visible` inside the anchor), so a mouse click does not leave it open.
- Hoverable: while shown it takes pointer events, and a `::before` bridge crosses the 6px gap, so the pointer can move onto it.
- Dismissible: Esc sets `data-dismissed` on the anchor whether the tooltip was opened by hover or by focus; leaving with the pointer or moving focus clears it. While the bubble shows, that Esc is consumed (capture phase, `preventDefault`), so inside a Dialog it hides the tooltip without closing the dialog; the next Esc closes it.
- The fade is `--duration-fast`; reduced motion removes it in `base.css`.

## A11y contract

- `role="tooltip"`; with `describes` (the default) the child's `aria-describedby` points at it.
- With `describes={false}` it is `aria-hidden`: use that only when the label repeats the child's accessible name, as IconButton does.
- The child is one element that can take focus (a button, a link, a field). A tooltip on something that cannot be focused is unreachable from the keyboard.
- Placement is logical: it centres on the anchor in either direction, and under `dir="rtl"`. Once shown, the binding measures it and writes `--mds-tooltip-shift` on the bubble, sliding it back inside the viewport (8px from each edge) and inside every clipping ancestor such as a table frame. A bubble that would be cut off above or below moves to the other side when it fits there (`data-placement` on the anchor).
- The anchor is `fit-content` wide, so a column flex parent (a dialog body, a field) never stretches it: the bubble stays on its trigger, and hovering the empty row beside it shows nothing.
- Forced colours: the bubble gets a `CanvasText` outline, since its fill is painted over.

## Rules

MDS-A11Y-10, MDS-A11Y-02, MDS-A11Y-04, MDS-A11Y-08, MDS-SHAPE-01, MDS-SHAPE-02, MDS-MOT-01, MDS-LAY-05, MDS-VOICE-02.

- A few words, one line (`white-space: nowrap`); anything longer belongs in the page or a help text.
- Nothing inside it is interactive: no links, no buttons.
