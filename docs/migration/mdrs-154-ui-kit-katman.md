# MDRS-154 — the layer half of the unified kit, on Base UI

MDRS-154 is package 24 of the screen-canvas plan: the overlay, feedback,
disclosure, shell and display components of the unified design system as React
components in `libs/ui/src/mds/`, plus the app-root provider setup. It builds on
MDRS-153 (the form half). No screen is built here; the first screens that
consume the kit start with package 25.

## What was done

Components, all in `libs/ui/src/mds/`, imported as `@medaris/ui/mds/<file>`.
Markup follows each component's `.prompt.md` in
`design-system/medaris-unified/components/` and canvas rules 2 to 21.

On Base UI (8 files):

| File | Component | Base UI parts |
| -- | -- | -- |
| `dialog.tsx` | `Dialog`, `DialogTrigger`, `DialogClose` | `Dialog.Root/Trigger/Portal/Backdrop/Viewport/Popup/Title/Description/Close`; a `form` dialog wraps the panel in `Form` |
| `alert-dialog.tsx` | `AlertDialog`, `AlertDialogTrigger` | the same parts from `AlertDialog`; focus starts on "Vazgeç" |
| `toast.tsx` | `ToastProvider`, `Toaster`, `useToaster`, `toastTiming` | `Toast.Provider/Portal/Viewport/Root/Title/Description/Action/Close`, `useToastManager` |
| `avatar.tsx` | `Avatar`, `initials` | `Avatar.Root/Image/Fallback` |
| `progress.tsx` | `Progress` | `Progress.Root/Label/Track/Indicator` |
| `week-accordion.tsx` | `Weeks`, `WeekAccordion` | `Accordion.Root` (`multiple`, `hiddenUntilFound`) / `Item/Header/Trigger/Panel` |
| `app-bar.tsx` | `AppBar` (bar + phone nav sheet) | `Dialog` with `Popup.mds-sheet` |
| `app-providers.tsx` | `AppProviders` | `DirectionProvider`, `Tooltip.Provider delay={600}`, `Toast.Provider limit={3}`, `className="isolate"` |

Native, no `data-baseui` (16 new files; `Icon` and `Logo` came with MDRS-153, which
makes the 18 of rule 6): `Alert`, `AvatarStack`, `Badge`, `Breadcrumb`, `Card`,
`CoverPattern`, `EmptyState`, `LessonRow`, `NavItem`, `NavSection`,
`PlatformChip`, `SessionJoin`, `Skeleton`, `Stat`, `SystemState`, `Table`.
Sorting and paging stay with the caller (TanStack Table); `Table` draws the
state and reports the click. `locale.tsx` holds the shared page-locale hook,
Intl helpers and the `joinRun` separator logic that the JSX files each
repeated.

Shell components (`app-shell.tsx`), the libs/ui half of canvas note 29 table 3:
`AppShell`, `Sidebar`, `TopBar`. They place with Tailwind utilities on logical
properties (rule 33, 35); the look of what they hold is the `.mds-*` layer.

CSS: `styles/mds/baseui.css` grew by the parts the system does not have yet.
`.mds-scrim` and `.mds-dialog-viewport` (rule 12), z-index for the sheet, and
two fixes where Base UI differs from the native elements the class layer was
written for (see below). `components.css` and `medrese.css` are untouched.

Tests: three specs, 56 new tests (`native.spec.tsx` 23, `medrese.spec.tsx` 16,
`overlay.spec.tsx` 17). `libs/ui` is at 84 tests with the MDRS-153 ones.

## Decisions that differ from the canvas notes

- **The shadcn files stay**, as in MDRS-153: `components/dialog.tsx`,
  `alert-dialog.tsx`, `sheet.tsx`, `sonner.tsx`, `avatar.tsx`, `badge.tsx`,
  `card.tsx`, `table.tsx` and the rest keep serving the apps that are not
  migrated. The new components sit beside them in `src/mds/`.
- **`Weeks` plus `WeekAccordion`.** The design system's `WeekAccordion` is one
  week inside a `div.mds-weeks`. On Base UI the Accordion root owns the open
  state, so the container is a component too (`Weeks`) and each week is an
  `Accordion.Item`. `Weeks` opens the `state="active"` weeks at first, which is
  the system's default.
