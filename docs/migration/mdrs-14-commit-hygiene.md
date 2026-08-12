# MDRS-14 — Unify commit hygiene at the root

Collapses the two pre-merge hook setups into one root `.husky/` +
`commitlint.config.mjs` + `lint-staged`, and writes the commit-scope
conventions down in `CONTRIBUTING.md`.

Implements ADR-001 §D6 (`scope-enum`) and the `.husky/` line of §"Root layout".
Consumes MDRS-12's handoff (`docs/migration/mdrs-12-biome.md` §"MDRS-14 owns the
pre-commit hook") and MDRS-8's catalog pins.

## 1. What landed

| File | Change |
| --- | --- |
| `.husky/pre-commit` | new — `pnpm exec lint-staged` |
| `.husky/commit-msg` | new — `pnpm exec commitlint --edit "$1"` |
| `commitlint.config.mjs` | new — conventional + mandatory 20-entry `scope-enum` |
| `package.json` | `prepare: husky`, `lint-staged` block, 4 devDeps from the catalog |
| `CONTRIBUTING.md` | new — commit conventions + hook troubleshooting |
| `.migration/{backend,frontend}/.husky/` | **deleted** (6 files) |
| `.migration/{backend,frontend}/commitlint.config.js` | **deleted** (2 files) |

Nothing else was touched. `biome.json` and `eslint.config.mjs` (MDRS-12) are
unmodified — in particular the comment-free `overrides` array was left alone.

### Decisions

**`.mjs`, not `.js`.** ADR-001 §D6 already specified `commitlint.config.mjs`.
It is also the only unambiguous choice: the root `package.json` has no `"type"`
field, so a bare `.js` is CommonJS, and the two pre-merge repos disagreed on
exactly this (backend `module.exports`, frontend `export default`, qauth
`.mjs`). An explicit `.mjs` is ESM regardless of package type.

**App scopes keep the `-web` suffix.** `scope-enum` is ADR-001 §D6 verbatim:
`tedris-web`, `nizam-web`, `nazir-web`, `landing-web` — *not* the directory
names `apps/tedris`, `apps/nizam`, `apps/nazir`, `apps/landing`. This looks
stale but is not: §D6 sets app package names to `@medaris/<release-component>`
while MDRS-10 kept directories bare, and the actual `package.json` `name`
fields confirm it (`@medaris/tedris-web`, etc.). The scope must follow the
release component, because that is what release-please cuts releases against.
Verified against all 7 app `package.json` files and the two
`.migration/*/release-please-config.json` component lists.

**A scope is mandatory** (`scope-empty: [2, "never"]`). This is stricter than
the ADR, which only fixed the enum. Rationale: a scopeless commit is
attributable to no component in `git log`. Cross-cutting plumbing uses `repo`.
Note that commitlint's `defaultIgnores` still exempts merge, revert, fixup and
squash commits, so this does not block `git revert`.

**Correction to the task premise — release-please routes by path, not scope.**
MDRS-14's Linear description says "release-please derives releases from
conventional-commit scopes". Reading the two configs that MDRS-17 will land
(`.migration/*/release-please-config.json`) shows that is not the mechanism:
every package entry carries a `path` (`"path": "apps/tedrisat"`, …), and
release-please assigns a commit to a component by the files it touched. The
scope is used for the changelog entry text, not for routing. So a wrong scope
mislabels a real entry rather than misrouting a release. That makes `scope-enum`
slightly less load-bearing than the task implies — but not less worth having,
given the pre-merge history carried 90+ ad-hoc scopes (`flashcard`,
`deck-cards`, `pcgk-lock`, `package-lock.json`). The enum's real job is keeping
the scope vocabulary identical to the component names so `git log` and the
changelogs cannot drift apart. Recorded here so nobody re-derives the wrong
mechanism from the ticket.

A consequence worth knowing, and verified: both configs set
`pull-request-title-pattern: "chore(<component>): release ${version}"`, so
release-please's own release PR titles are `chore(tedrisat): release 1.2.3`
etc. — all 7 components are enum members, so **the bot's own titles satisfy this
config**. See §3.3, which corrects an earlier assumption of the opposite.

**`pre-commit` is staged-files-only, and cheap.** The pre-merge hooks ran
repo-wide `npm run lint` (backend) and `npm run check-types && npm run lint`
(frontend); their `pre-push` hooks additionally ran `npm run build` and
`npm test`. In a 16-package workspace that is minutes per commit. Whole-repo
verification is the gate's job. This satisfies the AC "lint-staged runs Biome
only on staged files, not the whole repo".

