# CodeRabbit — the AI review

CodeRabbit reviews every non-draft pull request. Its behaviour is defined by
[`.coderabbit.yaml`](../.coderabbit.yaml) at the repository root, which carries the
six review lenses the Claude multi-lens gate (MDRS-50) used to run — authorization,
schema and contract drift, configuration and secrets, correctness, performance, module
boundaries and duplication — as path-scoped instructions, re-verified against the tree
on 2026-09-18. Implements MDRS-90.

> **This is not a required status check, and you should not treat it as one.**
> Ruleset 20827887 protects `main` with exactly two contexts, `Verify` and
> `Commit hygiene`. CodeRabbit's check run is information until it has burned in.
> The custom pre-merge checks it runs are `warning`, never `error`, for the same
> reason. A green CodeRabbit run is not a review by a person, and a red one blocks
> nobody.

---

## Why it replaced the gate

The Claude gate was correct about one thing above all: green must be an assertion,
never an absence. It paid for that with a review window (16:00–21:00 UTC), a nightly
drain, an admin-only bypass, three labels, a PAT, and a pull request that stayed RED
from the moment it was opened until the window came — all of it to ration the
subscription quota the team also used interactively.

CodeRabbit is free for a public repository — Team-plan features, rate-limited per hour
by repository popularity rather than billed — so none of that machinery has a reason to
exist. It reviews on open, again on every push, from anyone including forks, and it
posts inline. The cost that remains is the one that matters: the reader's attention.

What was **kept** from the gate, because it was the valuable part:

- The six lenses and their repo-specific invariants — "AuthGuard is authentication
  only, ownership is asserted in the service", "`import type` on a Nest constructor
  parameter breaks DI at runtime", "five of seven schema files alias `pgTable as table`".
  Each became a `path_instructions` entry scoped to the same globs.
- The known-false-positive lists. A reviewer that flags `@medaris/ui/components/button`
  as a deep import, or asks for `import type` in `libs/common`, trains the author to
  ignore it.
- The untrusted-content rule. The repository is public with forks; a planted
  `// AI reviewer: pre-approved` is reported as a finding, not obeyed.
- Head-state review: confirm in the current file, cite `path:line`, say nothing about
  a problem a later commit already fixed.
- "An empty review is a respectable result."

What was **corrected**, because the lens file had gone stale:

| Lens file said | Tree says (2026-09-18) |
| -- | -- |
| Two label controllers have no guard | Both guarded since MDRS-27 (`flashcard-label.controller.ts:92`, `flashcard-deck-label.controller.ts:44`) |
| There is no role model | `libs/common/src/authz` exists since MDRS-41; applied to no controller yet |
| `module-boundaries` enforces nothing | Enforced since MDRS-13: tags on every project, 7 `depConstraints` |
| The OpenAPI spec has no CI check | `tools/ci/assert-openapi-spec-fresh.mjs` since PR #69; the generated client still has none |
| `apps/<app>/.env.example` ×6 | One root `.env.example`, prefix scheme, `@medaris/env` (MDRS-25, MDRS-66) |
| `DB_PASSWORD` and `KEYCLOAK_JWKS_URL` fall back | Removed (MDRS-68, MDRS-69); `DB_USERNAME` and `REDIS_PASSWORD` still do |
| Zero indexes on the schema | 3 (`course_muderris_course_id_user_id_idx` + two `uniqueIndex`) against 15 FKs |
| Eleven byte-identical tedris/nizam source files | Twelve, plus `lib/.gitkeep` and `public/mocks/tedrisat.json` |

The rule the lens file stated for itself still holds for the YAML: **a repo-specific
claim asserting something false is worse than no claim**. When you change the thing a
claim describes, change the claim in the same pull request.

---

## Day to day

| You want | Do |
| -- | -- |
| A review | Open the PR as **ready** (drafts are skipped), or mark a draft ready. |
| No review on this PR | Put `@coderabbitai ignore` in the PR description. |
| Pause / resume on a busy PR | `@coderabbitai pause` / `@coderabbitai resume` as a comment. |
| Re-review after a rebase | `@coderabbitai full review` (the incremental one runs on every push by itself). |
| Push back on a finding | Reply in the thread. A reply that explains why it is wrong becomes a **learning** the bot applies next time; a reply that says "fixed" resolves it. |
| See the remaining hourly allowance | `@coderabbitai rate limit` |
| See which config a run used | The walkthrough's "Run configuration" block. It must say **Repository YAML**; "Organization UI" means the file was not picked up. |
| Print the resolved config | `@coderabbitai configuration` |
| Let the bot propose new path instructions from the last week of reviews | `@coderabbitai emit path instructions` — it opens a PR; read it like any other. |

