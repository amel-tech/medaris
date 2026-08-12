# MDRS-18 — Consolidate docs and agent/editor configuration

Final link in the four-task chain MDRS-12 → MDRS-14 → MDRS-15 → MDRS-18.
Base: `7ac28d9` (MDRS-15 merge).

## What changed

| File | Change |
| --- | --- |
| `README.md` | Full rewrite. The previous text described the repo as the "future monorepo home" whose repos "will be merged in here" — that merge happened in MDRS-9, so every sentence about the pending migration was false. |
| `CLAUDE.md` | New. Root agent instructions for the merged repo. |
| `CONTRIBUTING.md` | Extended at the `MDRS-18 ANCHOR` left by MDRS-14: added "Module boundaries" and "Adding a library". Existing commit-convention and git-hook sections untouched. |
| `.env.example` | Split into shared / backend / frontend sections, with the real variable names read out of the source. |
| `docker-compose.yml` | Removed the obsolete `version: "3.8"` key that Docker warns about on every invocation. |

## Verified

Every figure below came from command output in this worktree, not from memory.

| Claim | How it was checked |
| --- | --- |
| 16 Nx projects | `pnpm nx show projects` — 7 apps + 9 libs |
| Project names differ from directory names | `apps/tedris` → `tedris-web`, `apps/nizam` → `nizam-web`, `apps/nazir` → `nazir-web`, `apps/landing` → `landing-web`, read from each `package.json` |
| Dev ports 4000–4003 | `grep '"dev"' apps/*/package.json` — `--port` flags |
| Backend ports 3001 / 3002 | `.env.example`, matches ADR-001 §D3 |
| Backend env variable names | `grep -rhoE 'process\.env\.[A-Z0-9_]+'` over `apps/{tedrisat,teskilat}/src` and `libs/common/src` — 27 names |
| Frontend env variable names | `grep -rhoE 'NEXT_PUBLIC_[A-Z0-9_]+'` over the four Next.js apps and `libs` — 6 names |
| No `paths` aliases | `grep -A14 '"paths"' tsconfig.base.json` returns nothing; resolution is workspace-link based |
| Library package shape | `libs/utils/package.json` — `main`/`types` point at `src/index.ts` |
| Hook dispatcher present | `.husky/_/pre-commit` and `.husky/_/commit-msg` exist after `pnpm install` |
| `docker compose config` parses | exit 0 (with the warnings below) |

## Not verified

- **AC #1 — "a new contributor can clone, `pnpm install`, and run any app from the README alone."** **Partially verified, and the walkthrough found a real defect.** Following the first draft of the README in a fresh worktree, `nizam-web:build` and `tedris-web:build` both failed with `Invalid environment variables`: every `apps/*/` ships its own `.env.example` and the Next.js apps validate the environment at **build** time, but the README only mentioned the root `.env.example`, which feeds `docker-compose` and not the apps. Copying `apps/<app>/.env.example` to `apps/<app>/.env` made the build pass, and the README now says so in both the quick start and the environment section. **Still not verified:** the walkthrough was done in a worktree rather than a clean `git clone`, and no app was booted and loaded in a browser — only built.
- **AC #5 — "`docker-compose.yml` brings up the full local stack."** **Not met, and not fixable here.** Measured: `docker compose config` reports `env file apps/tedrisat/.env not found`, so the app services cannot start; the compose file describes only the two Nest apps plus Postgres, with no frontend services; and the six `apps/*/Dockerfile` files still run `npm install` against `catalog:` specifiers, broken since before MDRS-10. Repairing the Dockerfiles is **MDRS-16**. Only `docker compose up -d medaris-db` works today, and the README says exactly that rather than claiming a full stack.
- Editor behaviour of `.vscode/settings.json` (`source.fixAll.biome`) — carried over unverified from MDRS-12; still needs a real VS Code session.

## AC #4 — `.claude/` exists "exactly once"

Resolved as **deliberately absent**, not as a missing file. MDRS-23 (PR #10) added `.claude/` to `.gitignore` to keep agent worktrees and local settings out of the repository. The correct end state is therefore zero tracked `.claude/` directories, and nothing was added. `.mcp.json`, `.env.example`, and the `.github/` templates each exist exactly once at the root.

`docs/PRD.md` and `docs/ecosystem-boundaries.md` were **not modified** (AC #6).

## Follow-ups

- **MDRS-16** — the six `apps/*/Dockerfile` files (`npm install` against `catalog:` specifiers) and, with them, any real `docker compose up`. The compose file also has no frontend services.
- **MDRS-13** — `CONTRIBUTING.md` documents that boundary tags do not exist yet and that the constraint is convention-only. Its anchor sits immediately above the new sections; the layer/tag table goes there.
- **MDRS-20** — frontend test coverage is zero. `pnpm test` reports three projects but `tedris-web` runs `echo 'Tests not implemented'`, which Nx counts as a pass. Real totals: 91 tests / 10 suites, both Nest apps. README states this plainly rather than reporting "3 projects tested".
- **MDRS-17** — `.migration/` still holds its 6 release-please files; untouched here.
- Minor, unowned: `libs/*/package.json` `clean` scripts still `rm -rf .turbo`, a leftover from the Turborepo era retired in MDRS-11. Harmless, but stale.
