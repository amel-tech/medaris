A short supplement to one focusable element, shown on hover and keyboard focus. Never the only place a piece of information lives.

```jsx
<Tooltip label="Toplantı bağlantısı her hafta yenilenir">
  <Button variant="ghost" size="small">Bağlantıyı yenile</Button>
</Tooltip>
<Tooltip label="Takvimine ekle" placement="bottom" describes={false}>
  <a href="/oturumlar/42.ics">Takvimine ekle</a>
</Tooltip>
```

## Anatomy (HTML)

```html
<span class="mds-tooltip-anchor">
  <button type="button" class="mds-btn mds-btn--small mds-btn--ghost" aria-describedby="mds-tooltip-r1">Bağlantıyı yenile</button>
  <span class="mds-tooltip" role="tooltip" id="mds-tooltip-r1">Toplantı bağlantısı her hafta yenilenir</span>
</span>
```

`.mds-tooltip-anchor--bottom` places it below. The id is per instance (`React.useId`). A child's own `aria-describedby` is kept and the tooltip's id is added after it. `.mds-tooltip` on its own is the static bubble; `.mds-tooltip-anchor.is-open` shows an anchored one on a card.

## States

- Hidden at rest (`display: none`, so it never widens a scrolling frame); shown on hover and on keyboard focus of the child (`:focus-visible` inside the anchor), so a mouse click does not leave it open.
- Hoverable: while shown it takes pointer events, and a `::before` bridge crosses the 6px gap, so the pointer can move onto it.
- Dismissible: Esc sets `data-dismissed` on the anchor whether the tooltip was opened by hover or by focus; leaving with the pointer or moving focus clears it. While the bubble shows, that Esc is consumed (capture phase, `preventDefault`), so inside a Dialog it hides the tooltip without closing the dialog; the next Esc closes it.
- The fade is `--duration-fast`; reduced motion removes it in `base.css`.

## A11y contract

- `role="tooltip"`; with `describes` (the default) the child's `aria-describedby` points at it.
- With `describes={false}` it is `aria-hidden`: use that only when the label repeats the child's accessible name, as IconButton does.
- The child is one element that can take focus (a button, a link, a field). A tooltip on something that cannot be focused is unreachable from the keyboard.
- Placement is logical: it centres on the anchor in either direction, and under `dir="rtl"`. Once shown, the binding measures it and writes `--mds-tooltip-shift` on the bubble, sliding it back inside the viewport (8px from each edge) and inside every clipping ancestor such as a table frame.
- Forced colours: the bubble gets a `CanvasText` outline, since its fill is painted over.

## Rules

MDS-A11Y-10, MDS-A11Y-02, MDS-A11Y-04, MDS-SHAPE-01, MDS-SHAPE-02, MDS-MOT-01, MDS-LAY-05, MDS-VOICE-02.

- A few words, one line (`white-space: nowrap`); anything longer belongs in the page or a help text.
- Nothing inside it is interactive: no links, no buttons.

## From #95

No #95 component: its icon buttons used `title`, which this system drops (MDS-A11Y-10). `pr95-migration/pr95-map.json` has no entry.
