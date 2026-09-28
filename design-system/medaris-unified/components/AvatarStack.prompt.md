A few overlapping small avatars and a tile counting the rest — who is in a course, at a glance.

```jsx
<AvatarStack people={talebeler} total={12} label="12 talebe" />
<AvatarStack people={[{ name: 'Ahmed Hüsrev' }, { name: 'Zeynep Kübra' }]} max={2} />
```

## Anatomy (HTML)

```html
<span class="mds-avatar-stack" role="group" aria-label="12 talebe">
  <span class="mds-avatar mds-avatar--sm" role="img" aria-label="Ahmed Hüsrev">AH</span>
  <span class="mds-avatar mds-avatar--sm" role="img" aria-label="Zeynep Kübra">ZK</span>
  <span class="mds-avatar mds-avatar--sm" role="img" aria-label="Mehmed Fâtih">MF</span>
  <span class="mds-avatar mds-avatar--sm mds-avatar--more" aria-hidden="true">+9</span>
</span>
```

The file draws `.mds-avatar` markup itself; it cannot use `Avatar` (MDS-COMP-06). Avatars in a stack are always `sm`, each on a 2px white ring, overlapping by 4px (`--space-xs`) towards inline-end, so no ring covers an initial. At most `max` (3) are drawn; the last tile is `+N`, N = `total` − shown (`total` defaults to `people.length`), formatted with `Intl` in the page's locale. No tile when N is 0.

## States

None.

## A11y contract

- With `label` the stack is `role="group"` named by the head-count ("12 talebe"), each avatar is an image named by the person, and the +N tile is `aria-hidden`: the label already says how many.
- Without `label` it is a plain run, and the +N tile is read as text.
- A person without a `name` is hidden from assistive technology.
- Initials follow Avatar: particles skipped, upper-cased in the page's locale.

## Rules

MDS-SHAPE-03, MDS-COMP-06, MDS-NUM-01, MDS-A11Y-04, MDS-VOICE-06.

- Give a `label` wherever the count matters, which is almost everywhere.
- A stack shows people. Institutions are listed, not stacked.

## From #95

`pr95-migration/pr95-map.json#components.AvatarStack`
