A link in the sidebar or the nav sheet: 36px, 14 medium, on the paper surface. There is one sidebar, the same in Nizam and Nazır, by day and by night.

```jsx
<nav aria-label="Ana menü">
  <NavSection>Genel</NavSection>
  <NavItem href="/" icon={<Icon name="home" size="sm" />}>Ana sayfa</NavItem>
  <NavItem href="/bildirimler" icon={<Icon name="bell" size="sm" />} count={3} countLabel="okunmamış">Bildirimler</NavItem>
  <NavSection>Köşk</NavSection>
  <NavItem href="/kurslar" icon={<Icon name="courses" size="sm" />} count={7} active>Kurslar</NavItem>
  <NavItem href="/basvurular" icon={<Icon name="inbox" size="sm" />} count={5} countLabel="bekleyen">Başvurular</NavItem>
  <NavItem href="/raporlar" icon={<Icon name="chart" size="sm" />} trailing={<Icon name="lock" size="sm" label="Kilitli" />}>Raporlar</NavItem>
</nav>
```

## Anatomy (HTML)

```html
<nav aria-label="Ana menü">
  <a class="mds-nav-item" href="/kurslar" aria-current="page">
    <svg class="mds-icon mds-icon--sm" aria-hidden="true">…</svg>
    Kurslar
    <span class="mds-nav-item__count">7</span>
  </a>
  <a class="mds-nav-item" href="/basvurular">
    <svg class="mds-icon mds-icon--sm" aria-hidden="true">…</svg>
    Başvurular
    <span class="mds-nav-item__count">5<span class="mds-visually-hidden"> bekleyen</span></span>
  </a>
  <a class="mds-nav-item" href="/raporlar">
    <svg class="mds-icon mds-icon--sm" aria-hidden="true">…</svg>
    Raporlar
    <span class="mds-nav-item__trailing"><svg class="mds-icon mds-icon--sm" role="img" aria-label="Kilitli">…</svg></span>
  </a>
</nav>
```

The page draws the sidebar itself: a column `--layout-sidebar` wide on `--background-neutral-surface`, with a `--border-neutral-subtle` hairline at inline-end.

The item is a row at least 36px tall: padding 12, gap 12, `--radius-control`. The count sits at inline-end, a round pill at least 22 × 20, 13 semibold. It is formatted with `Intl` in the page's locale: `locale`, else the nearest `lang`, else tr-TR ("1.250"). A count of 0 renders nothing. With both a count and `trailing`, the count comes first. `.is-active` is kept as an alias of `aria-current="page"` for static markup; the component writes only the attribute.

## States

- Rest: `--text-neutral-muted`, with the glyph in `--text-neutral-subtle`.
- Hover: the `--background-neutral-hover` fill and `--text-neutral-default`. No lift.
- Current (`aria-current="page"`): the `--background-brand-subtle` tint, `--text-neutral-default` at 600, and the glyph in `--text-brand-default`. The tint is never the only signal: the weight and the glyph change too.
- Count: `--text-neutral-muted` on `--background-neutral-sunken`. On the current item: `--text-brand-default` on `--background-neutral-surface`.
- Trailing glyph: `--text-neutral-subtle`.
- Focus: the one ring from `tokens/base.css`, around the row.
- Night: the same roles. The surface turns to ink and the text to paper. `contrast.md` holds every pair above in both themes.
- Forced colours: the current item is `Highlight` / `HighlightText`, and a count keeps a border.
- No disabled state: an item the viewer cannot use is not rendered (MDS-A11Y-07).

## A11y contract

- A real link: `href` is required, because an `<a>` without it takes no focus and has no link role. Routing is by URL, never `onClick` alone.
- The viewer's page is `aria-current="page"` on the link itself.
- `countLabel` is read after the number ("Başvurular 5 bekleyen"). Name what the count counts; a bare number makes the listener guess.
- `icon` is decorative. A `trailing` glyph that carries meaning names itself (`label="Kilitli"`).
- The `<nav>` around the items has its own `aria-label`, distinct from every other `<nav>` on the page.
- The row is at least 36px tall, above the 24px target minimum.

## Rules

MDS-A11Y-01, MDS-A11Y-03, MDS-A11Y-04, MDS-A11Y-05, MDS-A11Y-07, MDS-A11Y-08, MDS-COL-01, MDS-COL-03, MDS-COL-04, MDS-TYPE-02, MDS-TYPE-07, MDS-NUM-01, MDS-SHAPE-01, MDS-SHAPE-02, MDS-VOICE-02, MDS-VOICE-04, MDS-COMP-06, MDS-LAY-04, MDS-LAY-05, MDS-ICON-01, MDS-COL-09, MDS-TOK-07.

- Exactly one item is `active`.
- One sidebar surface in every app, by day and by night. There is no dark or brand-filled sidebar.
- A lock says the page waits on something. The page it opens says why, once (MDS-VOICE-04).
- Icons are `size="sm"` from the sprite, passed by the caller.
- A course title or any other author-written label goes in `<bdi>`.
- Below 768 the sidebar gives way to the AppBar sheet, which holds the same items. The collapsed icon rail is Phase 2.