- **Toast.** The system draws two live regions (`role="status"` and
  `role="alert"`) sorted by tone. Base UI has one `Viewport` region
  (`aria-live="polite"`) and announces each toast through its own role
  (`dialog`, or `alertdialog` when `priority: "high"`). `useToaster().notify`
  maps the rule-21 timing onto that: success and info 6 s (10 s with an action),
  warning and error `timeout: 0` and `priority: "high"`. The `--mds-fixed-end`
  scroll-padding variable the Toaster writes in the system is not written.
- **The Dialog is not a native `<dialog>`.** The system's CSS styles `.mds-dialog`
  and `.mds-sheet` as top-layer `<dialog>`s. Base UI renders a Popup in a Portal,
  so `.mds-scrim` (fixed, z 60) and `.mds-dialog-viewport` (fixed, z 61, grid
  centre) were added, and the sheet gets z 61. The `<html>` scroll lock the
  system does with `html:has(.mds-dialog[open]:modal)` is Base UI's own.
- **Toast roles and the class layer.** `.mds-toaster > [role]` is the system's
  rule for its two regions; Base UI's toasts are `[role]` children of the one
  viewport, so the rule reached the toasts and made them columns. `baseui.css`
  restores the row for `.mds-toaster > .mds-toast[role]`.
- **`hidden="until-found"`.** The system's `.mds-week__panel[hidden] { display: none }`
  would defeat `hiddenUntilFound`; `baseui.css` shows the `until-found` state so
  the browser's find-in-page can open a collapsed week (rule 7).
- **The scope picker** (köşk / medrese seçici, rule 18 and note 29 `.ekran-kapsam`)
  is a prop of `AppBar` and `Sidebar` (`scope`), not a component: rule 23 leaves
  Select versus Menu open, and the first screen that has one (nizam) decides.
- **The giriş shell** (`.ekran-giris`) is not built here; package 25 owns
  `libs/ui/src/giris`.

## What was verified

- `tsc -b` for `libs/ui`, and the whole gate (below).
- 84 vitest tests in happy-dom, 56 of them new. They assert the markup contract:
  class names, roles, aria and data attributes, behaviour that happy-dom can run.
  Among them, from the rule-20 "doğrulanmadı" list: Dialog Popup is
  `role="dialog"`, AlertDialog is `role="alertdialog"`, a toast is `dialog` and
  an urgent one `alertdialog`, Accordion's trigger carries `aria-expanded`
  (several open at once), Progress carries `aria-valuenow/min/max/valuetext` and
  is named by its visible label, Esc closes a Dialog, and AlertDialog's initial
  focus lands on "Vazgeç".
- The initials rule (`Ahmed b. Hanbel` AH, `İsmail Hakkı Efendi` İH, `Zeynep Kübra
  Demirci` ZD), the cover-tone hash (FNV-1a, deterministic), the session-join
  window (the link appears 10 minutes before the start, never for a cancelled or
  locked celse), and the course/viewer time-zone pair (`21:00 İstanbul` and
  `20:00 senin saatinle`).

## What was not verified

- **Nothing was run in a real browser.** happy-dom does not lay out CSS, so the
  look (scrim, viewport centring, the sheet's width, toast stacking, the
  chevron, find-in-page opening a week) is unconfirmed against the design
  system's cards. No Playwright e2e was added: there is no screen or API in this
  package, and the canvas decision for MDRS-153 stands (the first package with a
  screen, 25, sets up the one Nx e2e target).
- Pointer dismissal (`disablePointerDismissal` for form and confirm dialogs),
  focus return to the opener, and focus containment are Base UI behaviour the
  specs do not exercise.
- Toast live-region announcement (rule 20: two regions with `priority`) is not
  heard with a screen reader; the Viewport is a single polite region.
- `AppBar` closing the sheet when the window widens past 767px listens to
  `matchMedia("(min-width: 768px)")`; happy-dom has no real resize, so that
  path has no test.
- Forced-colours and night rendering of the new `baseui.css` rules.
