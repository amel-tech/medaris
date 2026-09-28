Confirms, in one line, something the user just did. It renders inside the app's one `<Toaster>`; state that has to stay on the page is an `Alert`.

```jsx
<Toast
  title="Kart 12 talebeye atandı"
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
    <p class="mds-toast__title">Kart 12 talebeye atandı</p>
    <p class="mds-toast__desc">…</p> <!-- description -->
    <div class="mds-toast__action"><button type="button" class="mds-btn mds-btn--mini mds-btn--ghost">Geri al</button></div>
  </div>
  <button type="button" class="mds-btn mds-icon-btn mds-btn--mini mds-btn--ghost mds-toast__close" aria-label="Kapat"></button>
</div>
```

- The tone glyph is a CSS mask: `check` for success, `info` for info, `warning` (the circled mark) for warning and error, 16px on the title's first line.
- The action sits under the text, so a 300px toast keeps its title on one line. The close button is there only with `onClose`.
- The toast has no role of its own: the Toaster's region announces it.

## States

- **Tones.** success, info, warning, error; `success` by default.
- **Timing.** success and info close themselves after 6 s, or 10 s with an action; the timer pauses while the pointer or the focus is on the toast. warning and error stay until someone closes them, so they need `onClose`.
- **Static.** Without `onClose` there is no close button and no timer (a mock).
- **Focus.** The close and action buttons draw `--ring-focus`, whose colour is OPEN-1 (1.26:1 on white).
- **Forced colours.** The glyph takes `CanvasText` and the close glyph `ButtonText`; the hairline border stays.

## A11y contract

- Rendered inside the Toaster, it is announced by the `role="status"` region (success, info) or the `role="alert"` region (warning, error). It never moves focus.
- Its action and close button are reachable in the "Bildirimler" region; reaching them pauses the timer.
- `closeLabel` (default "Kapat") names the close button. An author string in `title` or `description` goes in `<bdi>`.

## Rules

MDS-VOICE-03, MDS-VOICE-02, MDS-VOICE-04, MDS-VOICE-07, MDS-COL-03, MDS-MOT-01, MDS-SHAPE-02, MDS-ICON-01, MDS-A11Y-09, MDS-TYPE-07, MDS-COMP-06, OPEN-1.

- A toast confirms what this user just did. Page state is an Alert; a validation error belongs on its Field, never in a toast.
- Its action must also exist elsewhere ("Geri al" in Arşiv): a toast disappears, so it is never the only way.
- It does not slide or fade in.
- The warning glyph is 1.92:1 on white: it inherits OPEN-2, and the title carries the meaning.
- Title 14 semibold (the canonical card's 13 bold, moved onto the control scale), description 12, `--radius-s`, `--elevation-raised`.

## From #95

`pr95-migration/pr95-map.json#components.Toast`
