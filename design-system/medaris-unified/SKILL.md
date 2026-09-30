---
name: medaris-design
description: Use this skill to design or build interfaces for Medaris, the online medrese platform (müderris and talebe, dersler, haftalar and celseler, ezber kartları). It holds the tokens, the components, the rules and the Turkish product words of "Mürekkep ve kâğıt" (ink on paper), in a day and a night theme.
user-invocable: true
---

Read `readme.md` first, then `rules.md`. Before you use a component, read its `.prompt.md`. Before
you write copy or show a state, read `content/vocabulary.json` and `content/status-map.json`. The
cards under `foundations/`, `components/` and `patterns/` show what the system looks like.

For a mock or a throwaway prototype: write static HTML, link `styles.css` and use the `.mds-*`
classes. `patterns/app-shell.card.html` is a whole screen to start from.

For production code: import the components in `components/`. They are thin wrappers over the same
CSS, so nothing drifts.

Lessons, weeks, course covers and live sessions have their own components — `LessonRow`,
`WeekAccordion`, `CoverPattern`, `PlatformChip`, `SessionJoin` — drawn by `medrese.css`, with the
locked, current, live and ended states built in (MDS-DOM-04, MDS-DOM-05). Use them before you
compose a lesson list from generic parts.

## Non-negotiables

1. **Roles, not ramps.** Use the semantic tokens. Never a ramp step, a hex value or an `rgb()`
   (MDS-TOK-01, MDS-TOK-07).
2. **One ink primary per surface.** Lâciverd only marks where you are. Red only marks an error, a
   destructive action or a live session (MDS-COL-01, MDS-COMP-03).
3. **Day and night.** Look at every screen in both themes: add `data-theme="dark"` to `<html>`
   (MDS-COL-09).
4. **Colour never alone.** A state has words. Live has a dot and "Şu an canlı". An error has a
   glyph (MDS-COL-03).
5. **Arabic on the element.** `lang="ar" dir="rtl"` with `.mds-arabic`, `.mds-arabic-text` or
   `.mds-quran`, on the Arabic element itself. The Qur'an is only ever `.mds-quran`
   (MDS-TYPE-04).
6. **Turkish.** Sentence case. Uppercase only through CSS under `lang="tr"` (MDS-VOICE-02,
   MDS-TYPE-05). *Sen* in Tedris, *siz* in Nizam (MDS-VOICE-01).
7. **The root.** `lang`, `dir` and `data-app` on `<html>` (MDS-LAY-03); `data-density="compact"`
   on Nizam's main region (MDS-LAY-02).
8. **Icons from the sprite.** `assets/icons.svg` and nothing else. Serve the page over http, or
   the sprite does not load (MDS-ICON-01).
9. **Real words.** Labels and states come from `content/` (MDS-WORD-01, MDS-STAT-01). Sample
   content is real Turkish, never "test" or lorem ipsum (MDS-VOICE-06).
10. **Focus always shows, and disabled never fades** (MDS-A11Y-01, MDS-A11Y-11).
11. **Nothing at rest casts a shadow** (MDS-SHAPE-02).
12. **Add the system's way.** If the system lacks something, add it as MDS-AGENT-03 says. Never an
    inline style (MDS-COMP-01).

In a prototype drawn inside a fixed-size artboard, position dialogs and toasts inside the frame
(`position: absolute`), or the scrim escapes the artboard. Production code uses the native
`<dialog>` with `showModal()`.

Each rule has an id. Cite the id; do not restate the rule.
