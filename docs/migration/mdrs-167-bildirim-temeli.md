# MDRS-167 — In-app notification foundation (screen tedris/36)

**Status:** executed on `release/stack-37-bildirim-temeli` (stack package 37), not merged
**Issue:** [MDRS-167](https://linear.app/amel-tech/issue/MDRS-167)
**Design:** `tedris/36-bildirimler` (canvas notes outside the repo)
**Base:** `release/stack-24-ui-kit-katman`

What this package adds: the notification table and its four endpoints in
tedrisat, the `/notifications` page in tedris-web, the bell's accessible name,
and a small `Menu` in the shared kit. What it does **not** add: any producer —
nothing writes a notification yet.

## 1. What was done

### tedrisat

- Table `notifications` (migration `0026_notifications.sql`, hand-rollback in
  `rollbacks/0026_notifications.down.sql`). A row holds `type`, `params`
  (flat jsonb), `target_type`/`target_id`, `read_at`, `created_at`. It holds
  **no sentence**: the web app words it from `type` and `params` in the reader's
  language. `user_id` is the Keycloak `sub`, no foreign key (like every other
  user column).
- Four routes, all behind `AuthGuard` only (no `AuthzGuard`: every query is
  scoped to `request.user.sub`, so another person's row is indistinguishable
  from a missing one):
  - `GET /notifications?status=all|unread&cursor=&limit=` — newest first,
    keyset-paged on `(created_at, id)`, opaque cursor, `limit` 1–50 (default 20).
  - `GET /notifications/unread-count` — returns `{ unread, total }`. The
    `total` is not in the spec's route name; the "Tümü" tab shows a count, and a
    second endpoint for it was not worth a round trip.
  - `POST /notifications/:id/read` — idempotent (first `readAt` is kept), 404
    for an unknown id or someone else's.
  - `POST /notifications/read-all` — returns `{ updated }`.
- `NotificationModule` exports `NotificationService.notify(...inputs)`, the
  entry point a producer module will call. `created_at` is written by the
  application at millisecond precision, not by the column default: the cursor
  travels as a JavaScript `Date`, and a microsecond default would never compare
  equal to its own cursor.
- OpenAPI (`libs/services/swagger-docs/tedrisat.json`) and the generated client
  were regenerated with `pnpm run openapi:tedrisat`; `assert:openapi-fresh`
  passes. `api-factory.ts` exposes `notifications` and the four response types.

### tedris-web

- `/[locale]/notifications` (layout, page, loading). The layout loads
  `@medaris/ui/medaris.css` and the faces with the segment, the same
  arrangement as the medrese pages, and wraps the page in the kit's
  `AppProviders` (toast and tooltip roots).
- Page: "Bildirimler" heading and subtitle, "Tümünü okundu say", "Tümü"/"Okunmamış"
  tabs with counts, BUGÜN / DÜN / DAHA ÖNCE groups (cut at midnight in the
  viewer's zone), rows with type icon, title link, sentence, "source · time",
  "Yeni" badge and a "…" menu, the "Neler bildirilir" card, loading skeleton,
  empty states, an error state with retry, "Daha fazla göster" for further pages.
- Reading is optimistic and rolls back with an error toast when the API refuses
  (spec "Okundu işaretleme hatası"). Clicking a row's title marks it read and
  navigates.
- Header bell: now a link to `/notifications` whose `aria-label` is
  "Bildirimler, N okunmamış" (or "Bildirimler" for 0). The count is not drawn.
- i18n: `tedris.NotificationsPage` and two keys under `tedris.UserNotifications`,
  in tr, en and ar.
- Shell: `container` in the header, tab strip, main and footer became
  `mx-auto w-full max-w-[80rem]`, because loading `medaris.css` resets
  Tailwind's breakpoint variables and `container` loses its width. This is the
  same edit stack-27 (MDRS-157) makes; see §4.

### ui

- `@medaris/ui/mds/menu` (Base UI `Menu` behind an icon-only ghost `.mds-btn`,
  `.mds-popup` and `.mds-option`). Canvas rule 22 lists Menu as a component the
  system does not have yet; this is the first consumer.

## 2. Behaviour deliberately left out

- **E-mail.** "E-posta tercihleri" and the sentence "Celse davetlerini
  e-postayla da alabilirsin." are not rendered: e-mail needs SMTP (class C
  part of the spec, and the package note says to leave it out).
- **Producers.** No module calls `NotificationService.notify`. The spec's
  sources (enrollment approve/reject, session cancel/reschedule, köşk
  application, deck publish request) either do not exist yet or belong to later
  packages; wiring only the two that do would have changed `CourseService` for
  a feature with no consumer. Until a producer lands the list is empty in a
  real environment.
- **"…" menu content.** The design does not show it (spec: "doğrulanamadı").
  The menu has one item, "Okundu say", and is drawn only for unread rows; a
  read row has nothing to offer. There is no "okunmadı say" endpoint.
- **Empty-state wording** ("Bildirim yok", "Okunmamış bildirim yok") is the
  spec's own "metin doğrulanamadı" text.

## 3. What was verified

Every number below is from this branch's gate run (see §5 for the commands).

- `typecheck`, `test`, `build`, `lint`, `module-boundaries`, all `--skip-nx-cache`:
  green. `pnpm run lint:root` (Biome ratchet): no count above its baseline.
  `pnpm run assert:openapi-fresh`: 57 paths, identical.
- tedrisat: 22 new tests — 13 unit (cursor round-trip and refusals, paging,
  clamping, 404, read-all, notify) in `test/unit/notification/notification.spec.ts`
  and 9 e2e against a real Postgres (Testcontainers) in
  `test/e2e/notification.e2e.spec.ts`: list order and both counts, paging with no
  skipped or repeated row (including rows sharing one timestamp), 400 on a bad
  filter/limit/cursor/uuid, another person's rows never listed, counted or
  changed (acceptance 5), read keeps the first `readAt`, read-all, empty list,
  `notify`.
- tedris-web: three spec files (view logic and sentences in tr/en/ar for all 9
  types, day groups across the UTC/Istanbul midnight, href building; list state
  transitions; static render of the page for the design's six rows, empty,
  error and "more" states).
- ui: `Menu` (2 tests, happy-dom).

## 4. What could not be verified

- **No browser run.** There is no Playwright suite in this branch's base:
  stack-27 (MDRS-157) adds it, on a branch this one is not based on, and a
  second copy here would only collide with it. The spec's e2e scenario
  (seed → `/notifications` → "Okunmamış" 3 → open one → 2 → read all → 0) is
  covered in pieces — the API half against a real database, the page half by
  static render — but **not end to end in a browser**, and the signed-in page
  was not looked at against `ekran.png`. The first package that has both
  Playwright and a seeded signed-in session should add that scenario.
- The `Menu` was exercised in happy-dom only; its popup positioning, focus
  return and the `.mds-option` highlight were not seen in a real browser.
- Arabic strings were written without a native review.
- RTL and the night theme were not checked.

### Rebasing onto stack-27

Both packages edit `apps/tedris/components/{header/header,legal-footer/index,tab-view/index}.tsx`
(the same `container` → `max-w-[80rem]` swap, so those hunks are identical),
`libs/services/swagger-docs/tedrisat.json`, the generated client's `FILES`,
`apis/index.ts` and `models/index.ts`, `api-factory.ts`, and the three
`tedris.json` catalogues. The generated files should be re-run
(`pnpm run openapi:tedrisat`), not hand-merged. In `tab-view/index.tsx`
stack-27 wraps `<main>` in an `ownsItsMain` check; keep its version. This page
renders a `<div>` inside the shell's `<main>`, so it needs no exemption.

## 5. Gate

```bash
pnpm nx run-many -t typecheck --skip-nx-cache
pnpm nx run-many -t test --skip-nx-cache
pnpm nx run-many -t build --skip-nx-cache
pnpm nx run-many -t lint --skip-nx-cache
pnpm nx run-many -t module-boundaries --skip-nx-cache
```

Run with the shell's leaked `NODE_ENV`, `DB_PORT`, `DATABASE_URL` and
`POSTGRES_*` stripped. No workspace package was added, so the six Dockerfiles
are untouched.
