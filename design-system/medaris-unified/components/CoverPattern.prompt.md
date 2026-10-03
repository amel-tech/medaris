The cover of a course, köşk or medrese, drawn as a bound book: flat bookcloth in one of four tones, with a blind-stamped double frame and a şemse. Use it wherever a cover image would go.

```jsx
<CoverPattern seed={course.id} label="الصرف" />
<CoverPattern seed={course.id} size="lg" label="الصرف" />
<CoverPattern seed={course.id} size="xs" />
<CoverPattern tone="zumrut" size="sm" label="Siyer" />
```

## Anatomy (HTML)

```html
<div class="mds-cover mds-cover--bordo">
  <p class="mds-eyebrow mds-cover__label" lang="ar" dir="rtl">الصرف</p>
</div>
<div class="mds-cover mds-cover--zumrut mds-cover--sm">
  <p class="mds-eyebrow mds-cover__label" dir="auto">Siyer</p>
</div>
<div class="mds-cover mds-cover--laciverd mds-cover--xs"></div>
```

- **Cloth.** `.mds-cover--{tone}` fills the cover with `--cover-{tone}`, flat, with `--radius-mark` (2px). An inset shadow draws the spine on the inline-start side; it moves to the other side under `dir="rtl"`. A 1px `--border-neutral-control` edge keeps the dark cloth visible on the night page.
- **Stamp.** `::after` is the double frame: a border and an outline, 9px and 13px in from the edge (6px and 9px on `sm`). `::before` is the şemse with its two salbek, a CSS mask 62% of the cover's height. Both are `--stamp-on-cover`. A labelled `sm` cover drops the şemse and keeps the frame: at 84px the şemse would run into the label. There is no SVG and no id per instance.
- **Label.** `--text-on-cover`, centred at the foot. A Latin label is an eyebrow: 12px, 600, uppercase in Turkish. An Arabic label is Naskh 16/600, and 18 on `lg`. The component sets `lang="ar" dir="rtl"` on a label written in Arabic script; `labelLang` overrides that.
- **Sizes.** `md` (140px tall) takes no size class. `.mds-cover--sm` is 84, `.mds-cover--lg` 220. `.mds-cover--xs` is a 24 × 32 swatch for a table row: no stamp, no label. The cover fills its container's width, so the page decides the shape: a 3:4 book on the course page, a band in a card's media slot.
- **Tone.** `tone` when given. Otherwise `seed` hashed: FNV-1a 32-bit over the UTF-8 bytes of `seed` (offset basis 2166136261, prime 16777619, `Math.imul`, `>>> 0`), mod 4 into `laciverd, bordo, zumrut, murekkep`. With neither, `murekkep`. `coverTone(seed)`, exported beside the component, gives the same tone to any other surface that has to agree with the cover.

## The label

The label names the science, not the course: the title already sits beside the cover. Use the science's Arabic name, or a short Latin word when the page is for readers who do not read Arabic.

| science | label |
| -- | -- |
| Sarf | الصرف |
| Nahiv | النحو |
| Mantık | المنطق |
| Akaid | العقائد |
| Hadis | الحديث |
| Siyer | السيرة |
| Fıkıh | الفقه |
| Tefsir | التفسير |
| Belâgat | البلاغة |
| Tecvid | التجويد |

## States

None. A cover has no hover, focus or status, and it looks the same by day and by night. The label is optional.

## A11y contract

- Decorative. The stamp is CSS and the root has no role. The label is real text, read in order; leave it out when the words beside the cover already say it. An `xs` swatch is empty, so it reads as nothing.
- The label is `--text-on-cover` on every cloth: 8.69:1 on zümrüt at the lowest, 13.16:1 on mürekkep (`contrast.md`, "Covers"). The cloths are domain tokens, so the ratios are the same in both themes.
- The stamp is ornament (1.93:1 on lâciverd) and carries nothing.
- In forced colours the stamp is hidden and a `CanvasText` border keeps the cover's extent.

## Rules

MDS-COL-07, MDS-SHAPE-01, MDS-SHAPE-04, MDS-TYPE-04, MDS-TYPE-05, MDS-TYPE-07, MDS-TOK-01, MDS-LAY-05, MDS-COMP-01.

- One course, one cloth, everywhere it appears: `seed={course.id}`, or the tone its manager chose. Never pick a tone per screen.
- No badge or status chip on a cover. The four cloths carry no status.
- In a card it goes in the `media` slot; on the course page it is `lg`; in a Nizam table row it is `xs`, beside the title.
- Never a photo, a gradient or a flat grey box in its place.
