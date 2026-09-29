# Madrasah Design Rules

Authoritative, enforceable rules for writing UI in this monorepo. Written for an agent
(or engineer) doing a design sync: read this file, then build. Token values live in
`tokens/tokens.json`; never hardcode a value this file gives you a token for.

## 0. Non-negotiables

1. **Never hardcode a raw value that has a token.** No `#64748b`, no `14px`, no `border-radius: 14px`.
   Use `var(--muted)`, `var(--fs-14)`, `var(--r-card)`.
2. **Do not round values to a 4/8px grid.** This system deliberately uses `7px`, `9px`, `11px`,
   `13.5px`, `12.5px`. If the token says 11px, it is 11px.
3. **Two apps, two identities.** Tedris (talebe/student) and Nizam (müderris/teacher) share tokens
   but not personality. See §2.
4. **Turkish UI copy, Ottoman-madrasah vocabulary.** See §5.
5. **Hairlines, not shadows.** Structure comes from 1px borders. Shadows are reserved (§4).

## 1. Import

```ts
// tokens as values (rarely needed — prefer CSS vars)
import { tokens, cssVar } from "@medaris/design-system";

// global CSS: import once, at the app root
import "@medaris/design-system/css";
```

```js
// tailwind.config.js
module.exports = { presets: [require("@medaris/design-system/tailwind-preset")] };
```

After that, `bg-surface-alt`, `text-muted`, `rounded-card`, `shadow-toast`, `text-fs-14`
resolve to the CSS variables — no duplicated palette in the Tailwind config.

## 2. The two apps

|  | **Tedris** (talebe) | **Nizam** (müderris) |
|---|---|---|
| Purpose | learning, discovery, motivation | management, CRUD, density |
| Body ink | `--ink-tedris` #0f172a | `--ink` #16181d |
| Hairline | `--border` #e5e7eb | `--line` #e7e8ea |
| Primary action | dark `--ink-tedris` | dark `--ink-tedris` |
| Create action | — | **green `--green`** ("Yeni Ders Aç") |
| Accent / active | blue `--accent` underline | `--nav-active` fill + green underline on sub-tabs |
| Page title | 26px / 800 | 33px / 800 |
| Card padding | `--pad-card` 16px | `--pad-card-nizam` 22px |
| Grid gap | 16px | 22px |
| Page gutter | 36px | 40px |
| Chrome | content-first, minimal | sidebar + rounded bordered panel |

**Rule:** green is *only* for creation in Nizam. Never a primary button in Tedris,
never for destructive or navigational actions.

## 3. Type

- One family: **Inter** (`--font-ui`), weights 400/500/600/700/800. `font-feature-settings: var(--font-feature-ui)`.
- **Arabic and Qur'anic text uses `--font-arabic` (Amiri) with `dir="rtl"`** and `--lh-arabic` (2).
  Arabic renders ~4-6px larger than adjacent Latin at the same optical size (e.g. 22px Amiri next to 16px Inter).
- Tracking tightens as size grows: `--tracking-display` (-0.8) → `--tracking-heading` (-0.3) → `0` at body.
- **Eyebrow labels**: 11px, weight 600, `text-transform: uppercase`, `--tracking-eyebrow` (0.6px),
  color `--muted` or `--faint`. Used for category ("SARF"), section labels ("ÖNİZLEME"), week labels.
- Never go below 10px. Body copy is 14px; dense table/meta rows 12–13.5px.

## 4. Elevation, borders, radii

- Default container: `1px solid var(--line)` + `border-radius: var(--r-card)` (14px) + white fill. **No shadow.**
- Shadows only for: floating round buttons (`--shadow-float`), sticky enroll card (`--shadow-sticky-card`),
  inline editors (`--shadow-inline-editor`), toasts (`--shadow-toast`), dialogs (`--shadow-dialog`),
  video player (`--shadow-player`). All are wide, soft, negative-spread lifts — never a hard drop shadow.
- Radii ladder in practice: inputs 8 (`--r-input`), buttons 10–11, cards 14, panels 16, pills 999.
- Dialog scrim: `--scrim-dialog` + `backdrop-filter: blur(2px)`.
- **Modals inside a fixed-size frame** (canvas artboard, embedded preview) must use `position: absolute`,
  not `fixed`, so they stay inside their container.

## 5. Content & copy

