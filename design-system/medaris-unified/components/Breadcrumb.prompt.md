Where the URL already is, root first, in 13px with `/` between levels. The last item is the current page and is never a link.

```jsx
<Breadcrumb items={[
  { label: 'Köşkler', href: '/koskler' },
  { label: 'Nûruosmaniye Köşkü', href: '/koskler/nuruosmaniye' },
  'Emsile ve Bina',
]} />
```

## Anatomy (HTML)

```html
<nav class="mds-breadcrumb" aria-label="Sayfa yolu">
  <ol class="mds-breadcrumb__list">
    <li class="mds-breadcrumb__item">
      <a class="mds-breadcrumb__link" href="/koskler"><bdi>Köşkler</bdi></a>
      <span class="mds-breadcrumb__sep" aria-hidden="true">/</span>
    </li>
    <li class="mds-breadcrumb__item">
      <a class="mds-breadcrumb__link" href="/koskler/nuruosmaniye"><span class="mds-breadcrumb__back" aria-hidden="true"></span><bdi>Nûruosmaniye Köşkü</bdi></a>
      <span class="mds-breadcrumb__sep" aria-hidden="true">/</span>
    </li>
    <li class="mds-breadcrumb__item"><span class="mds-breadcrumb__current" aria-current="page"><bdi>Emsile ve Bina</bdi></span></li>
  </ol>
</nav>
```

A level with no page of its own is `<span class="mds-breadcrumb__text">`, in the list's subtle colour. Only the parent's link, the item before the current one, carries `.mds-breadcrumb__back`. It is the sprite's `arrowLeft`, 16px, drawn as a mask. It shows only below 768 and mirrors under `dir="rtl"`. The `/` needs no mirroring. Levels are 8px apart, in `--font-ui` at 13px (`--fs-caption`).

## States

- Link: `--text-neutral-muted`. On hover `--text-neutral-default`, underlined.
- Current: `--text-neutral-default` at 500.
- Separator and a level with no page: `--text-neutral-subtle`.
- Focus: the one ring from `tokens/base.css`. Each link is at least 24px tall.
- Night: the same roles on the night page (`contrast.md`).
- Forced colours: the back glyph is `LinkText`.
- Below 768: only the parent shows, as a back link with its arrow. The current page is left to the page's own `h1`.
- One item or none (a top-level page): Breadcrumb renders nothing, so no empty navigation landmark is left behind.

## A11y contract

- `<nav aria-label="Sayfa yolu">` around an `<ol>`. `label` changes the name, and it must differ from every other `<nav>` on the page.
- The current page is `aria-current="page"` and is not a link, so the page never links to itself.
- The separators are `aria-hidden` elements, not generated content, which some screen readers announce.
- Every label is in `<bdi>`: a köşk or course title may be Arabic.

## Rules

MDS-A11Y-01, MDS-A11Y-02, MDS-A11Y-03, MDS-A11Y-04, MDS-A11Y-05, MDS-TYPE-02, MDS-TYPE-07, MDS-LAY-04, MDS-LAY-05, MDS-VOICE-02, MDS-WORD-01, MDS-COL-09.

- A breadcrumb says where the URL is, and tabs cut the object; one screen may have both.
- The items are the path of the URL, not the history of the visit.
- Titles keep their authors' casing; the system's own words are in sentence case.
