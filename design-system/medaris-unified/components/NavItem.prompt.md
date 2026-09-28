A link in the sidebar or the nav sheet: 36px, 14 Medium. On the inverse surface by default; inside `.mds-nav--light` on white, the surface every screen ported from #95 uses.

```jsx
<nav className="mds-nav--light" aria-label="Ana menü">
  <NavSection>Genel</NavSection>
  <NavItem href="/" icon={<Icon name="home" size="sm" />}>Ana sayfa</NavItem>
  <NavItem href="/bildirimler" icon={<Icon name="bell" size="sm" />} count={3} countLabel="okunmamış">Bildirimler</NavItem>
  <NavSection>Kurslarım</NavSection>
  <NavItem href="/kurslar/emsile" icon={<Icon name="book" size="sm" />} active><bdi>Emsile ve Bina</bdi></NavItem>
  <NavItem href="/kurslar/akaid" icon={<Icon name="book" size="sm" />} trailing={<Icon name="lock" size="sm" label="Kilitli" />}><bdi>Akaid Risalesi</bdi></NavItem>
</nav>
```

## Anatomy (HTML)

```html
<nav class="mds-nav--light" aria-label="Ana menü">   <!-- no class on the inverse sidebar -->
  <a class="mds-nav-item" href="/kurslar/emsile" aria-current="page">
    <svg class="mds-icon mds-icon--sm" aria-hidden="true">…</svg>
    <bdi>Emsile ve Bina</bdi>
    <span class="mds-nav-item__count">1<span class="mds-visually-hidden"> yeni ders kaydı</span></span>
  </a>
  <a class="mds-nav-item" href="/kurslar/akaid">
    <svg class="mds-icon mds-icon--sm" aria-hidden="true">…</svg>
    <bdi>Akaid Risalesi</bdi>
    <span class="mds-nav-item__trailing"><svg class="mds-icon mds-icon--sm" role="img" aria-label="Kilitli">…</svg></span>
  </a>
</nav>
```

The count sits at inline-end and is formatted with `Intl` in the page's locale: `locale`, else the nearest `lang`, else tr-TR ("1.250"). A count of 0 renders nothing. With both a count and `trailing`, the count comes first. `.is-active` is kept as an alias of `aria-current="page"` for static markup; the component writes only the attribute.

## States

- Rest: inverse `--text-neutral-inverse-secondary` on slate-900, 14.42:1; light `--text-neutral-tertiary` on white, 7.56:1.
- Hover: inverse `--text-neutral-inverse-primary` on `--background-neutral-inverse-secondary`, 13.29:1; light `--text-neutral-primary` on `--background-neutral-secondary`, 16.19:1. No lift.
- Current: inverse `--text-white` on `--background-brand-primary`, 9.46:1; light `--text-brand-primary` on `--background-brand-tertiary`, semibold, 8.24:1.
- Count: inverse white on `--background-neutral-inverse-tertiary`, 10.35:1, and on the current item brand on white, 9.46:1; light brand on `--background-brand-tertiary`, 8.24:1, and on the current item white on brand, 9.46:1.
- Focus: `--ring-focus`, whose colour is OPEN-1.
- Forced colours: the current item is `Highlight` / `HighlightText`, and a count keeps a border.
- No disabled state: an item the viewer cannot use is not rendered.

## A11y contract

- A real link: `href` is required, because an `<a>` without it takes no focus and has no link role. Routing is by URL, never `onClick` alone.
- The viewer's page is `aria-current="page"` on the link itself.
- `countLabel` is read after the number ("Başvurular 5 bekleyen"). Name what the count counts; a bare number makes the listener guess.
- `icon` is decorative. A `trailing` glyph that carries meaning names itself (`label="Kilitli"`).
- The `<nav>` around the items has its own `aria-label`, distinct from every other `<nav>` on the page.
- The row is 36px tall, above the 24px target minimum.

## Rules

MDS-A11Y-03, MDS-A11Y-04, MDS-A11Y-05, MDS-A11Y-07, MDS-A11Y-08, MDS-COL-01, MDS-COL-03, MDS-TYPE-02, MDS-TYPE-07, MDS-NUM-01, MDS-SHAPE-01, MDS-SHAPE-02, MDS-VOICE-02, MDS-VOICE-04, MDS-COMP-06, MDS-LAY-04, MDS-ICON-01.

- Exactly one item is `active`.
- The surface is SPEC-D3-04: screens ported from #95 put the items in `<nav class="mds-nav--light">`, and the canonical müderris shell keeps the inverse sidebar. Without `.mds-nav--light`, the canonical item text on white measures 1.24:1.
- A lock says the page waits on something. The page it opens says why, once (MDS-VOICE-04).
- Icons are `size="sm"` from the sprite, passed by the caller.
- A course title or any other author-written label goes in `<bdi>`.
- Below 768 the sidebar gives way to the AppBar sheet, which draws the same items light. The collapsed icon rail is Phase 2.

## From #95

`pr95-migration/pr95-map.json#components.SidebarItem`
