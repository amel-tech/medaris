States what happened, then what to do about it. Two lines. A third line means it should have been a dialog.

```jsx
<Alert>
  Ders içerikleri, toplantı bağlantıları ve ders kayıtları kayıtlı talebelere açıktır. Kursa kaydolduğunda görebilirsin.
</Alert>
<Alert tone="error" title="Değişiklikler kaydedilemedi">
  İnternet bağlantısı kesildi; yeniden bağlandığınızda tekrar deneyin.
</Alert>
```

## Anatomy (HTML)

```html
<div class="mds-alert mds-alert--error" role="alert">
  <span class="mds-alert__icon" aria-hidden="true"></span>
  <div>
    <p class="mds-alert__title">Değişiklikler kaydedilemedi</p>
    İnternet bağlantısı kesildi; yeniden bağlandığınızda tekrar deneyin.
  </div>
</div>
```

`.mds-alert` plus one tone: `--neutral` (the default), `--info`, `--success`, `--warning`, `--error`. `.mds-alert__icon` is an empty span: the class layer draws the tone's glyph from the sprite as a mask — `info` for neutral and info, `check` for success, `warning` for warning and error — 16px, in the tone's colour (neutral: `--icon-neutral-tertiary`). The title is optional.

## States

None of its own: an alert is persistent page state and stays until what it reports changes.

## A11y contract

- `error` renders `role="alert"` (it interrupts a screen reader); every other tone `role="status"` (it waits its turn). A caller's `role` wins, for a notice that is not news at all.
- The icon is decorative; the title and text carry the tone (MDS-COL-03).
- Neutral text is 16.19:1 on its fill and its icon 6.90:1. As extracted, warning text is 1.79:1 and error text 3.95:1 on their tints (OPEN-2); info is 4.24:1 either way (SPEC-D3-03).
- Forced colours: the border stays and the icon draws in `CanvasText`.

## Rules

MDS-VOICE-07, MDS-VOICE-04, MDS-VOICE-05, MDS-COL-03, MDS-COL-08, MDS-SHAPE-01, MDS-ICON-01, MDS-A11Y-08, OPEN-2, SPEC-D3-03.

- The tone follows MDS-VOICE-07. Neutral is the launch tone for explanations and restrictions: why a lesson's body is locked, that a recording can take hours, an enrolment refused for one course.
- `warning` inherits OPEN-2, and `info` fails at 4.24:1 (SPEC-D3-03): a notice that only informs is neutral until that is decided.
- Persistent page state is an Alert; confirming an action the user just took is a toast; a validation error belongs on the Field.

## From #95

No #95 component: `pr95-migration/pr95-map.json` has no entry.
