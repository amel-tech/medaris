<!--
This pull request is the record of the change: work is no longer tracked in
Linear. Write the body so that someone who was not in the conversation can tell
what changed, why, how it was verified, what could not be verified, and what is
left as follow-up.

Keep a pull request to at most 100 changed files (CodeRabbit skips larger ones);
split bigger work into several pull requests, stacked if they depend on each
other, and say in each body where it sits in the series.
-->

## What changed

<!-- The change itself, in the order a reviewer should read it. -->

## Why

<!-- The problem, not the patch. Link the evidence: a failing run, an issue, a
     measurement. If this is a follow-up to something that broke, say what. -->

## How this was verified

<!-- What you actually ran and what it printed. "CI is green" is not
     verification of behaviour — CI proves the gates below, nothing more. -->

## Not verified, and follow-ups

<!-- Anything you could not run or check, and work deliberately left for a
     later pull request. -->

---

- [ ] Title passes commitlint — a `type(scope): subject` with a scope from the
      enum in `commitlint.config.mjs`. Enforced by the **Commit hygiene** check,
      which lints both this title and every commit in the range.
- [ ] At most 100 changed files; larger work is split across pull requests.
- [ ] `pnpm run affected` is green locally — the same five targets (`lint`,
      `typecheck`, `test`, `build`, `module-boundaries`) the **Verify** check
      runs on CI.
- [ ] No new dependency advisories and no unused dependencies —
      `pnpm run security-check`. Enforced by the **Security gates** check.
