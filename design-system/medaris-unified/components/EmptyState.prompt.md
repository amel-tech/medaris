A list or region with nothing in it: one sentence about what is missing, and at most one action. A page with nothing to show is a `SystemState`.

```jsx
<EmptyState
  icon={<Icon name="book" size="lg" />}
  action={<Button href="/koskler" variant="secondary">Köşkleri keşfet</Button>}
>
  Henüz bir kursa kaydolmadın.
</EmptyState>

<EmptyState icon={<Icon name="video" size="lg" />}>Bu dersin kaydı henüz eklenmedi.</EmptyState>
```

## Anatomy (HTML)

```html
<div class="mds-empty">
  <span class="mds-empty__icon"><svg class="mds-icon mds-icon--lg" aria-hidden="true">…</svg></span>
  <p class="mds-empty__text">Henüz bir kursa kaydolmadın.</p>
  <a class="mds-btn mds-btn--regular mds-btn--secondary" href="/koskler">Köşkleri keşfet</a>
</div>
```

A centred column with 16px gaps and 40px of block padding; the sentence is 16 on the prose measure, the icon `--icon-neutral-tertiary`.

## States

Empty is one of the three states every list draws, with loading (`Skeleton`) and error (an error `Alert` above the list).

## A11y contract

- Static text, not a live region. When a filter empties a list, announce the result through a status region.
- The icon is decorative; the sentence carries the meaning.
- The action, if any, is a real link or button that this viewer can use.

## Rules

MDS-VOICE-04, MDS-VOICE-01, MDS-VOICE-03, MDS-A11Y-07, MDS-COMP-03, MDS-COMP-04, MDS-ICON-01, MDS-TYPE-06.

- One sentence in the surface's register: "Henüz bir kursa kaydolmadın." in Tedris, "Bu kursa henüz oturum planlamadınız." in Nizam.
- No illustration, no encouragement, no exclamation mark. A hidden record is not an empty state: it is in Arşiv.
- The action is `primary` only when creating something is what the surface is for ("Oturum planla"); otherwise `secondary`.

## From #95

None as a component: `pr95-migration/pr95-map.json#reserved` routes the brief's "empty state" here, and #95 DataTable's `empty` becomes Table's.
