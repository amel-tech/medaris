A few overlapping small avatars and a tile counting the rest: who is in a course, at a glance.

```jsx
<AvatarStack people={talebeler} total={12} label="12 talebe" />
<AvatarStack people={[{ name: 'Yusuf Ziya Kemaloğlu' }, { name: 'Ömer Faruk Yılmazoğlu' }]} max={2} />
```

## Anatomy (HTML)

```html
<span class="mds-avatar-stack" role="group" aria-label="12 talebe">
  <span class="mds-avatar mds-avatar--sm" role="img" aria-label="Zeynep Betül Karahanlı">ZK</span>
  <span class="mds-avatar mds-avatar--sm" role="img" aria-label="Muhammed Said Özdemiroğlu">MÖ</span>
  <span class="mds-avatar mds-avatar--sm" role="img" aria-label="Hatice Kübra Yıldırımoğlu">HY</span>
  <span class="mds-avatar mds-avatar--sm mds-avatar--more" aria-hidden="true">+9</span>
</span>
```

- The file draws `.mds-avatar` markup itself; it cannot use `Avatar` (MDS-COMP-06).
- Avatars in a stack are always `sm` (32). Each wears a 2px ring in the surface colour and overlaps the one before it by 4px (`--space-1`) toward inline-end, so no ring covers an initial.
- At most `max` (3) are drawn. The last tile is `+N`, where N = `total` − shown (`total` defaults to `people.length`), formatted with `Intl` in the page's locale. It uses the hover fill, so it reads as a count and not a person. There is no tile when N is 0.

## States

None.

## A11y contract

- With `label` the stack is `role="group"` named by the head-count ("12 talebe"). Each avatar is an image named by the person, and the +N tile is `aria-hidden`: the label already says how many.
- Without `label` it is a plain run, and the +N tile is read as text.
- A person without a `name` is hidden from assistive technology.
- Initials follow Avatar: particles skipped, upper-cased in the page's locale.
- Both themes: the initials and the count pass AA on their fills (`contrast.md`). The ring takes the surface colour, so a stack belongs on a surface.

## Rules

MDS-SHAPE-03, MDS-COMP-06, MDS-NUM-01, MDS-A11Y-04, MDS-VOICE-06, MDS-COL-09.

- Give a `label` wherever the count matters, which is almost everywhere.
- A stack shows people. Institutions are listed, not stacked.
