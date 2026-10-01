A 24px label that states a fact about the row it sits in. Never clickable. Its label, variant and icon for a domain state come from `content/status-map.json`.

```jsx
<Badge variant="primary">Yayında</Badge>
<Badge variant="outline">Taslak</Badge>
<Badge variant="ghost" icon={<Icon name="eyeOff" size="sm" />}>Gizli</Badge>
<Badge variant="brand">Devam ediyor</Badge>
<Badge variant="live">Şu an canlı</Badge>
<Badge variant="warning" icon={<Icon name="clock" size="sm" />}>Onay bekliyor</Badge>
<Badge variant="destructive" icon={<Icon name="ban" size="sm" />}>Yasaklı</Badge>
<Badge icon={<Icon name="video" size="sm" />}>Canlı ders</Badge>
```

## Anatomy (HTML)

```html
<span class="mds-badge mds-badge--primary">Yayında</span>
<span class="mds-badge mds-badge--live"><span class="mds-badge__dot" aria-hidden="true"></span>Şu an canlı</span>
<span class="mds-badge mds-badge--warning"><svg class="mds-icon mds-icon--sm" viewBox="0 0 256 256" aria-hidden="true" focusable="false">…</svg>Onay bekliyor</span>
```

`.mds-badge` plus one variant. The dot comes first, then the icon, then the label. `variant="live"` always draws the dot; `dot` adds it to any other variant. The default variant is `secondary`.

## Look

24px high, inline padding 8, gap 6, `--radius-tag` (4), Instrument Sans 13/500, line-height 1, one line. A 1px edge is transparent unless the variant draws it, so forced colours can outline every badge. A glyph inside a badge is drawn at 14px.

| variant | look | used for |
| -- | -- | -- |
| `primary` | `--background-neutral-hover`, default text at 600, no edge | "Yayında" |
| `secondary` | `--background-neutral-sunken`, muted text | "Planlandı", "Canlı ders" with its glyph |
| `outline` | transparent, a dashed `--border-neutral-control` edge, muted text | "Taslak", "İptal edildi" |
| `ghost` | transparent, no padding, subtle text, usually with a glyph | "Gizli" (`eyeOff`), "Sona erdi" |
| `destructive` | `--background-error-subtle`, `--text-error-default` | "Yasaklı", "1 yasaklı" (`ban`) |
| `brand` | `--background-brand-subtle`, `--text-brand-default` | "Devam ediyor" |
| `live` | `--background-live-subtle`, `--text-live-default`; the dot in `--border-live-default` | "Şu an canlı" |
| `success` | `--background-success-subtle`, `--text-success-default` | "Tamamlandı", "Kayıtlı" |
| `warning` | `--background-warning-subtle`, `--text-warning-default` | "Onay bekliyor" (`clock`), "Bağlantı eksik" (`link`) |
| `info` | `--background-info-subtle`, `--text-info-default` | "Yeni ders kaydı" |

The night theme re-points the same tokens; every label is at least 4.5:1 on its tint in both themes (`contrast.md`).

## States

None: a badge is a state, printed. Two families:

- **Identity**, what a thing is: `primary` (a published course, "Yayında"), `secondary`, `outline` ("Taslak"), `ghost` ("Gizli", "Sona erdi"), `destructive` ("Yasaklı").
- **Progress**, how it is going: `brand` ("Devam ediyor"), `live` ("Şu an canlı", with its dot), `success`, `warning`, `info`. `secondary`, `outline` and `ghost` may stand in a progress column as its neutral state.

"Yayında" is an inked tint with no edge, so it is never mistaken for an outline button such as "Onayla" beside it.

## A11y contract

- The label is the information; colour, the dot and the icon only repeat it. The dot and the icon are `aria-hidden`.
- A badge is not interactive and takes no focus. A clickable chip is `ChoiceChips`.
- Under `dir="rtl"` the same markup puts the dot and the icon at inline-start, on the right.
- Forced colours: the edge becomes `CanvasText`, and the dot draws in `CanvasText`.

## Rules

MDS-STAT-01, MDS-COL-03, MDS-COL-05, MDS-COL-08, MDS-SHAPE-01, MDS-TYPE-02, MDS-VOICE-02, MDS-ICON-01, MDS-NUM-01, MDS-A11Y-08.

- `live` is only a session's live-now state. The lesson type "Canlı ders" is `secondary` with the `video` icon.
- Red means an error, a sanction or live now. An error or a sanction always carries its glyph; live always carries its dot and the words "Şu an canlı". So the two never look alike.
- Do not mix the two families in one column.
- In a Nizam course table, a course's own state (Yayında, Taslak, Gizli) sits in its own column. Its enrolment states are counted badges in another column: "3 onay bekliyor" (`warning`, `clock`), "1 yasaklı" (`destructive`, `ban`). The words come from the row's `count` in the status map, the number from `Intl.NumberFormat` in the page locale, and a count of 0 shows no badge.
- `warning` and `destructive` are launch tones: "Onay bekliyor" (a talebe's pending state) and "Başvuru" (the same state in Nizam) are `warning` with `clock`; "Yasaklı" is `destructive` with `ban`; "Bağlantı eksik" is `warning` with `link`.
