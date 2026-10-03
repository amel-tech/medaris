# Traceability no longer requires a Linear key

Date: 3 October 2026.

## What changed

- `tools/ci/assert-traceability.mjs` passes a pull request that names no
  `MDRS-<n>` issue, with a step summary saying the PR body is the record. A PR
  that still carries a key is reported as before; dependabot and release-please
  keep their exemption lines; a misconfigured trigger still fails.
- `.github/workflows/traceability.yaml`: header comment and step name follow the
  new behaviour. The job name `Traceability` is unchanged.
- `.github/pull_request_template.md`: the "put the Linear key in the title"
  preamble, the `Linear: MDRS-` line and the Traceability checklist item are
  gone; a "Not verified, and follow-ups" section and a 100-file limit item are in.
- `.coderabbit.yaml`: the review instructions no longer tell CodeRabbit that
  Traceability requires a key.

## Why

Work in this repository is no longer tracked in Linear. Each change is described
in full in its pull request. Under the MDRS-49 gate every such pull request was
red on a required check and could not be merged.

## Why the job was kept rather than deleted

`Traceability` is a required status check in the "main protection" ruleset. A
required check that never reports leaves every pull request waiting, so deleting
the workflow before removing that ruleset entry would block all merges.

## Verified

`node tools/ci/assert-traceability.mjs <event.json>` against four hand-written
payloads: keyless PR exits 0; keyed PR exits 0 and reports the key; dependabot
PR exits 0 as exempt; a payload with no `pull_request` exits 1.

## Not verified, and follow-ups

- The ruleset itself was not read (the API returns 404 for branch protection on
  this token); that `Traceability` is required is taken from the workflow's own
  comment and from the ruleset name `main protection`.
- Follow-up for a repository admin: remove `Traceability` from the ruleset, then
  delete the workflow, the script and the `assert:traceability` package script.
- `.github/workflows/linear-reconcile.yaml` (MDRS-49) still walks Linear's Done
  column; it blocks nothing and is left as is.
