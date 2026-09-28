32 / 40 / 56. A person is always a circle, an institution or object a square tile; brand tint behind the initials when there is no photo.

```jsx
<Avatar name="Ahmed Hüsrev Efendi" />
<Avatar name="Zeynep Kübra" size="lg" src={photo} />
<Avatar name="Süleymaniye Medresesi" entity />
<Avatar name="İsmail Hakkı" size="sm" decorative /> İsmail Hakkı
```

## Anatomy (HTML)

```html
<span class="mds-avatar" role="img" aria-label="Ahmed Hüsrev Efendi">AH</span>
<span class="mds-avatar mds-avatar--lg" role="img" aria-label="Zeynep Kübra"><img src="…" alt=""></span>
<span class="mds-avatar mds-avatar--entity" role="img" aria-label="Süleymaniye Medresesi">SM</span>
<span class="mds-avatar mds-avatar--sm" aria-hidden="true">İH</span>
```

`md` (40) takes no size class; `--sm` is 32, `--lg` 56. `--entity` is the square on `--radius-s`. With `src` the photo fills the circle and the initials are not drawn. `initials(name, locale)` is exported for other code that needs the same letters. Several avatars together are `AvatarStack`.

## States

None.

## A11y contract

- Standalone: `role="img"` named by `name`. The photo inside is `alt=""`, because the span already carries the name.
- `decorative` when the name is printed beside it: `aria-hidden`, no role. Without a `name` it is always hidden.
- No `title=`: it is not a tooltip (MDS-A11Y-10).
- Initials are upper-cased in the page's locale (the nearest `lang`, else `tr-TR`): `i` becomes `İ`.
- Forced colours: the fill is painted over, so the shape gets a `CanvasText` border.

## Rules

MDS-SHAPE-03, MDS-SHAPE-01, MDS-TYPE-05, MDS-NUM-01, MDS-COL-02, MDS-VOICE-06, MDS-A11Y-04, MDS-A11Y-10.

- Initials are the first letters of the first and the last word, skipping the lower-case particles `b.`, `bin`, `ibn`, `bt.`, `bint` and the honorifics Efendi, Bey, Hanım, Hoca: "Ahmed b. Hanbel" is AH, "İsmail Hakkı Efendi" İH, "Mehmed Âkif Ersoy" ME, so two talebe named "Zeynep Kübra" keep their surnames apart (ZD, ZA). Two letters at most; a one-word name gives one.
- No per-person colour: every avatar is the brand tint.

## From #95

`pr95-migration/pr95-map.json#components.Avatar`