- **Language: Turkish.** Domain vocabulary is Ottoman-madrasah and is *not* to be modernized:
  | term | means |
  |---|---|
  | köşk | publisher / school |
  | ders | course *and* lesson (context decides) |
  | müderris | teacher |
  | talebe | student |
  | müfredat | syllabus / curriculum |
  | müzakere | live discussion circle |
  | halka | study circle |
  | deste | flashcard deck |
  | kaynak | source / reference material |
  | icâzet | certificate of completion |
  | şerh | commentary |
  | tatbikat | practice / exercise |
- Keep diacritics: *icâzet*, *müzakere*, *Nûruosmaniye*, *Îsâgûcî*. Never strip them.
- Sentence case for everything except eyebrow labels (uppercase). No Title Case headings.
- Address the talebe informally (*"Kaldığın yerden devam et"*, *"Bu kursta öğreneceklerin"*);
  address the müderris neutrally/formally (*"Müfredat ekleyin, kaynakları bağlayın"*).
- Numbers inline with unit: *"10 hafta · 40 ders · 22 saat"*, separated by ` · `.
- Percentages are prefixed Turkish-style: **%35**, not 35%.
- **No emoji** in product UI. (One `👋` exists in a dashboard greeting exploration only.)
- Empty/absent state is written plainly, never cute.

## 6. Content taxonomy (lesson types)

Every lesson carries a type, each with a fixed color + icon + label:

| type | token | label | icon |
|---|---|---|---|
| video | `--type-video` | Video ders | play-circle |
| doc | `--type-doc` | Doküman | file-pdf |
| live | `--type-live` | Canlı halka / Canlı ders | headset |
| quiz | `--type-quiz` | Sınav | help-circle |

Badge pattern: `color: var(--type-X)` on `background: var(--X-bg)` — e.g. live uses
`--danger-bg` #fef2f2. **Current project scope: only `live` lessons are authorable in Nizam.**
Video/doc/quiz styling exists for the Tedris study screens but must not appear in the
Nizam curriculum editor.

## 7. Live lessons & meeting platforms

- A live lesson stores **a meeting URL only**. There is no platform picker.
- The platform is **resolved from the URL**: `meet.google` → Google Meet, `zoom.us` → Zoom,
  `jit.si` → Jitsi Meet; no match → "Bilinmeyen platform".
- Adding a platform = one entry in the resolver map + a `--platform-*` token pair. No UI change.
- Nizam shows the resolved platform as a confirmation chip ("bağlantıdan otomatik algılandı").
- Tedris shows **only the resolved platform's** branded join card. Students never see alternatives.
- Müzakere akışı (agenda) is authored in Nizam as time + title rows and displayed to the
  talebe as a vertical timeline on the lesson page.

## 8. Status vocabulary

| state | fg / bg |
|---|---|
| Yayında | `--white` on `--ink-tedris` (Nizam card badge) |
| Taslak | `--white` on `--slate-500` |
| Aktif | `--success-fg` on `--success-bg` |
| Tamamlandı | `--success-fg` on `--success-bg` |
| Devam ediyor | `--accent` on `--accent-soft` |
| Canlı ders | `--danger` on `--danger-bg` |
| Kilitli | `--faint` + `1.5px dashed var(--border)` |

## 9. Layout

- `display: flex` / `grid` with `gap` for **all** sibling groups. Never margin-spaced inline siblings.
- Tedris page: optional top header + content, max `--content-max` (1440px), gutter 36px;
  detail pages are `1fr` + `--aside-w` (360px) with a sticky right column.
- Nizam page: `--sidebar-w` (268px) sidebar + a rounded bordered panel holding a breadcrumb bar
  and a scrolling body with `--pad-page-x-nizam` (40px) gutters.
- Prose caps at `--reading-max` (720px).
- Progress is always a 5–6px pill track on `--surface-sunken`, filled `--accent`
  (or `--success` at 100%).

## 10. Motion

Functional only: disclosure chevron rotation, rail collapse, hover tint. Use `--dur-fast`
for hover, `--dur-base` for layout, `--ease-standard`. **No** entrance animations,
parallax, bounce, or scroll-triggered reveals.

## 11. Iconography

Single line-icon set: `stroke="currentColor"`, `stroke-width: 1.6`, round caps and joins,
24×24 viewBox, rendered 11–22px. No filled icons except: rating star (`--amber`),
completed check-circle (`--success`), play triangle, and the 6-dot drag grip.
Do not mix in a second icon library.

## 12. Things this system does not do

Gradient backgrounds as decoration (only the soft `oklch` course-cover patterns and media
scrims), glassmorphism, colored left-border accent cards, emoji as iconography, illustration
mascots, dark mode (not yet defined — do not invent one), rounded-full avatars in Nizam
(squares there, circles in Tedris).
