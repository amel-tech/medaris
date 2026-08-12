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

The scope is what makes this more than style policing: release-please derives
each component's release and changelog from the commit scope, and this one repo
publishes **7 components**. A commit landing under the wrong scope silently
lands in the wrong changelog — or none. That is why a scope is **mandatory** and
checked against a closed list.

### Rules

| Rule | Requirement |
| --- | --- |
| `type` | required, lower-case, from the type list below |
| `scope` | **required**, from the scope list below |
| `subject` | required, no trailing `.`, not Start-Case / PascalCase / ALL-CAPS |
| header length | ≤ 100 characters |
| body / footer lines | ≤ 100 characters each, blank line before each |

### Types

`build` · `chore` · `ci` · `docs` · `feat` · `fix` · `perf` · `refactor` ·
`revert` · `style` · `test`

Only `feat` and `fix` (and anything marked breaking) produce a release entry.

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
workflow. The `ci` and `docs` **scopes** are for changes with no single owning
package — `ci(ci)` for shared workflow plumbing, `docs(docs)` for ADRs and
migration records.

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

`pre-commit` is intentionally cheap. It does **not** typecheck, lint the whole
repo, or build — in a 16-package workspace that is minutes per commit. Full
verification belongs to the gate:

```bash
pnpm nx run-many -t typecheck test build lint module-boundaries
```

Because `lint-staged` autofixes and re-stages, a commit can end up containing
formatting changes you did not type. That is expected.

### Troubleshooting

**Hooks do not run at all.** Check that `prepare` actually ran:

```bash
git config core.hooksPath   # expect: .husky/_
```

If it is empty, run `pnpm install` again. Note that `core.hooksPath` is written
to the shared `.git/config`, so it is set once per clone and inherited by every
`git worktree`.

**Need to bypass a hook.** Don't. `--no-verify` is prohibited in this repo — fix
the message or the formatting instead. If a hook is genuinely wrong, that is a
bug in `.husky/` worth its own commit.

**Editing a file Biome ignores** (generated clients, i18n locale JSON, lockfiles)
is fine: `lint-staged` passes `--no-errors-on-unmatched`, so an ignored or
unknown file is skipped rather than failing the commit.

<!-- MDRS-13 ANCHOR — insert "## Project layers and tags" here.
     One-screen mirror of the CLAUDE.md tag table (ADR-001 §D5). -->

<!-- MDRS-18 ANCHOR — insert "## Module boundaries" and "## Adding a lib" here. -->
