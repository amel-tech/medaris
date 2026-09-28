---
name: medaris-design
description: Use this skill to design or build interfaces for Medaris, the online medrese platform (müderris/talebe, dersler, ezber kartları). Contains the extracted design tokens, component library, usage rules and known accessibility gaps.
user-invocable: true
---

Read `readme.md` first — it says where every value came from and which three
decisions are still open. Then look at the cards under `foundations/`,
`components/` and `patterns/` for what the system actually looks like.

For a mock or a throwaway prototype: write static HTML, link `styles.css`, use the
`.mds-*` classes. `patterns/app-shell.card.html` is a complete screen to start from.

For production code: import the components under `components/` — they are thin
wrappers over the same CSS, so nothing drifts. Read the matching `.prompt.md`
before using one; each holds the rules that are not visible in the markup.

Lessons, weeks, course covers and live sessions have their own components —
`LessonRow`, `WeekAccordion`, `CoverPattern`, `PlatformChip`, `SessionJoin` — drawn
by `medrese.css`, with the locked, current, live and ended states built in
(MDS-DOM-04, MDS-DOM-05). Use them before composing a lesson list from generic
parts.

Icons are the names in `assets/icons.svg`; `components/icon.card.html` shows every
one. Never draw or import another glyph (MDS-ICON-01). A component writes its own
words from props with Turkish defaults (`content/ui-strings.json`); in Nizam pass
the *siz* forms (MDS-VOICE-01).

If the work is user-facing, import `tokens/a11y-overrides.css` after
`tokens/semantic.css`. Six extracted colour pairs fail WCAG AA without it, and the
`foundations/contrast-audit.card.html` card has the measurements.

The product is Turkish, and it renders Arabic. Write copy in Turkish unless asked
otherwise, and wrap Arabic runs in `lang="ar" dir="rtl" class="mds-arabic"`
(classical text: `.mds-arabic-text`) on the element itself (MDS-TYPE-04).

Before building anything, read `rules.md`, then the component's `.prompt.md`. Before
writing copy or showing a state, read `content/vocabulary.json` and
`content/status-map.json`. Each rule has an id; cite it rather than restating it.

Set `lang` and `data-app` on the root of every screen (MDS-LAY-03). Name roles, never
ramps (MDS-TOK-01). If the system lacks something, add it the system's way
(MDS-AGENT-03) — never an inline style.

In a prototype drawn inside a fixed-size artboard, dialogs and toasts are positioned
inside the frame (`position: absolute`), or the scrim escapes the artboard. Production
code uses the native `<dialog>` with `showModal()`.

Sample content is real (MDS-VOICE-06).
