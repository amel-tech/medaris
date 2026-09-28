The label over a group of NavItems: 12 semibold, uppercased by CSS, with wide tracking. Written in sentence case.

```jsx
<NavSection>Yönetim</NavSection>
<NavItem href="/basvurular" icon={<Icon name="student" size="sm" />} count={5} countLabel="bekleyen">Başvurular</NavItem>
<NavItem href="/ayarlar" icon={<Icon name="settings" size="sm" />}>Ayarlar</NavItem>
```

## Anatomy (HTML)

```html
<div class="mds-nav-section">Yönetim</div>
```

It is a sibling of the items it labels, inside the same `<nav>`. The text is written "Yönetim" and CSS draws "YÖNETİM"; the dotted İ needs `lang="tr"` on an ancestor, normally `<html>`.

## States

None. Inverse: `--text-neutral-inverse-tertiary` on slate-900, 12.12:1. Inside `.mds-nav--light`: `--text-neutral-tertiary` on white, 7.56:1. An Arabic-script region sets its tracking to 0 through `--tracking-wide`.

## A11y contract

- A text label, not a heading: the `<nav>`'s own `aria-label` names the landmark, and a heading per group would crowd the heading outline of every page.
- Screen readers read the text as written, in sentence case, not as capitals.

## Rules

MDS-TYPE-04, MDS-TYPE-05, MDS-VOICE-02, MDS-A11Y-07, MDS-LAY-03.

- A section the viewer's roles cannot use is not rendered, label included.
- Never type the label in capitals.

## From #95

None: #95 shells draw the label inline ("İçerik"); it becomes a NavSection. Their items port by `pr95-migration/pr95-map.json#components.SidebarItem`.
