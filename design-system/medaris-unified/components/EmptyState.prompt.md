A list or region with nothing in it: one sentence about what is missing, and at most one action. A page with nothing to show is a `SystemState`.

```jsx
<EmptyState
  icon={<Icon name="courses" size="lg" />}
  action={<Button href="/koskler" variant="secondary">Köşkleri keşfet</Button>}
>
  Henüz bir derse kaydolmadın.
</EmptyState>

<EmptyState
  icon={<Icon name="calendar" size="lg" />}
  action={<Button iconLeft={<Icon name="plus" size="sm" />}>Celse planla</Button>}
>
  Bu derse henüz celse planlamadınız.
</EmptyState>

<EmptyState icon={<Icon name="video" size="lg" />}>Bu celsenin ders kaydı henüz eklenmedi.</EmptyState>
```

## Anatomy (HTML)

```html
<div class="mds-empty">
  <span class="mds-empty__icon"><svg class="mds-icon mds-icon--lg" aria-hidden="true">…</svg></span>
  <p class="mds-empty__text">Henüz bir derse kaydolmadın.</p>
  <a class="mds-btn mds-btn--regular mds-btn--secondary" href="/koskler">Köşkleri keşfet</a>
</div>
```

- A centred column with 16px gaps, 40px of block padding and 24px inline.
- The icon is 24px in `--text-neutral-subtle`.
- The sentence is 16 in `--text-neutral-default`, on the prose measure.
- It sits inside the region it describes, usually a `Card` under its title.

## States

Empty is one of the three states every list draws, with loading (`Skeleton`) and error (an error `Alert` above the list).

## A11y contract

- Static text, not a live region. When a filter empties a list, announce the result through a status region.
- The icon is decorative; the sentence carries the meaning.
- The action, if any, is a real link or button that this viewer can use.
- Both themes: the sentence and the icon pass on the surface and on the page, by day and at night (`contrast.md`).

## Rules

MDS-VOICE-04, MDS-VOICE-01, MDS-VOICE-03, MDS-A11Y-07, MDS-COMP-03, MDS-COMP-04, MDS-ICON-01, MDS-TYPE-06, MDS-COL-09.

- One sentence in the surface's register: "Henüz bir derse kaydolmadın." in Tedris, "Bu derse henüz celse planlamadınız." in Nizam.
- No illustration, no encouragement, no exclamation mark. A hidden record is not an empty state: it is in Arşiv.
- The action is `primary` only when creating something is what the surface is for ("Celse planla"); otherwise `secondary`.
