Heights 24 / 32 / 36 / 42, taken off the Figma symbols. `regular` unless there is a reason.

```jsx
<Button>Ders Oluştur</Button>
<Button variant="secondary" size="small">Talebe Ekle</Button>
<Button variant="outline">Vazgeç</Button>
<Button variant="ghost" size="mini">Daha fazla</Button>
<Button variant="destructive" iconLeft={<TrashIcon />}>Sil</Button>
<IconButton icon={<BellIcon />} label="Bildirimler" />
```

- One `primary` per surface. A second one means the screen has not decided what it is for.
- `destructive` never appears alone — it is the right-hand button of a pair whose left is `ghost`.
- `mini` is the in-row size: table actions, badge-adjacent controls. It drops to 12px text and a 4px radius, so it stops reading as a button below about 60px wide. Give it a real label or use `IconButton`.
- `IconButton` requires `label`. There is no icon in this system whose meaning survives without one.
- Hover is one ramp step darker, handled in CSS. Do not animate scale, do not add a glow.
