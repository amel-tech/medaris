The one host for toasts: two live regions, mounted once per app before any toast exists.

```jsx
// in the app's root layout
<Toaster>
  {toasts.map((t) => <Toast key={t.id} {...t} onClose={() => dismiss(t.id)} />)}
</Toaster>
```

## Anatomy (HTML)

```html
<section class="mds-toaster" aria-label="Bildirimler">
  <div role="status" aria-atomic="false"><!-- success and info toasts --></div>
  <div role="alert" aria-atomic="false"><!-- warning and error toasts --></div>
</section>
```

- Fixed at the bottom inline-end, 24px in and 300px wide; below 768 it spans the width, 16px in.
- Both regions exist while empty: a live region created together with its content is not announced. `aria-atomic="false"` reads the new toast, not the whole stack.

## States

- **Empty.** Two empty regions; nothing is covered.
- **Showing.** The newest three children show; older ones wait and appear as newer ones close. While any shows, the height it covers from the viewport's bottom edge is written to `--mds-fixed-end` on `<html>`; when it empties, whatever another fixed layer had written there comes back.

## A11y contract

- One per app, mounted before the first toast.
- A region landmark named by `label` (default "Bildirimler"), so a keyboard or screen-reader user can reach a toast's action.
- It sorts children by their `tone`: warning and error into `role="alert"`, the rest into `role="status"`.
- A focused control never ends up under it: `base.css` turns `--mds-fixed-end` into scroll padding.
- An open modal dialog makes the toaster inert and covers it; raise the toast once the dialog has closed.

## Rules

MDS-A11Y-09, MDS-TOK-02, MDS-LAY-04, MDS-LAY-05, MDS-COMP-06.

- `--mds-fixed-end` is a data variable on `<html>`, set with `document.documentElement.style.setProperty`, never declared in a class layer.
- This binding takes its toasts as children. A toast store (sonner and the like) may render the same markup into the same two regions instead.

## From #95

None: #95 positions each Toast itself (`anchored`); `pr95-migration/pr95-map.json#components.Toast` moves that position here.
