32 / 40 / 56. A person is always a paper circle with muted initials. An institution or object is a small bookcloth tile.

```jsx
<Avatar name="İsmail Hakkı Efendi" />
<Avatar name="Mehmed Âkif Ersoy" size="lg" src={photo} />
<Avatar name="Süleymaniye Medresesi" entity />
<Avatar name="Abdülhamit Karaosmanoğlu" decorative /> Abdülhamit Karaosmanoğlu
```

## Anatomy (HTML)

```html
<span class="mds-avatar" role="img" aria-label="İsmail Hakkı Efendi">İH</span>
<span class="mds-avatar mds-avatar--lg" role="img" aria-label="Mehmed Âkif Ersoy"><img src="…" alt=""></span>
<span class="mds-avatar mds-avatar--entity" role="img" aria-label="Süleymaniye Medresesi">SM</span>
<span class="mds-avatar" aria-hidden="true">AK</span>
```

- `md` (40) takes no size class; `--sm` is 32 and `--lg` 56.
- A person: `--radius-full`, `--background-neutral-sunken` with an inset `--border-neutral-subtle` hairline, and `--text-neutral-muted` initials in `--font-ui` 600.
- `--entity`: a square on `--radius-tag`, the `--cover-laciverd` cloth with no hairline, and `--text-on-cover` initials in Literata. It looks the same by day and at night, like the covers.
- With `src` the photo fills the shape and the initials are not drawn.
- `initials(name, locale)` is exported for other code that needs the same letters. Several avatars together are `AvatarStack`.

## States

None.

## A11y contract

- Standalone: `role="img"` named by `name`. The photo inside is `alt=""`, because the span already carries the name.
- `decorative` when the name is printed beside it: `aria-hidden`, no role. Without a `name` it is always hidden.
- No `title=`: it is not a tooltip (MDS-A11Y-10).
- Initials are upper-cased in the page's locale (the nearest `lang`, else `tr-TR`): `i` becomes `İ`.
- A Latin-script name on an Arabic-script page gets `lang="tr"`, so its initials stay in Instrument Sans at the Latin size (MDS-TYPE-07). In static markup, write that `lang` on the span yourself.
- Both themes: the muted initials pass AA on the sunken fill, and the cover ink on the lâciverd cloth (`contrast.md`).
- Forced colours: the fill is painted over, so the shape gets a `CanvasText` border.

## Rules

MDS-SHAPE-03, MDS-SHAPE-01, MDS-COL-07, MDS-TYPE-05, MDS-TYPE-07, MDS-NUM-01, MDS-VOICE-06, MDS-A11Y-04, MDS-A11Y-10, MDS-COMP-06, MDS-COL-08, MDS-COL-09.

- Initials are the first letters of the first and the last word. They skip the lower-case particles `b.`, `bin`, `ibn`, `bt.`, `bint` and the honorifics Efendi, Bey, Hanım, Hoca. So "Ahmed b. Hanbel" is AH, "İsmail Hakkı Efendi" İH, "Mehmed Âkif Ersoy" ME, and two talebe named "Zeynep Kübra" keep their surnames apart (ZD, ZA). Two letters at most; a one-word name gives one.
- No per-person colour: every person is the same paper circle, and every entity the same lâciverd cloth.
