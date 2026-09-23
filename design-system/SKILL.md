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

If the work is user-facing, import `tokens/a11y-overrides.css` after
`tokens/semantic.css`. Six extracted colour pairs fail WCAG AA without it, and the
`foundations/contrast-audit.card.html` card has the measurements.

The product is Turkish, and it renders Arabic. Write copy in Turkish unless asked
otherwise, and give Arabic runs `--font-arabic`, 1.9 leading and `dir="rtl"` on the
element itself.
