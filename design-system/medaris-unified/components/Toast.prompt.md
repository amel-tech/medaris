Confirms, in one line, something the user just did. It renders inside the app's one `<Toaster>`. State that has to stay on the page is an `Alert`.

```jsx
<Toast
  title="Kurs gizlendi"
  description="Arşiv’den geri alabilirsiniz."
  action={<Button variant="ghost" size="mini" onClick={undo}>Geri al</Button>}
  onClose={() => dismiss(id)}
/>
<Toast
  tone="error"
  title="Toplantı bağlantısı kaydedilemedi"
  description="Sunucuya ulaşılamadı. Tekrar deneyin."
  onClose={() => dismiss(id)}
/>
```

## Anatomy (HTML)

```html
<div class="mds-toast mds-toast--success">
  <span class="mds-toast__icon" aria-hidden="true"></span>
  <div class="mds-toast__body">
    <p class="mds-toast__title">Kurs gizlendi</p>
    <p class="mds-toast__desc">Arşiv’den geri alabilirsiniz.</p> <!-- description -->
    <div class="mds-toast__action"><button type="button" class="mds-btn mds-btn--mini mds-btn--ghost">Geri al</button></div>
  </div>
  <button type="button" class="mds-btn mds-icon-btn mds-btn--mini mds-btn--ghost mds-toast__close" aria-label="Kapat"></button>
</div>
```

- A paper slip: the surface fill, a hairline, `--radius-surface` and `--elevation-raised`. It casts a shadow because it floats over the page; nothing at rest does.
- The title is 14/600 in default text. The description is 13 in `--text-neutral-subtle`.
- The tone glyph is a CSS mask in the tone's text colour, 16px, on the title's first line: `check` for success, `info` for info, `warning` for warning and error.
- The action sits under the text, so a 320px toast keeps its title on one line. The close button is a mini ghost icon button (24px), there only with `onClose`.
- The toast has no role of its own: the Toaster's region announces it.

## States

- **Tones.** success, info, warning, error; `success` by default.
- **Timing.** success and info close themselves after 6 s, or 10 s with an action. The timer pauses while the pointer or the focus is on the toast. warning and error stay until someone closes them, so they need `onClose`.
- **Static.** Without `onClose` there is no close button and no timer (a mock).
- **Focus.** The close and action buttons draw the one ring from `tokens/base.css`.
- **Forced colours.** The glyph takes `CanvasText` and the close glyph `ButtonText`. The hairline stays.

## A11y contract

- Rendered inside the Toaster, it is announced by the `role="status"` region (success, info) or the `role="alert"` region (warning, error). It never moves focus.
- Its action and close button are reachable in the "Bildirimler" region. Reaching them pauses the timer.
- `closeLabel` (default "Kapat") names the close button. An author string in `title` or `description` goes in `<bdi>`.
- Both themes: the glyph and every text pass on the surface by day and at night (`contrast.md`).

## Rules

MDS-VOICE-03, MDS-VOICE-02, MDS-VOICE-04, MDS-VOICE-07, MDS-COL-03, MDS-MOT-01, MDS-SHAPE-01, MDS-SHAPE-02, MDS-ICON-01, MDS-A11Y-09, MDS-TYPE-07, MDS-COMP-06, MDS-COL-08, MDS-COL-09.

- A toast confirms what this user just did. Page state is an Alert; a validation error belongs on its Field, never in a toast.
- Its action must also exist elsewhere ("Geri al" in Arşiv). A toast disappears, so it is never the only way.
- It does not slide or fade in.
