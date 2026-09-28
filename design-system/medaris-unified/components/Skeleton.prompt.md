A grey bar that stands in for a line of content while it loads, shaped like the line that is coming.

```jsx
<div aria-busy="true">
  <span className="mds-visually-hidden">Dersler yükleniyor</span>
  <Skeleton width="60%" height="var(--space-md)" />
  <Skeleton width="90%" />
  <Skeleton width="75%" />
</div>
```

## Anatomy (HTML)

```html
<div aria-busy="true">
  <span class="mds-visually-hidden">Dersler yükleniyor</span>
  <div class="mds-skeleton" aria-hidden="true" style="--mds-skeleton-w: 60%; --mds-skeleton-h: var(--space-md)"></div>
  <div class="mds-skeleton" aria-hidden="true" style="--mds-skeleton-w: 90%"></div>
</div>
```

One bar per component. Its size is two data variables, `--mds-skeleton-w` (default 100%) and `--mds-skeleton-h` (default 12px), each a CSS length string; a height from the spacing scale, as `var(--space-md)` here. `--radius-xxs`, `--background-neutral-tertiary`, pulsing on `mds-pulse`. The loading region around the bars is the caller's.

## States

One: loading. It pulses; reduced motion stops the pulse in `base.css`.

## A11y contract

- Every bar is `aria-hidden`.
- The region that is loading carries `aria-busy="true"` and one visually hidden sentence saying what is loading, in the surface's register. Remove both when the content arrives.
- Forced colours: the bars draw in `GrayText`.

## Rules

MDS-COMP-04, MDS-SHAPE-01, MDS-MOT-01, MDS-TOK-02, MDS-LAY-01.

- Mirror the real layout's line lengths; three equal grey bars say nothing.

## From #95

No #95 component: `pr95-migration/pr95-map.json` has no entry.
