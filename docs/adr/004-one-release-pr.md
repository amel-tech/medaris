# ADR-004: One Release PR for Every Component

**Status:** Proposed
**Date:** 2026-10-16
**Authors:** Muhammed Taha Ayan
**Supersedes:** the `separate-pull-requests: true` clause of [ADR-001](001-monorepo-merge-and-layout.md) §D10, and nothing else in ADR-001

## Context

ADR-001 §D10 set `separate-pull-requests: true`, so release-please opens one
release PR per component, on `release-please--branches--main--components--<component>`.

- Every one of those PRs edits `.release-please-manifest.json`, an object with
  one line per component (tedrisat, teskilat, tedris, nizam, nazar, landing,
  keycloak-theme, in that order). Git reports a conflict when two branches
  change adjacent lines, so once one release PR is merged, the PR of each
  component whose manifest line is next to the changed one turns `CONFLICTING`.
- release-please does not repair it. It updates an existing release PR only
  when the PR body (the release notes) would change
  (`maybeUpdateExistingPullRequest` in `src/manifest.ts` of release-please
  17.1.2, the version that `release-please-action` v4.3.0 bundles). Another
  component's release leaves that body as it was, so the conflict stays until
  someone merges `main` into the release branch by hand and waits for CI again.
- On 2026-10-16, shipping keycloak-theme 2.2.0, tedris-web 2.10.0, nazar-web
  0.2.10, nizam-web 0.2.8, landing-web 2.5.0 and tedrisat 0.2.11 took six
  merges, two hand-resolved manifest conflicts and a CI run for each of those
  two. The tedrisat PR, which carried the API half of #344, was found only
  after the three web apps that call it had gone live; the API followed
  15–20 minutes later.

## Decision

### D1 — One release PR

`release-please-config.json` sets `separate-pull-requests: false`. release-please
keeps a single release PR, on `release-please--branches--main`, for every
component with releasable changes. Merging it cuts a `<component>-v<version>`
tag and a GitHub release for each component it lists, and nothing else: the
per-app deploy workflows, the tag prefixes, the CHANGELOGs and the per-component
versions are unchanged.

### D2 — Its title is `chore(repo): release main`

`group-pull-request-title-pattern` is `chore(repo): release ${branch}`.

- release-please's default, `chore: release main`, has no scope and fails
  `scope-empty` in the Commit hygiene job.
- `repo` is an existing cross-cutting scope (ADR-001 §D6); no component owns
  the release PR.
- The pattern must keep a `${…}` variable. release-please parses the merged
  PR's title back with it, and a match with no named group parses to nothing:
  every component then logs `Bad pull request title` and none is tagged, with
  nothing going red. Checked against release-please 17.1.2: the config above
  tags exactly the components in the PR body, and a variable-free pattern
  (`chore(repo): release the pending apps`) tags none.

### D3 — The header is set once, at the top level

The grouped PR takes `pull-request-header` from the first package config that
has one. With a header per package, every release PR would say
"Release for Tedrisat Service", whichever components it holds. The seven
per-package headers are removed and `pull-request-header` is set once at the
top level. The per-package `pull-request-title-pattern`s stay:
`tools/ci/assert-release-config.mjs` pins them, and release-please still tries
them first when it parses a merged title.

### D4 — The gates follow

- `tools/ci/assert-release-config.mjs` asserts `separate-pull-requests: false`,
  the exact title pattern of D2, and that its scope is in `scope-enum`.
- `tools/ci/assert-traceability.mjs` exempts the head branch
  `release-please--branches--main` (same repository only) in place of the
  per-component branches, which release-please no longer creates.

## Alternatives Considered

- **Keep one PR per component and resolve each conflict by hand.** This is what
  happened on 2026-10-16. Each conflict costs a merge of `main` and a CI run,
  and it recurs on every release with adjacent components.
- **Keep one PR per component and re-run release-please after each merge**
  (`workflow_dispatch`). It does not help: the conflicting PR's body is
  unchanged, so release-please leaves it alone (Context).
- **`linked-versions` or `node-workspace` plugins.** They couple the *versions*
  of the components, not only the PR. Components keep their own version lines.
- **A new `release` commitlint scope.** It would extend ADR-001 §D6's list for a
  single bot title that `repo` already covers.

## Consequences

### Positive

- One merge ships everything pending. No manifest conflicts, no CI re-runs
  between releases.
- The halves of a change that spans the API and the web apps ship in the same
  release.

### Negative

- release-please can no longer ship one component on its own. Holding one back
  holds the whole PR; the runbooks' by-hand path (a GitHub release tagged
  `<component>-v<semver>`) remains for an exception.
- Every component in the PR deploys at once, so a bad release in one is
  shipped next to the others.

### Neutral

- Tags, GitHub releases, CHANGELOGs, versions and the seven deploy workflows do
  not change.
- `git log` shows `chore(repo): release main (#N)` for a release; the PR body
  lists the components and versions.

## Related

- [ADR-001](001-monorepo-merge-and-layout.md) §D6 (scopes), §D10 (release
  continuity, superseded in part here).
- MDRS-14 §3.3 (release PR titles must pass `scope-enum`), MDRS-17
  (release-please consolidation), MDRS-91 (release branches exempt from
  Traceability).
- release-please 17.1.2: `src/manifest.ts` (`maybeUpdateExistingPullRequest`,
  the merge plugin options), `src/plugins/merge.ts`,
  `src/strategies/base.ts` (`buildRelease`), `src/util/pull-request-title.ts`.
