A native checkbox with `role="switch"`, 36×20, inside its own label. It commits the moment it changes.

```jsx
<Switch
  label="Herkese açık"
  description="Kursa kayıtlı olmayanlar da bu ders kaydını izleyebilir."
  checked={herkeseAcik}
  onChange={(e) => kaydet({ herkeseAcik: e.target.checked })}
/>
```

## Anatomy (HTML)

```html
<label class="mds-choice">
  <input type="checkbox" role="switch" class="mds-switch" checked aria-labelledby="s1-l" aria-describedby="s1-d">
  <span class="mds-choice__text">
    <span class="mds-choice__label" id="s1-l">Herkese açık</span>
    <span class="mds-choice__desc" id="s1-d">Kursa kayıtlı olmayanlar da bu ders kaydını izleyebilir.</span>
  </span>
</label>
```

Native attributes go to the `<input>`; `className` goes to the `<label>`. The knob is `.mds-switch::after`, placed with `inset-inline-start` and moved with `translate`, so it starts and ends on the correct side in RTL.

## States

- **Off:** `--background-neutral-tertiary` track, white knob. 1.23:1, track against white and knob against track: SPEC-D3-21, named, not fixed.
- **On:** `--background-brand-primary` track, the knob at inline-end; white knob 9.46:1 on it. Hover `--background-brand-secondary`, 5.93:1.
- **Focus:** `--ring-focus` (OPEN-1); forced colours use the outline from `tokens/base.css`.
- **Disabled:** the whole choice at 50%.
- **Forced colours:** the track is outlined, the knob `CanvasText`; on, a `Highlight` track and a `HighlightText` knob.

## A11y contract

- Announced as a switch, on or off; Space toggles it. The component writes no "Açık" or "Kapalı".
- Named by the label span alone (`aria-labelledby`); the description is its `aria-describedby`, never part of the name. The hit area is the whole label, at least 24px tall.
- The off state does not reach 3:1 in the base system (SPEC-D3-21); the label and the knob's position carry it until that is decided.

## Rules

MDS-A11Y-02, MDS-A11Y-05, MDS-A11Y-06, MDS-A11Y-08, MDS-LAY-05, MDS-MOT-01, MDS-SHAPE-01, MDS-COMP-06.

- A switch commits immediately. If the change waits for a Save button, it is a Checkbox.

## From #95

None: #95 has no switch; `.mds-switch` is canonical.
