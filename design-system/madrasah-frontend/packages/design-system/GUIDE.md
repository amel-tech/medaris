# Madrasah Design Guide

Design system for **Medaris / Online Madrasah** (https://medaris.app) — a platform for
classical madrasah education. Two products share this system:

- **Tedris** — the talebe (student) app: discovering köşks, taking courses, sitting in live
  müzakere circles. Content-first, motivational, roomy.
- **Nizam** — the müderris (teacher) management app: creating and editing köşks, courses,
  curricula and flashcard decks. Dense, fast, CRUD-shaped.

They share every token but deliberately differ in personality; see
`packages/design-system/DESIGN_RULES.md` §2 for the full split.

## Sources

This system was extracted from the high-fidelity design work in this project — it is the
canonical record of those decisions, not a reinterpretation.

- Product: **https://medaris.app**
- Design source: the original Tedris and Nizam screen explorations, which live in the
  design file (not vendored here).
- Nizam screens were recreated from screenshots of the live app supplied by the team
  (Desteler, Deste detail, Köşkler, Köşk detail, Kursu Düzenle).
- No Figma file or application codebase was attached. **If one exists, attach it** —
  exact values from source beat values inferred from a rendering.

## Domain vocabulary

The product speaks Ottoman-madrasah Turkish. These words are the domain model, not flavour
text, and must never be modernised or translated in UI copy:

| term | meaning |
|---|---|
| köşk | publisher / school that offers courses |
| ders | course *and* lesson — context decides |
| müderris | teacher |
| talebe | student |
| müfredat | syllabus / curriculum |
| müzakere | live discussion session |
| halka | study circle |
| deste | flashcard deck |
| kaynak | source / reference material |
| icâzet | certificate of completion |
| şerh | commentary on a classical text |
| tatbikat | practice / exercise |
| emsile, bina, avâmil, izhâr, îsâgûcî | names of classical texts taught |

---

## CONTENT FUNDAMENTALS

**Language.** Turkish throughout, with diacritics preserved: *icâzet*, *müzakere*,
*Nûruosmaniye*, *Îsâgûcî*, *Fâtih*, *mufâ'ele*. Stripping them is a bug. Arabic appears as
primary content (classical text, conjugations, flashcard faces) and is always set in Amiri,
RTL.

**Casing.** Sentence case everywhere — *"Yeni kurs oluştur"*, *"Müderris ve kaynaklar"*,
*"Bu kursta öğreneceklerin"*. Title Case is never used. The single exception is the eyebrow
label: 11px, weight 600, UPPERCASE, +0.6px tracking — used for category (`SARF`,
`TEFSIR`), section markers (`ÖNİZLEME`, `İÇERİK`) and week labels (`HAFTA 3`).

**Person.** Tedris addresses the talebe informally, second person singular:
*"Kaldığın yerden devam et"*, *"Bugün 2 dersin ve 1 canlı halkan var"*,
*"Bu kursta öğreneceklerin"*. Nizam addresses the müderris neutrally and instructionally,
with imperatives: *"Müfredat ekleyin, kaynakları bağlayın ve talebelere açın"*,
*"Halkanın hangi platformda yapılacağını seçin"*. Never mix the two registers.

**Numbers and units.** Always inline with the unit and joined by a middle dot:
*"10 hafta · 40 ders · 22 saat"*, *"6 hafta · 4 ders · 1 kaynak"*. Percentages are
Turkish-prefixed: **%35**, never 35%. Durations are *"31 dk"*, *"60 dk"*, *"22 sa"*.
Times are 24-hour with a weekday abbreviation: *"Cmt 21:00"*, *"Pzt 21:00"*.

**Buttons** are verbs or verb phrases, 1–3 words: *"Derse devam et"*, *"Halkaya katıl"*,
*"Yeni Ders Aç"*, *"Taslak Kaydet"*, *"Canlı dersi kaydet"*, *"Yayımla"*. Never
*"Gönder"*/"Submit"-style generics.

**Hints and empty states** are plain and factual, one sentence: *"Birkaç cümle ile dersin
amacı ve hedef kitlesi."*, *"Boş bırakırsanız platform üzerinden otomatik oluşturulur."*,
*"Talebeler yalnızca seçtiğiniz platformu görür."* No encouragement, no jokes, no
exclamation marks.

**Tone overall:** scholarly and calm. The product is a madrasah, not a bootcamp — there is
no gamification language, no "Awesome!", no streak celebration copy (a streak *count*
exists in one dashboard exploration; it is stated, not celebrated).

**Emoji: no.** Product UI contains none. A single `👋` appears in one dashboard-greeting
layout exploration and should not be treated as licence to add more.

---

## VISUAL FOUNDATIONS

**Overall vibe.** Quiet, paper-white, editorial. Structure comes from 1px hairlines and
generous whitespace, not from color or shadow. The interface recedes so that text —
often Arabic — is the loudest thing on screen.

**Color.** One blue accent (`--accent` #1d4ed8) for progress, active tabs and links in
Tedris; one green (`--green` #0f9d63) reserved *exclusively* for creation actions in Nizam;
dark near-black (`--ink-tedris` #0f172a) for primary buttons in both. Everything else is
neutral grey. Semantic color is narrow and consistent: red = live, amber = quiz/rating,
green = complete. Backgrounds are white or one of two barely-there greys
(`--surface-alt` #f8fafc, `--surface-sunken` #f3f4f6). **Max two background tones per
screen.**

**Type.** A single family — **Inter** — at 400/500/600/700/800, with
`font-feature-settings: "ss01","cv11"`. **Amiri** for all Arabic. The scale runs 10→34px
and includes half-steps (11.5, 12.5, 13.5, 14.5) that are load-bearing; do not round them.
Tracking tightens as size grows (−0.8px at 33px → 0 at 14px). Body copy is 14px with
1.55 line-height; prose caps at 720px.

**Backgrounds and imagery.** There is no photography and no illustration. Course and köşk
covers are **procedural**: a soft two-stop `oklch` wash at a subject-specific hue with a
low-opacity arabesque arc pattern (`CoverPattern`). Hue is stable per subject
(Sarf 145/28, Nahiv 270/200, Mantık 60, Akaid 340, Tefsir 165, köşk 215). Media overlays use
a bottom-up black scrim, never a colored gradient. **No decorative gradients anywhere else** —
the only other gradient is the faint top-down page wash on a course hero.

**Corner radii.** A tight ladder: 8px inputs, 10–11px buttons, 12–14px cards, 16px panels,
999px pills and avatars. Avatar tiles inside cards use 10–12px squares; person avatars are
circles in Tedris and squares in Nizam.

**Cards.** 1px `--line`/`--border` hairline, 14px radius, white fill, **no shadow**.
That is the default container and it appears everywhere. Optional full-bleed media slot on
top and a divider-separated meta footer. Hover adds only a border-color/background shift —
no lift, no scale.

**Shadows.** Reserved and always wide, soft and negative-spread — a "lift", never a drop.
Only six places earn one: the round floating play button (`--shadow-float`), the sticky
enroll card (`--shadow-sticky-card`), an inline editor opening inside a form
(`--shadow-inline-editor`), toasts (`--shadow-toast`), dialogs (`--shadow-dialog`) and
the video player (`--shadow-player`).

**Transparency and blur.** Used twice: the dialog scrim (`rgba(15,23,42,.55)` +
`backdrop-filter: blur(2px)`), and translucent white chips sitting on top of cover art
(`rgba(255,255,255,.94)`). Nothing else is glassy.

**Borders vs capsules.** Status uses filled capsules (pills). Structure uses hairlines.
A colored left-border accent card — a common AI trope — does **not** exist in this system
and must not be introduced.

**Animation.** Functional only, and sparse: 150ms hover tint, 200ms disclosure-chevron
rotation and sidebar-rail collapse. No entrance animation, no parallax, no bounce, no
scroll-triggered reveal. Easing is plain `ease`.

**Hover states.** Border-color and/or background shift at 150ms. Interactive cards get
`cursor: pointer` and a border shift. Sidebar rows tint to `--nav-active`. Links darken
(`#1739a8`) and underline.

**Press / selected states.** Selection is expressed as *fill*, not motion: an active pill
fills dark, an active sidebar row fills `--nav-active`, a selected quiz option gets a 2px
`--accent` border plus `--accent-soft` fill. Nothing shrinks or scales on press.

**Progress.** Always a 5–6px pill track on `--surface-sunken`, filled `--accent`,
flipping to `--success` at 100%. A ring variant exists for dashboard tiles only.

**Layout rules.** Flex/grid with `gap` for every sibling group — never margin-spaced inline
elements. Tedris: optional top header, 1440px max width, 36px gutters, detail pages split
`1fr` + a 360px sticky aside. Nizam: a 268px sidebar beside a rounded bordered panel that
owns a breadcrumb bar and a scrolling body at 40px gutters. Narrow rails are 66px
(icon-only) or 300px (master list). Modals inside fixed-size frames must be
`position: absolute`, not `fixed`.

**Dark mode.** Not defined. Do not invent one.

---

## ICONOGRAPHY

**One set, hand-authored, no library.** All icons are inline SVG on a 24×24 viewBox with
`stroke="currentColor"`, `stroke-width="1.6"`, `stroke-linecap="round"` and
`stroke-linejoin="round"`, rendered at 11–22px depending on adjacent type size. Because they
use `currentColor` they inherit text color automatically — that is how lesson-type coloring
works.

The set is shipped as `Icon` (`packages/design-system/src/components/brand/Icon.jsx`) with
~40 glyphs covering navigation (home, book, table, sidebar, chevrons, arrows), objects
(pdf, doc, calendar, clock, certificate, shield, lock, bookmark, link), people (users),
actions (plus, trash, eye, close, check, download, upload, share, filter, settings, more)
and content types (playCircle, headset, quiz).

**Filled icons are the exception**, and only four exist: the rating star (always
`--amber`), the completed check-circle (`--success`), the solid play triangle, and the
6-dot drag grip. Everything else is a stroke icon.

**No icon font, no sprite sheet, no CDN icon library.** Do not add Lucide, Heroicons,
Font Awesome or Material Icons — mixing stroke weights is immediately visible. If a needed
glyph is missing, add it to `Icon.jsx` at 1.6 stroke weight rather than importing a set.

**Emoji are never used as iconography.** Unicode characters are not used as icons either,
with one typographic exception: the middle dot ` · ` as a meta separator.

**Brand marks** live in `assets/logo-madrasah.svg` (navy rounded square, dome + mihrab —
Tedris/Madrasah) and `assets/logo-nizam.svg` (dark shell, light arch — Nizam), and are
also available as the `Logo` component. Do not redraw, recolor or rotate them.

---

## Index

| path | what it is |
|---|---|
| `tokens/tokens.json` | canonical token source of truth |
| `DESIGN_RULES.md` | enforceable rules — read before writing UI |
| `SYNC.md` | sync contract & team workflow |
| `README.md` | consuming the package: imports, Tailwind, nx targets |
| `src/css/` | generated CSS custom properties |
| `src/tokens.ts` | generated typed token values + `cssVar` refs |
| `src/tailwind-preset.js` | generated Tailwind theme |
| `src/components/` | React components + per-component `.d.ts` and `.prompt.md` |
| `docs/index.html` | **open this** — the browsable design system |
| `docs/foundations/` | token specimen pages |
| `docs/kits/` | Tedris & Nizam reference screens |
| `MANIFEST.json` | per-file hashes + rollup fingerprint |

### Components

| group | components |
|---|---|
| brand | `Icon`, `Logo`, `CoverPattern` |
| core | `Button`, `IconButton`, `Badge`, `Pill`, `Avatar` + `AvatarStack`, `Card`, `ProgressBar` + `ProgressRing` |
| forms | `Field`, `Input`, `Textarea`, `Select`, `CheckboxRow` |
| navigation | `Breadcrumb`, `Tabs`, `SidebarItem` |
| data | `DataTable`, `WeekAccordion`, `LessonRow` |
| feedback | `Dialog`, `Toast` |

#### Intentional additions

These have no single counterpart in the source screens but were extracted because the
pattern repeats verbatim across them:

- **`Icon`** — the source defines the glyph set inline in `shared.jsx`; wrapping it gives
  one place to enforce the 1.6 stroke weight.
- **`DataTable`** — the Nizam Desteler and Köşkler screens hand-roll the same CSS-grid
  table; this generalises it without changing any value.
- **`Field`** — label/required/hint markup repeated in every Nizam form section.

### Current project scope

Only **live lessons** (`type="live"`) are authorable in Nizam at this stage. `video`,
`doc` and `quiz` styling exists because the Tedris study screens render them, but the
Nizam curriculum editor must not offer them. Live lessons store **a meeting URL only** —
the platform (Meet / Zoom / Jitsi) is resolved from that URL, never picked from a list.

## Caveats

- **Fonts are CDN-hosted Google Fonts** (Inter, Amiri). No binaries are vendored. Self-host
  and replace `src/css/fonts.css` with real `@font-face` rules before production.
- **No Figma file or app codebase was provided.** Values were extracted from the design
  work in this project; Nizam screens additionally from screenshots. Attach the real source
  and these can be tightened.
- **No dark mode, no responsive/mobile breakpoints** are defined — both apps are designed
  at desktop widths (1280–1440px) only.
