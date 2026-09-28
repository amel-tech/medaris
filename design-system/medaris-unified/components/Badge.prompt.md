A 24px label that states a fact about the row it sits in. Never clickable. Its label, variant and icon for a domain state come from `content/status-map.json`.

```jsx
<Badge variant="brand">Devam ediyor</Badge>
<Badge variant="live">Şu an canlı</Badge>
<Badge variant="success">Tamamlandı</Badge>
<Badge variant="outline">Taslak</Badge>
<Badge icon={<Icon name="video" size="sm" />}>Canlı ders</Badge>
<Badge icon={<Icon name="clock" size="sm" />}>Onay bekliyor</Badge>
```

## Anatomy (HTML)

```html
<span class="mds-badge mds-badge--brand">Devam ediyor</span>
<span class="mds-badge mds-badge--live"><span class="mds-badge__dot" aria-hidden="true"></span>Şu an canlı</span>
<span class="mds-badge mds-badge--secondary"><svg class="mds-icon mds-icon--sm" viewBox="0 0 256 256" aria-hidden="true" focusable="false">…</svg>Canlı ders</span>
```

`.mds-badge` plus one variant. The dot comes first, then the icon, then the label. `variant="live"` always draws the dot; `dot` adds it to any other variant. The default variant is `secondary`.

## States

None: a badge is a state, printed. Two families:

- **Identity**, what a thing is: `primary` (and a published course, "Yayında"), `secondary`, `outline` ("Taslak"), `ghost` ("Gizli", "Sona erdi"), `destructive`.
- **Progress**, how it is going: `brand` ("Devam ediyor", 8.24:1), `live` ("Şu an canlı", 5.30:1, with its dot), `success`, `warning`, `info`. `secondary`, `outline` and `ghost` may stand in a progress column as its neutral state.

## A11y contract

- The label is the information; colour, the dot and the icon only repeat it. The dot and the icon are `aria-hidden`.
- A badge is not interactive and takes no focus. A clickable chip is `ChoiceChips`.
- Forced colours: the border becomes visible and the dot draws in `CanvasText`.

## Rules

MDS-STAT-01, MDS-COL-03, MDS-COL-05, MDS-COL-08, MDS-SHAPE-01, MDS-VOICE-02, MDS-ICON-01, OPEN-2, SPEC-D3-03.

- `live` is only a session's live-now state; the lesson type "Canlı ders" is `secondary` with the `video` icon.
- Do not mix the two families in one column.
- `warning` (1.79:1 as extracted) and `destructive` (white on it 3.76:1) inherit OPEN-2, and `info` (4.24:1) SPEC-D3-03. No launch state uses them: "Onay bekliyor", "Başvuru", "Bağlantı eksik" and "Yasaklı" are neutral with an icon, and the status map records the tone each takes once the decision is made.
- `primary`'s label is `--text-brand-inverse`, not white: the Figma file's choice.

## From #95

`pr95-migration/pr95-map.json#components.Badge`
