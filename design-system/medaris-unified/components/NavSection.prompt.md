The label over a group of NavItems: 12 semibold, uppercased by CSS in Turkish and English, with wide tracking. It is written in sentence case.

```jsx
<NavSection>Yönetim</NavSection>
<NavItem href="/raporlar" icon={<Icon name="chart" size="sm" />}>Raporlar</NavItem>
<NavItem href="/ayarlar" icon={<Icon name="settings" size="sm" />}>Köşk ayarları</NavItem>
```

## Anatomy (HTML)

```html
<div class="mds-nav-section">Yönetim</div>
```

It is a sibling of the items it labels, inside the same `<nav>`. The text is written "Yönetim" and CSS draws "YÖNETİM". The rule applies only under `:lang(tr)` and `:lang(en)`, so the dotted İ needs `lang="tr"` on an ancestor, normally `<html>`. It sits 20px below the group above it and 8px above its first item, with the item's 12px inline padding.

## States

None. It is `--text-neutral-subtle` on the sidebar surface, in both themes (`contrast.md`). In an Arabic-script region there is no uppercase, and `--tracking-wide` is 0.

## A11y contract

- A text label, not a heading. The `<nav>`'s own `aria-label` names the landmark, and a heading per group would crowd the heading outline of every page.
- Screen readers read the text as written, in sentence case, not as capitals.

## Rules

MDS-TYPE-02, MDS-TYPE-05, MDS-VOICE-02, MDS-A11Y-07, MDS-LAY-03, MDS-COL-09.

- A section the viewer's roles cannot use is not rendered, label included.
- Never type the label in capitals.
- Uppercase is 12px (`--fs-eyebrow`); mixed-case text is never 12px.