**The two `pre-push` hooks were dropped, not ported — sanctioned by the ADR.**
ADR-001 §D8 line 253 states this setup "replaces the backend's heavy pre-push
(full build+test) and both repos' branch-name-regex hooks (not a reference
convention)", so removing them is the instruction, not an omission. Beyond the
cost, their branch-name validation was already dead: the pattern
`^((feature|bugfix|hotfix|chore|release|experiment)/[a-z0-9-]+)|main|...$`
rejects this repo's actual convention (`argedikas/mdrs-14-...`), and the 65/70
character caps reject Linear's generated branch names outright. Reinstating
branch-name enforcement would mean first agreeing a pattern that matches
reality; not done here, and not silently smuggled in.

**`lint-staged` glob widened.** MDRS-12 handed over
`**/*.{ts,tsx,js,jsx,json,css}`. Landed as
`**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs,json,jsonc,css}` — the original misses
`.mjs`, which this very PR adds two of (`commitlint.config.mjs`, and
`eslint.config.mjs` already existed). The command is MDRS-12's verbatim:
`biome check --write --no-errors-on-unmatched`.

**`useImportType` / NestJS DI.** MDRS-12 recorded that `biome check --write`
converting constructor-parameter imports to `import type` erases
`design:paramtypes` and breaks NestJS DI at runtime while typecheck and build
stay green. The `biome.json` override turning `useImportType` off for
`apps/tedrisat/**`, `apps/teskilat/**` and `libs/common/**` is what makes
running Biome from a hook safe. Nothing here weakens it; the `test` gate below
is the evidence.

## 2. What was verified

All commands run in a **non-TTY** shell (`test -t 1` → exit 1, i.e. stdout is
not a terminal), which is the AC's requirement and the condition
`verifyDepsBeforeRun: warn` exists to protect.

### 2.1 Hook installation

```
$ pnpm install
.../node_modules/nx postinstall: Done
. prepare$ husky
. prepare: Done
+ @commitlint/cli 21.2.1
+ @commitlint/config-conventional 21.2.0
+ husky 9.1.7
+ lint-staged 17.3.0

$ git config --show-origin core.hooksPath
file:"/…/medaris/.git/config"	.husky/_
```

`core.hooksPath` is written to the **shared** `.git/config`. Husky's generated
`.husky/_/` is self-ignored (`.husky/_/.gitignore` = `*`, confirmed by
`git check-ignore -v .husky/_/pre-commit` → `.husky/_/.gitignore:1:*`); only
`pre-commit` and `commit-msg` are tracked.

**Those two facts combine into a trap, and an earlier draft of this document got
it wrong** by saying the setting is "inherited by every `git worktree`" and
leaving it there. The *value* is inherited, but the value is the **relative**
path `.husky/_`, which git resolves against whichever working tree it runs in —
and `.husky/_/` is git-ignored, so it does not come along with a new worktree or
a fresh clone. The result: the tracked `.husky/pre-commit` and
`.husky/commit-msg` are present, `core.hooksPath` looks correctly set, and git
**silently runs no hooks at all** (missing hooksPath directory is not an error).

This is not hypothetical for this repo — the MDRS task flow commits from
`.claude/worktrees/*`. `git worktree add` followed by `git commit` before
`pnpm install` lands an unvalidated message with no warning, and per §3.2
nothing lints commit messages in CI either, so it is caught by nothing.
`CONTRIBUTING.md` now says "run `pnpm install` in every new clone and every new
`git worktree`" and gives `ls .husky/_/pre-commit` as the second half of the
check. Credit to the code review for catching this.

### 2.2 Both hooks fire on a real commit, non-TTY

A deliberately misformatted probe file was staged and committed with an invalid
message. Both hooks ran, in order:

```
$ git add libs/utils/src/__hook_probe__.ts
$ git commit -m "Bad Message With No Type" < /dev/null
⋯ Running tasks for staged files…
    **/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs,json,jsonc,css} — 1 file
      ✔ biome check --write --no-errors-on-unmatched
✔ Done running tasks for staged files!
⋯ Staging changes from tasks…
✔ Done staging changes from tasks!
⧗   --- input ---
Bad Message With No Type
✖   subject may not be empty [subject-empty]
✖   type may not be empty [type-empty]
✖   scope may not be empty [scope-empty]
✖   found 3 problems, 0 warnings
husky - commit-msg script failed (code 1)
===GIT_COMMIT_EXIT=1===
```

