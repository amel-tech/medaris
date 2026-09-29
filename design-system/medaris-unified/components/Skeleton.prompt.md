A quiet bar that stands in for a line of content while it loads, shaped like the line that is coming.

```jsx
<div aria-busy="true">
  <span className="mds-visually-hidden">Dersler yükleniyor</span>
  <Skeleton width="62%" height="var(--space-4)" />
  <Skeleton width="88%" />
</div>
```

## Anatomy (HTML)

```html
<div aria-busy="true">
  <span class="mds-visually-hidden">Dersler yükleniyor</span>
  <div class="mds-skeleton" aria-hidden="true" style="--mds-skeleton-w: 62%; --mds-skeleton-h: var(--space-4)"></div>
  <div class="mds-skeleton" aria-hidden="true" style="--mds-skeleton-w: 88%"></div>
</div>
```

- One bar per component, with `--radius-mark` (2) corners.
- Its size is two data variables, each a CSS length string: `--mds-skeleton-w` (default 100%) and `--mds-skeleton-h` (default 12px). Take a height from the spacing scale, as `var(--space-4)` for a title line here.
- It pulses on `mds-pulse`. The fill is `--border-neutral-subtle`, the hairline colour: decoration, never behind text. The hover fill would all but vanish on the night surface. No colour is passed in.
- The loading region around the bars is the caller's.

## States

One: loading. It pulses; reduced motion stops the pulse in `base.css`.

## A11y contract

- Every bar is `aria-hidden`. It carries no text, so no contrast pair applies.
- The region that is loading carries `aria-busy="true"` and one visually hidden sentence saying what is loading, in the surface's register. Remove both when the content arrives.
- Forced colours: the bars draw in `GrayText`.

## Rules

MDS-COMP-04, MDS-SHAPE-01, MDS-MOT-01, MDS-TOK-02, MDS-LAY-01, MDS-VOICE-01.

- Mirror the real layout's line lengths: a title line, then a longer meta line. Three equal bars say nothing.
