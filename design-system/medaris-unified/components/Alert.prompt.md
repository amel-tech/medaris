States what happened, then what to do about it. Two lines. A third line means it should have been a dialog.

```jsx
<Alert>
  Ders içerikleri, toplantı bağlantıları ve ders kayıtları kayıtlı talebelere açıktır. Derse kaydolduğunda görebilirsin.
</Alert>
<Alert tone="warning" title="Cumartesi celsesinin toplantı bağlantısı eksik">
  Talebeler bağlantı olmadan celseye katılamaz. Celse başlamadan ekleyin.
</Alert>
<Alert tone="error" title="Değişiklikler kaydedilemedi">
  İnternet bağlantısı kesildi. Yeniden bağlandığınızda tekrar deneyin.
</Alert>
```

## Anatomy (HTML)

```html
<div class="mds-alert mds-alert--error" role="alert">
  <span class="mds-alert__icon" aria-hidden="true"></span>
  <div>
    <p class="mds-alert__title">Değişiklikler kaydedilemedi</p>
    İnternet bağlantısı kesildi. Yeniden bağlandığınızda tekrar deneyin.
  </div>
</div>
```

- `.mds-alert` plus one tone: `--neutral` (the default), `--info`, `--success`, `--warning` or `--error`.
- The fill is the tone's tint: `--background-neutral-sunken` for neutral, `--background-{tone}-subtle` for the others.
- Padding 12 / 16, `--radius-surface`, 14px text, and a transparent 1px edge that forced colours paint.
- **Only the glyph and the title carry the tone.** They take `--text-{tone}-default`; neutral's glyph is `--text-neutral-muted`. The words stay in `--text-neutral-default`.
- `.mds-alert__icon` is an empty span. The class layer draws the glyph from the sprite as a 16px mask: `info` for neutral and info, `check` for success, `warning` for warning and error.
- The title is optional, 14/600.

## States

None of its own. An alert is persistent page state. It stays until what it reports changes.

## A11y contract

- `error` renders `role="alert"`, which interrupts a screen reader. Every other tone renders `role="status"`, which waits its turn. A caller's `role` wins, for a notice that is not news at all.
- The glyph is decorative. The title and the text carry the meaning (MDS-COL-03).
- Both themes: the tone text and the ink pass AA on every tint, by day and at night (`contrast.md`, "Text on tints").
- It mirrors in an Arabic region with no extra class: the glyph sits at inline-start.
- Forced colours: the edge shows in `CanvasText`, and the glyph draws in `CanvasText`.

## Rules

MDS-VOICE-07, MDS-VOICE-04, MDS-VOICE-05, MDS-COL-03, MDS-COL-08, MDS-SHAPE-01, MDS-ICON-01, MDS-LAY-05, MDS-A11Y-08, MDS-TOK-07, MDS-COL-09.

- Pick the tone by MDS-VOICE-07. Neutral explains or restricts: why a lesson's body is locked, an enrolment refused for one course.
- `info` reports news the reader did not cause and need not act on: a ders kaydı that is still processing.
- `warning` asks this reader to act. `error` reports an action that failed. `success` confirms.
- Persistent page state is an Alert. Confirming an action the user just took is a toast. A validation error belongs on the Field.