Two things are proven at once: `lint-staged` reported **"1 file"**, not the
workspace (the AC's staged-only requirement), and the bad message was
**rejected** with a non-zero exit so the commit did not happen. The probe file
was rewritten in place by Biome (`const   probe   =    {a:1,b:2}` →
`const probe = { a: 1, b: 2 };`) and re-staged, confirming autofix + re-stage.

The paired positive case, same shell:

```
$ git commit -m "chore(utils): probe that the commit-msg hook accepts a valid message" < /dev/null
✔ Done running tasks for staged files!
[argedikas/mdrs-14-… d8774c7] chore(utils): probe that the commit-msg hook accepts a valid message
 1 file changed, 4 insertions(+)
===GIT_COMMIT_EXIT=0===
```

That throwaway commit was then removed with `git reset --soft HEAD~1` and the
probe file deleted; `HEAD` returned to `6bc1296`. No probe artefact is in this
branch — `libs/utils/src/__hook_probe__.ts` does not exist.

### 2.3 `commitlint` rule behaviour

Every rule claim made in `CONTRIBUTING.md` was executed, not assumed:

| Input | Exit | Rule that fired |
| --- | --- | --- |
| `feat(ui): add a rounded button variant` | 0 | — |
| `chore(repo): MDRS-14 — unify commit hygiene at the root` | 0 | — |
| `feat(tedrisat)!: require X-Tenant-Id on every enrolment endpoint` | 0 | — |
| `ci(landing-web): add a preview deploy on pull_request` | 0 | — |
| `feat: no scope at all` | 1 | `scope-empty` |
| `feat(flashcard): bad scope not in enum` | 1 | `scope-enum` |
| `feat(tedris): use the directory name by mistake` | 1 | `scope-enum` |
| `fix(ui): Broken Tooltip` | 1 | `subject-case` |
| `fix(ui): BROKEN TOOLTIP` | 1 | `subject-case` |
| `fix(ui): Broken Tooltip.` | 1 | `subject-full-stop` only |
| header padded to 120 chars | 1 | `header-max-length` (limit is 100) |
| body line padded to 145 chars | 1 | `body-max-line-length` (limit is 100) |
| body with no leading blank line | **0** | `body-leading-blank` — **warning only** |
| `Revert "feat(ui): add a thing"` | 0 | exempt via `defaultIgnores` |
| `fixup! feat(ui): add a thing` | 0 | exempt via `defaultIgnores` |
| `Merge branch 'main' into feature` | 0 | exempt via `defaultIgnores` |
| `chore(main): release 1.2.3` | **1** | `scope-enum` — see §3.3 |

The `fix(ui): Broken Tooltip.` row is a genuine quirk worth knowing: with the
trailing period the subject no longer classifies as start-case, so only
`subject-full-stop` is reported. Both rules work; they just do not both fire on
that input. The `CONTRIBUTING.md` examples were corrected to name one rule per
line rather than claim both.

`@commitlint/cli` resolved to **21.2.1** against `config-conventional` 21.2.0.
MDRS-8 flagged the 19→21 jump as needing a config re-check (its §"`@commitlint/cli`"
row); the config above parses and enforces correctly on 21, so that check is
discharged.

### 2.4 Files Biome ignores do not break the commit

`--no-errors-on-unmatched` is load-bearing, as MDRS-12 said. Both an
explicitly-ignored path and an unsupported extension exit 0:

```
$ pnpm exec biome check --write --no-errors-on-unmatched libs/i18n/src/locales/en/common.json
Checked 0 files in 2ms. No fixes applied.       ===EXIT=0===

$ pnpm exec biome check --write --no-errors-on-unmatched README.md
Checked 0 files in 1598µs. No fixes applied.    ===EXIT=0===
```

Without the flag, editing an i18n locale JSON — an `!`-excluded path in
`biome.json` — would fail every commit that touched one.

### 2.5 `prepare: husky` is safe where there is no `.git`

Adding a `prepare` script makes every `install` run `husky`, including in image
builds and CI where `.git` is usually absent. Measured rather than assumed:

```
$ cd /tmp/empty-dir && node …/node_modules/husky/bin.js
.git can't be found
===HUSKY_EXIT=0===
```

Exit **0**, so a missing `.git` cannot fail an install. No `husky || true`
guard is needed.

### 2.6 `verifyDepsBeforeRun`

```
$ pnpm config get verifyDepsBeforeRun
warn
```

Already set by MDRS-10 in `pnpm-workspace.yaml` with this exact scenario in its
comment (pnpm 11 defaults to `install`, which can prune devDeps and then abort
non-TTY with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`). No change needed
here; §2.2 is the evidence that `pnpm exec` from a hook works non-TTY.

### 2.7 Gate

All five targets, `--skip-nx-cache` throughout:

| Target | Result |
| --- | --- |
| `typecheck` | 16 projects ✅ |
| `test` | 3 projects ✅ — **10 suites / 91 tests** |
| `build` | 8 projects ✅ (see env note below) |
| `lint` | 16 projects ✅ |
| `module-boundaries` | 16 projects ✅ |

`test` is the meaningful one for this change: it is the only signal that
hook-driven `biome check --write` has not reintroduced MDRS-12's NestJS DI
breakage. The 91 tests are `tedrisat` (8 suites / 89 tests) + `teskilat`
(2 suites / 2 tests). The third "test project", `tedris-web`, runs
`echo 'Tests not implemented'` — counted as a project, not as coverage.

**`build` needs environment variables that are not in the repo.** On a fresh
worktree `nizam-web:build` and `tedris-web:build` fail before compiling, with
`❌ Invalid environment variables` from `@t3-oss/env-nextjs`
(`apps/{nizam,tedris}/env.ts` require `KEYCLOAK_CLIENT_ID/SECRET/ISSUER`,
`NEXTAUTH_URL/SECRET`, `TEDRISAT_API_BASE_URL` and four `NEXT_PUBLIC_*`).
This is **not** fallout from this PR, and that was measured rather than
asserted: supplying dummy values and changing nothing else flips both projects
green, so the only variable is the environment. The other 6 projects build
without any env at all. Root `.env.example` covers only ports and Postgres, so
these ten variables are currently undocumented — worth a `.env.example` entry
by whoever owns app config; out of scope here.

The dummy values were passed inline for the duration of the command only. No
`.env` file was created, and `git status` after the gate shows no untracked env
file.

### 2.8 Partial staging corrupts the working tree — found, not fixed

This was going to be filed as unverified. It was tested instead, and it is the
one genuinely bad behaviour in this setup.

`libs/utils/src/index.ts` was given two badly-formatted additions on adjacent
lines. The first was staged; the second left unstaged (`git status` → `MM`).
Running `pnpm exec lint-staged`:

```
⋯ Hiding unstaged changes to partially staged files…
✔ Done hiding unstaged changes to partially staged files!
      ✔ biome check --write --no-errors-on-unmatched
✔ Done staging changes from tasks!
⋯ Restoring unstaged changes…
===LINT_STAGED_EXIT=0===
```

Exit **0**. The staged blob is correct. The **working tree is not**:

```ts
export const probeStaged = (x: number): number => {
export const   probeUnstaged = (y:number):number=>{return y*3}
  return x * 2;
};
```

The unstaged line was re-applied *inside* the body of the function Biome had
just expanded from one line to three. `tsc` on the result:
`libs/utils/src/index.ts(26,1): error TS1184: Modifiers cannot appear here.`

**Mechanism.** For partially staged files lint-staged hides the unstaged edits,
runs the task, re-stages, then re-applies the hidden edits as a patch. Biome
reflowed exactly the region that patch targeted, so the offsets no longer
correspond and it lands in the wrong place. Inherent to *any* autofixing
formatter invoked from a hook — not specific to Biome or to this config — and
the adjacency in this test is the worst case; unstaged edits far from the
reformatted region are unaffected.

**Recovery is real but undiscoverable.** lint-staged does back the file up
(`Done backing up original state (183afe6)`) and that commit still resolves
afterwards (`git cat-file -t 183afe6` → `commit`, containing the pre-hook state).
But `git stash list` is **empty** — the cleanup step drops the stash ref, leaving
a dangling commit findable only via `git fsck --lost-found`. A developer hitting
this has no obvious way back.

**Not fixed here, deliberately — and the reason is normative, not preference.**
The only complete fix is to stop autofixing: `biome check` without `--write`,
failing the commit instead of repairing it. But `--write` is not MDRS-12's taste,
it is **ADR-001 §D8 line 253 verbatim**: "lint-staged runs R1's `biome check
--write --no-errors-on-unmatched` on staged files". Dropping it is an ADR
deviation and a real UX change (every formatting nit becomes a rejected commit
instead of a silent fix), which is a decision for whoever owns the ADR — not
something to slip into a commit-hygiene task. So it is documented rather than
changed: `CONTRIBUTING.md` gains "Do not partially stage a file the formatter
will reflow" with the `git fsck` recovery path, and the tradeoff is escalated in
the PR. **If this bites people in practice, dropping `--write` is the fix and it
is a one-line change to `package.json`.**

The independent code review reached the same conclusion unprompted, calling it
"the one real functional defect the PR ships".

## 3. What was NOT verified

1. **Nothing lints the commit that actually reaches `main`.** PRs are
   squash-merged, and GitHub composes that commit's subject from the **PR
   title**, server-side. No git hook sees it. So `scope-enum` currently
   constrains local commits — the exact messages release-please will parse are
   unchecked. This is the largest remaining gap and it is CI-shaped, so it is
   MDRS-15's (see §4).
2. **commitlint has never run in CI.** No workflow invokes it. Untested over a
   commit range.
3. **release-please bot commits: mostly fine, one shape is not.** An earlier
   draft of this document claimed flatly that the bot's commits fail this
   config. That was wrong, and the correction came from reading the configs
   rather than guessing. Both
   `.migration/*/release-please-config.json` set
   `pull-request-title-pattern: "chore(<component>): release ${version}"`, so
   the real titles are `chore(tedrisat): release 1.2.3`,
   `chore(landing-web): release 1.2.3`, … — every component is an enum member,
   and all 7 **pass** (spot-checked `tedrisat`, `keycloak-theme`,
   `landing-web`; exit 0).
   What *does* fail is the **scopeless/`main`** shape: `chore(main): release
   1.2.3` exits 1 on `scope-enum`, and the pre-merge history contains 7 such
   commits, so it is release-please's behaviour when no title pattern is
   configured. Harmless today (the bot commits through the API, so no local
   hook runs), and it should stay harmless as long as MDRS-17 keeps the
   per-package title patterns. Flagged so MDRS-17 knows those patterns are
   load-bearing for commitlint, and so MDRS-15 handles it if it ever lints a
   commit range. Do **not** "fix" it by adding `main` to `scope-enum` — that
   would make a meaningless scope permanently valid for humans too.
4. **One platform, one shell.** Linux, `sh`-executed hooks. Not tested on
   Windows, macOS, Git Bash, or from a GUI git client (which is a different
   non-TTY environment again — `PATH` there often lacks `pnpm`).
5. **No editor/GUI path.** Only `git commit -m` was exercised, never an
   interactive editor session or `prepare-commit-msg`.
6. *(Moved — this was tested. See §2.8, which found a real problem.)*
7. **The frontend builds were never verified against real configuration.**
   §2.7's greens for `nizam-web` and `tedris-web` used dummy env values chosen
   to satisfy the zod schema (`https://example.invalid`, `dummy`). That proves
   the build compiles and that this PR did not break it; it does **not** prove
   the apps work against a real Keycloak. `NEXT_PUBLIC_*` values are inlined
   into the bundle at build time, so a release build must use real values.
8. **The 6 Dockerfiles were not touched and are independently broken.**
   `apps/*/Dockerfile` still `COPY package*.json` and `RUN npm install`, from
   before MDRS-10. They cannot work against this workspace regardless of this
   PR: the root `package.json` uses `catalog:` specifiers, which npm does not
   understand, and there is no `package-lock.json`. Pre-existing, MDRS-16's
   surface, recorded here only so it is not mistaken for fallout from
   `prepare: husky` (§2.5 shows that script is harmless).

## 4. Handoffs

**MDRS-15 (CI)** — the real owner of the gap in §3.1:

- Lint the **PR title**, since that becomes the squash commit. A
  `pull_request`-triggered job running `commitlint` over the title against this
  same `commitlint.config.mjs` is the smallest fix. Without it `scope-enum` does
  not actually protect release-please.
- If commitlint is also run over a commit range, use
  `pnpm exec commitlint --from <base> --to <head>` and handle §3.3 (release-please
  bot commits) with an `ignores` predicate or a narrowed range.
- Hooks in CI: `prepare` runs `husky` on install and is safe (§2.5). Nothing
  needs `HUSKY=0`. CI must not rely on hooks for verification — they only cover
  staged files.
- Remaining `.migration/` files owned by MDRS-15 (6):
  `.migration/{backend,frontend}/.github/workflows/{ci-dev,pull-request,codeql}.yaml`.

**MDRS-17 (release-please)** — remaining `.migration/` files (6):
`.migration/{backend,frontend}/{release-please-config.json,.release-please-manifest.json}`
and `.migration/{backend,frontend}/.github/workflows/release-please.yaml`.
MDRS-17 deletes the `.migration/` directory itself. Its `scope-enum` acceptance
criterion is satisfied by `commitlint.config.mjs`; the component names there
must stay in sync with that enum, including the `-web` suffixes.

Three things noticed while reading those configs for the scope list (read-only —
nothing was changed):

- **The per-package `pull-request-title-pattern`s are load-bearing for
  commitlint.** `chore(<component>): release ${version}` passes `scope-enum`;
  release-please's unconfigured default (`chore(main): …`) does not. Keep them.
- **`extra-files` is stale in both configs.** Frontend declares
  `"extra-files": ["shared/**"]`, but MDRS-10 moved `shared/*` to `libs/*`, so
  that glob now matches nothing. Backend declares `"extra-files": ["libs/**"]`
  for both services, which now means every lib bumps both backend components.
- **`release-type: node` + `package-name`** were written against the pre-rename
  names (`package-name: "tedris-web"` for `apps/tedris`). That happens to agree
  with ADR §D6's `@medaris/tedris-web`, but worth confirming rather than assuming.

**MDRS-13 (boundary tags)** — `CONTRIBUTING.md` now exists, so §D5's
"one-screen mirror" of the `CLAUDE.md` tag table has a home. Insert it at the
`<!-- MDRS-13 ANCHOR -->` comment.

**MDRS-18 (docs)** — owns the module-boundary rules and the "how to add a lib"
procedure sections of `CONTRIBUTING.md`; insert at the `<!-- MDRS-18 ANCHOR -->`
comment. Do not restate the commit conventions.

**Whoever creates `apps/docs`** — ADR-001 §D1 reserves that name, and `docs` is
already taken as a cross-cutting scope. That collision needs resolving at the
time (§D10 requires a `scope-enum` edit in the same PR anyway).

## 5. Code review

Four findings, all resolved. `gh pr checks` was empty and no bot review appeared
(none is configured on this repo), so this review plus the local gate is the
whole verification story.

| # | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| 1 | medium | `biome check --write` from `pre-commit` corrupts partially staged files | **Not fixed — escalated.** `--write` is ADR-001 §D8 verbatim; see §2.8. Documented in `CONTRIBUTING.md` with recovery, tradeoff raised in the PR. |
| 2 | medium | "`core.hooksPath` … inherited by every `git worktree`" is true of the value but false in effect — `.husky/_` is relative *and* git-ignored, so a fresh worktree silently runs no hooks | **Fixed.** Verified independently (`git check-ignore`), then rewrote both this doc (§2.1) and the `CONTRIBUTING.md` troubleshooting entry to say "run `pnpm install` in every new clone and worktree", with `ls .husky/_/pre-commit` as the second check. |
| 3 | low | "The last row is a genuine quirk" pointed at the wrong row after §2.3's table grew | **Fixed** — names the row explicitly now. |
| 4 | low | "`pre-commit` … does not lint" understates it; `biome check` lints staged files at error severity and can block a commit | **Fixed** — `CONTRIBUTING.md` now says it lints staged files and that an unsafe-to-fix error-level diagnostic fails the commit. |

Finding 2 is the one that mattered: it is a silent-failure path that this repo's
own worktree-based task flow walks into, and no amount of local testing in an
*already-installed* worktree would have surfaced it.

The review also independently confirmed several things this document asserts:
catalog/lockfile sync for the four new devDeps, `scope-enum` matching ADR §D6
and the 7 app `package.json` names exactly, `prepare: husky` exiting 0 without
`.git`, the `useImportType: off` override for the two NestJS apps and
`libs/common` being present and intact, `"$1"` correctly quoted, the missing exec
bit on the tracked hooks being fine for husky 9, and the deleted `.migration/**`
hooks having been inert reference copies so no active enforcement was lost.

Separately, reading the release-please configs for the scope list turned up a
**correction to the ticket's own premise** (routing is by path, not scope) and
the fact that the bot's release PR titles *pass* this config — both recorded in
§1 and §3.3, replacing an earlier wrong claim of mine.
