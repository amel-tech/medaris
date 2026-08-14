<!--
BEFORE ANYTHING ELSE: put the Linear key in the PR TITLE or the BRANCH NAME.

Those are the two places the `Traceability` check reads. A key written only in
this description does NOT satisfy it — the line below is for humans, not the
gate. If you branched from Linear the branch already carries it and there is
nothing to do.

Why it matters: Linear's integration attaches pull requests, not commits, so a
PR with no key closes its issue leaving no trace of the work. That is how
MDRS-16 came to be marked Done with nothing behind it.
-->

Linear: MDRS-<!-- issue number, e.g. 49 -->

## What changed

<!-- The change itself, in the order a reviewer should read it. -->

## Why

<!-- The problem, not the patch. Link the evidence: a failing run, an issue, a
     measurement. If this is a follow-up to something that broke, say what. -->

## How this was verified

<!-- What you actually ran and what it printed. "CI is green" is not
     verification of behaviour — CI proves the gates below, nothing more. -->

---

- [ ] Title passes commitlint — a `type(scope): subject` with a scope from the
      enum in `commitlint.config.mjs`. Enforced by the **Commit hygiene** check,
      which lints both this title and every commit in the range.
- [ ] This PR names its Linear issue, in the title or the branch name. Enforced
      by the **Traceability** check.
- [ ] `pnpm run affected` is green locally — the same five targets (`lint`,
      `typecheck`, `test`, `build`, `module-boundaries`) the **Verify** check
      runs on CI.
- [ ] No new dependency advisories and no unused dependencies —
      `pnpm run security-check`. Enforced by the **Security gates** check.
