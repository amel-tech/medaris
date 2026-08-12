# Contributing to Medaris

> **Scope of this document.** Right now it covers **commit conventions** only
> (MDRS-14). Two later tasks extend it in place, at the marked anchors near the
> bottom: **MDRS-13** adds the layer/tag table mirror (ADR-001 §D5), and
> **MDRS-18** adds the module-boundary rules and the "how to add a lib"
> procedure. Do not duplicate those sections here — fill in the anchors.

## Commit messages

Every commit must be a [Conventional Commit](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>
```

This is **enforced**, not advisory. A `commit-msg` hook runs
[commitlint](https://commitlint.js.org) against `commitlint.config.mjs` and
rejects the commit if the message does not parse.

The scope is what makes this more than style policing. This one repo publishes
**7 releasable components**, and release-please assigns each commit to a
component by the **paths it touches**, then writes the changelog entry using the
commit's type and scope. So a wrong scope will not misroute a release, but it
will put a misleading label on a real changelog entry, and it makes "which
component was this for?" unanswerable in `git log`. Keeping the scope list closed
and identical to the component names is what stops those two views from
drifting — and it rules out the free-for-all the pre-merge history had (90+
ad-hoc scopes like `flashcard`, `deck-cards`, `pcgk-lock`).

A useful side effect: release-please's own release PR titles are
`chore(<component>): release <version>`, so they satisfy these rules too.

### Rules

| Rule | Requirement |
| --- | --- |
| `type` | required, lower-case, from the type list below |
| `scope` | **required**, from the scope list below |
| `subject` | required, no trailing `.`, not Start-Case / PascalCase / ALL-CAPS |
| header length | ≤ 100 characters |
| body / footer lines | ≤ 100 characters each |
| blank line before body / footer | warning only — does not block the commit |

Everything above except the last row fails the commit. Merge, revert, fixup and
squash commits are exempt via commitlint's `defaultIgnores`, so `git revert` and
`git commit --fixup` keep working.

### Types

`build` · `chore` · `ci` · `docs` · `feat` · `fix` · `perf` · `refactor` ·
`revert` · `style` · `test`

`feat`, `fix` and anything marked breaking are the types that drive a version
bump. Exactly which types appear in a changelog is release-please's
`changelog-sections` config, which MDRS-17 still owns — do not treat the list
above as a released-vs-hidden split.

### Scopes

**Apps** — the scope is the app's **package / release-component name**, which is
not always its directory name:

| Scope | Directory | Kind |
| --- | --- | --- |
| `tedrisat` | `apps/tedrisat` | NestJS service |
| `teskilat` | `apps/teskilat` | NestJS service |
| `tedris-web` | `apps/tedris` | Next.js app |
| `nizam-web` | `apps/nizam` | Next.js app |
| `nazir-web` | `apps/nazir` | Next.js app |
| `landing-web` | `apps/landing` | Next.js app |
| `keycloak-theme` | `apps/keycloak-theme` | Keycloakify theme |

The `-web` suffix is deliberate: ADR-001 §D6 names app packages
`@medaris/<release-component>` while the directories stay bare. **Follow the
component, not the folder** — release-please cuts releases against the component.

**Libs** — scope is the directory name, matching `@medaris/<dirname>`:

| Scope | Directory |
| --- | --- |
| `common` | `libs/common` |
| `ui` | `libs/ui` |
| `icons` | `libs/icons` |
| `tokens` | `libs/tokens` |
| `hooks` | `libs/hooks` |
| `services` | `libs/services` |
| `i18n` | `libs/i18n` |
| `types` | `libs/types` |
| `utils` | `libs/utils` |

**Cross-cutting** — these release nothing on their own:

| Scope | Use for |
| --- | --- |
| `repo` | workspace wiring: pnpm, Nx, tsconfig, Biome, git hooks |
| `deps` | dependency bumps (the catalog in `pnpm-workspace.yaml`) |
| `ci` | GitHub Actions workflows |
| `docs` | ADRs, migration records, README, this file |

Touching several packages at once? Prefer splitting the commit. If the change is
genuinely indivisible workspace plumbing, use `repo`.

**Adding a scope is never a standalone edit.** Per ADR-001 §D10, a new package
lands as one PR that touches all four of: the `pnpm-workspace.yaml` `packages:`
list, the release-please component config, the release-please manifest, and the
`scope-enum` in `commitlint.config.mjs`. The scope list is also an MDRS-17
acceptance criterion.

### Breaking changes

Append `!` after the scope, and explain the migration in the body:

```
feat(tedrisat)!: require X-Tenant-Id on every enrolment endpoint

Callers without the header now get 400 instead of falling back to the
default tenant.
```

A `BREAKING CHANGE:` footer works too. Either form makes release-please cut a
major for that component.

### Examples

```
feat(nizam-web): add bulk flashcard import from xlsx
fix(common): stop swallowing validation errors in the global filter
refactor(ui)!: drop the deprecated `size="xs"` button variant
chore(deps): bump next to 16.1.6
chore(repo): unify commit hygiene at the root
docs(tedrisat): document the enrolment endpoints
ci(landing-web): add a preview deploy on pull_request
```

`type` and `scope` are separate namespaces that happen to share three names
(`build`, `ci`, `docs`). Scope the *subject matter*, not the kind of change:
`docs(tedrisat)` for docs about tedrisat, `ci(landing-web)` for that app's
workflow. The `ci` and `docs` **scopes** are only for changes with no single
owning package — `ci(ci)` for shared workflow plumbing, `docs(docs)` for content
under `docs/` such as ADRs and migration records. Root-level contributor files
(this one, `README.md`) count as repo plumbing: `docs(repo)`.

Rejected, and why:

```
Fix login bug                 # type-empty, scope-empty, subject-empty
feat: add tenant switcher     # scope-empty
feat(flashcard): ...          # scope-enum — not a package; use `nizam-web`
feat(tedris): ...             # scope-enum — directory name; use `tedris-web`
fix(ui): Broken Tooltip       # subject-case — Start-Case
fix(ui): fix the tooltip.     # subject-full-stop — trailing period
```

## Git hooks

Hooks live in `.husky/` at the **repo root** — one set for the whole workspace.
They are installed by the `prepare` script, so a plain install is all it takes:

```bash
pnpm install
```

| Hook | Runs | Why |
| --- | --- | --- |
| `pre-commit` | `lint-staged` → `biome check --write` | formats and autofixes **only the staged files** |
| `commit-msg` | `commitlint --edit "$1"` | validates the message |

`pre-commit` is intentionally cheap: it never typechecks, builds, or looks at
files you did not stage — in a 16-package workspace that is minutes per commit.
It does still **lint** the staged files, because `biome check` is lint + format
in one. Most diagnostics are autofixed silently, but an error-level one that
Biome cannot safely fix (say `suspicious/noDoubleEquals`) will fail the commit.
Full-repo verification belongs to the gate:

```bash
pnpm nx run-many -t typecheck test build lint module-boundaries
```

Because `lint-staged` autofixes and re-stages, a commit can end up containing
formatting changes you did not type. That is expected.

### Troubleshooting

**Hooks do not run at all.** Check both halves — the setting *and* the directory
it points at:

```bash
git config core.hooksPath   # expect: .husky/_
ls .husky/_/pre-commit      # must exist in THIS working tree
```

If either is missing, run `pnpm install` **here**.

**Run `pnpm install` in every new clone and every new `git worktree`.** The
config value is written to the shared `.git/config`, so a new worktree does
inherit it — but the value is the *relative* path `.husky/_`, which git resolves
against whichever working tree it is running in, and `.husky/_/` is generated by
husky and **git-ignored**. So a fresh worktree has the tracked `.husky/pre-commit`
and `.husky/commit-msg` but no `_/` dispatcher, and git skips both hooks
**silently — no warning, exit 0**. Since nothing lints commit messages in CI yet
either, an unconventional message committed from a fresh worktree is caught by
nothing at all.

**Need to bypass a hook.** Don't. `--no-verify` is prohibited in this repo — fix
the message or the formatting instead. If a hook is genuinely wrong, that is a
bug in `.husky/` worth its own commit.

**Editing a file Biome ignores** (generated clients, i18n locale JSON, lockfiles)
is fine: `lint-staged` passes `--no-errors-on-unmatched`, so an ignored or
unknown file is skipped rather than failing the commit.

### Do not partially stage a file the formatter will reflow

**Stage whole files.** If you stage only some hunks of a file (`git add -p`) and
leave other edits unstaged *in the same region*, the working-tree copy can come
back corrupted — and the commit still succeeds.

This is inherent to running an autofixing formatter from a hook, not a bug in
our setup. `lint-staged` hides your unstaged edits, lets Biome rewrite the file,
then re-applies them as a patch. If Biome reflowed the lines that patch targets
(a one-line arrow function becoming three, say), it re-applies at the wrong
offset. Reproduced here: an unstaged line landed *inside* the body of the
function Biome had just expanded, producing `TS1184` — and `lint-staged` exited
**0**.

If it happens, `git stash list` will be **empty** — the backup `lint-staged`
made is a dangling commit, not a stash entry. Find it with:

```bash
git fsck --no-reflogs --lost-found | grep commit   # look for "WIP on <branch>"
git show <sha>                                     # your pre-hook state
```

Staging whole files avoids the situation entirely: with nothing unstaged to
hide, there is no patch to re-apply.

<!-- MDRS-13 ANCHOR — insert "## Project layers and tags" here.
     One-screen mirror of the CLAUDE.md tag table (ADR-001 §D5). -->

<!-- MDRS-18 ANCHOR — insert "## Module boundaries" and "## Adding a lib" here. -->
