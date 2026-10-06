# Medaris Doğrulama — manual verification dashboard

A local dashboard for the manual acceptance test round (MDRS-248). It has no
dependencies: one Node server (`server.mjs`, `node:*` only) and one page
(`index.html`). The UI is in Turkish because the testers are.

## Run

```bash
node tools/dogrulama-panosu/server.mjs
```

Then open http://localhost:5320. Requirements: Node 20+, `gh` logged in to
`amel-tech/medaris`, and `python3` for the workflow collector.

| Variable | Default | Meaning |
| -- | -- | -- |
| `PORT` | `5320` | HTTP port (binds to 127.0.0.1 only) |
| `MEDARIS_REPO` | `../..` from this folder | repo checkout to read |
| `DOGRULAMA_MAC` | unset | ssh host of a second machine whose Claude Code workflow runs should also be read |

## What it reads

- **`gh pr list`**: the stacked `release/stack-*` PRs, their CI, CodeRabbit
  reviews and changed files (cached for 60 s; files for 10 min).
- **`local_docs/ekranlar/`** (git-ignored, optional): `PLAN.md` adds screens to
  each package, and `_kontrol/stack-NN/turN.md` plus its PNGs add the browser
  check reports and screenshots. Without that folder, the package list comes
  from `gh` only and the cards have no screenshots.
- **`durum/`**: `acilis.json` (launch scope), `kapilar.json` (gates),
  `onem.json` (importance base scores) and `surec.json` (AI work plan) are
  committed seed config. `onaylar.json` (your approvals) and `tahmin.json`
  (hourly estimate history) are written at runtime and git-ignored, so each
  tester keeps their own.

## What it shows

- **Day timeline**: the bar fills from 09:00 to the deadline. Its colour
  follows the completion percentage. The animation escalates in five stages
  with elapsed time. Later deadline tiers (00:00, 03:00, 06:00, 09:00) stay
  hidden until the previous one passes with work left. Past 95 % the whole page
  shows a damage effect. 🎬 replays every stage in 5 seconds.
- **Day board**: the current task, with a dev link and Approve / Problem
  buttons. Below it come the next tasks with estimated start times, 5 at a
  time, and the completed tasks with times. The "Sıradaki işler" header burns
  with a dependency-free WebGL2 shader: flames, a glowing burn front, charring,
  dripping melt, smoke and sparks, growing with the same five stages. It
  pauses when the tab is hidden or the header is off screen, draws one still
  frame under reduced motion, and falls back to CSS flames without WebGL2.
- **Plan**: tasks grouped by project in the order Landing → Tedris → Nizam →
  Nazar (optional), with the launch scope first inside each group.
- **Launch impact**: once a check outside the launch scope is approved, any
  shared screens or files with launch-scope packages raise a follow-up check.
  The card gives the affected share of the 9 launch steps and the reason.
- **Estimates**: each card has an estimated duration. The server rewrites the
  estimates every hour and corrects them by your measured pace. The heat icon
  counts the rewrites; click it to see when each one happened.
- **🔗**: dev web and API URLs, with the current task's app first.

## Files

| File | Purpose |
| -- | -- |
| `server.mjs` | HTTP server and every calculation (plan, estimates, impact, tiers) |
| `index.html` | the page: styles, rendering, animations |
| `topla.py` | reads Claude Code workflow run state from `~/.claude/projects` |
| `acilis-tohum.sql` | seed for a local `acilis_db` (4 köşks, 1 medrese, 6 courses) |
