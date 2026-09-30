A native checkbox with `role="switch"`, 36×20, inside its own label. It commits the moment it changes.

```jsx
<Switch
  label="Takvimde görünsün"
  description="Kayıtlı talebelerin takviminde celsenin sayfasına bağlanır."
  checked={takvimde}
  onChange={(e) => kaydet({ takvimde: e.target.checked })}
/>

<Switch label="Metinde harekeler" checked={hareke} onChange={(e) => setHareke(e.target.checked)} />
```

## Anatomy (HTML)

```html
<label class="mds-choice">
  <input type="checkbox" role="switch" class="mds-switch" checked aria-labelledby="s1-l" aria-describedby="s1-d">
  <span class="mds-choice__text">
    <span class="mds-choice__label" id="s1-l">Takvimde görünsün</span>
    <span class="mds-choice__desc" id="s1-d">Kayıtlı talebelerin takviminde celsenin sayfasına bağlanır.</span>
  </span>
</label>
```

Native attributes go to the `<input>`; `className` goes to the `<label>`. The knob is `.mds-switch::after`, 14px, 2px in from the edge. It is placed with `inset-inline-start` and moved 16px with `translate`, so it starts and ends on the correct side in RTL.

## States

- **Off:** a `--background-neutral-field` track with a `--border-neutral-control` edge; the knob is `--border-neutral-control` too. The knob has no shadow. Hover: the edge turns `--border-neutral-strong`.
- **On:** the action fill `--background-action-bold` (ink by day, paper by night), the knob at inline-end in `--text-neutral-on-bold`. Hover: `--background-action-bold-hover`.
- **Focus:** the ring from `tokens/base.css`, around the track.
- **Disabled:** a `--background-neutral-sunken` track with a `--border-neutral-subtle` edge; the knob is `--text-neutral-disabled`, on or off. The label and description turn `--text-neutral-disabled`. There is no opacity.
- **Motion:** the knob moves over `--duration-fast`; reduced motion is handled once, in `tokens/base.css`.
- **Forced colours:** the track has a `CanvasText` edge and a `CanvasText` knob. On, a `Highlight` track and a `HighlightText` knob. Disabled, a `GrayText` edge and knob, on or off.

## A11y contract

- Announced as a switch, on or off; Space toggles it. The component writes no "Açık" or "Kapalı".
- Named by the label span alone (`aria-labelledby`); the description is its `aria-describedby`, never part of the name. The hit area is the whole label, at least 24px tall.
- The off state is visible without colour: the knob is 3.89:1 on the track by day and 4.61:1 by night, and the track's edge is at least 3:1 on every ground. On, the knob is 16.60:1 on the fill by day and 14.43:1 by night. One focus ring, in both themes. Every pair is in `contrast.md`.

## Rules

MDS-A11Y-01, MDS-A11Y-02, MDS-A11Y-05, MDS-A11Y-06, MDS-A11Y-08, MDS-A11Y-11, MDS-COL-08, MDS-LAY-05, MDS-MOT-01, MDS-SHAPE-01, MDS-COMP-06.

- A switch commits immediately. If the change waits for a Save button, it is a Checkbox.
- A switch is never invalid: there is nothing to submit.
- On the mütalaa folio, "Metinde harekeler" acts on the matn only, never on the Qur'an; "Meâl" shows or hides the meâl.