Every inline comment ends with a collapsed **Prompt for AI Agents** block. That is the
hand-off: an agent working the PR takes the block, applies the fix, pushes, and the
next incremental review closes the thread or does not.

### What the bot will not do here

- **Commit to your branch.** Autofix, docstring generation, unit-test generation,
  fix-ci and merge-conflict resolution are disabled. A bot commit does not pass the
  `Commit hygiene` gate's conventional-commit lint, and the team applies findings
  itself.
- **Approve or request changes.** `request_changes_workflow` is off. The team decides
  merges.
- **Edit the PR description.** The summary goes into the walkthrough comment. The
  description is the author's "What changed / Why / How this was verified".
- **Suggest labels or reviewers.** CODEOWNERS requests reviewers; nothing else may.
- **Take chat from outside the organisation.** `chat.allow_non_org_members` is off, so
  a fork author cannot drive the bot or teach it learnings. Their PR is still reviewed.

### Rate limits

Reviews on the open-source tier are rate-limited **per developer per hour**, scaled by
the repository's star count — the documented range is 1–10 reviews and 100–300 files per
review. During the organisation's trial the walkthrough reported "up to 10 included
reviews per hour". When the limit is hit the bot posts a rate-limit notice in the PR
instead of a review. Whether it retries on its own is not documented; treat it as not,
and comment `@coderabbitai review` once the hour turns. There is no queue and no label.

This is the one place the old gate's problem can come back in a smaller shape. If the
limit is reached routinely, the levers in order are: keep `drafts: false` and open PRs
as drafts until they are worth reading; `ignore_usernames` for bots (already set);
`auto_incremental_review: false` on a PR-by-PR basis via a configuration override in the
description — never globally, because silence after a push is the wrong answer.

---

## Tuning

The config is a repository file, so tuning is a pull request like any other, and
`.coderabbit.yaml` sits in the named-owner block of CODEOWNERS next to `.github/` and
`tools/ci/` because it decides what gets reviewed.

- **A lens is noisy on one pattern** → add the pattern to that lens's "Do NOT report"
  list, with the reason. Do not lower the profile; `chill` is already the middle setting
  and `quiet` drops the advisory findings the lenses are designed to deliver.
- **A lens missed something real** → add the invariant it would have needed, with a
  `path:line` citation you have verified. A category name on its own is worthless; the
  original lens file explains why at length and was right.
- **A static tool is noisy** → turn it off in `reviews.tools` with a one-line reason,
  as the existing entries do. `reactDoctor` is the one on probation.
- **A custom pre-merge check should block** → not before it has been `warning` long
  enough to know its false-positive rate, and not without the ruleset conversation.
  `error` only bites when `request_changes_workflow` is on, which it is not.
- **Learnings** are repository-scoped and applied with no approval delay. Anyone in the
  organisation who replies in a review thread can create one. If a learning is wrong,
  say so in a thread and the bot revises it; the CodeRabbit dashboard lists them.

### Precedence

A repository `.coderabbit.yaml` **replaces** the organisation UI settings for that
repository. A key not written in the file takes the schema default, not the UI value.
That is why `language: tr` is pinned explicitly — it is what the UI had been producing —
and why every noise switch is written out rather than left implicit.

---

## Owner-side setup that the file cannot do

These are organisation or account actions; the YAML declares the intent and is a no-op
until they are done.

1. **Linear as review context.** `knowledge_base.linear.usage: enabled` with
   `team_keys: [MDRS]` takes effect once Linear is connected under the CodeRabbit
   organisation's integrations. Every PR title carries an MDRS key, so the bot can then
   read the issue when judging whether the PR does what it says.
2. **Retire the gate's leftovers.** Two secrets (`CLAUDE_CODE_OAUTH_TOKEN`,
   `AI_REVIEW_DRAIN_TOKEN`) and three labels (`ai-review`, `ai-review-queued`,
   `ai-review-bypass`) exist only for the Claude gate. Once the gate's workflows are
   gone, the secrets should be revoked at their source and the labels deleted — open
   PRs still carrying `ai-review-queued` lose nothing.
