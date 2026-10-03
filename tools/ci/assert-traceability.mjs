#!/usr/bin/env node
/**
 * Reports whether a pull request names a Linear issue. Since 3 October 2026 it
 * no longer requires one.
 *
 * History: MDRS-49 made this a hard gate, because Linear's GitHub integration
 * attaches PULL REQUESTS, not bare commits, and an issue closed with no PR key
 * left no trace of the work. The project has since stopped tracking work in
 * Linear: a change is described in full in its own pull request body (what
 * changed, why, how it was verified, what could not be verified, follow-ups).
 * A PR with no key is therefore the normal case, not a mistake, and failing it
 * would block every pull request.
 *
 * The job is kept, and kept green, rather than deleted: its name `Traceability`
 * is a required status check in the "main protection" ruleset, and a required
 * check that never reports leaves every PR waiting forever. Removing the
 * workflow is safe only after that ruleset entry is removed.
 *
 * What it still does:
 *
 *   * fails on a misconfigured trigger (no event payload, no `pull_request`);
 *   * when an older-style `MDRS-<n>` key IS present in the title or the head
 *     branch, says so in the step summary, so a PR that still links an issue is
 *     visible as such;
 *   * otherwise passes, with a summary saying the PR body is the record.
 *
 * Dependabot and release-please PRs keep their explicit exemption lines so the
 * step summary tells a reader why no description is expected there.
 *
 * This reads $GITHUB_EVENT_PATH rather than calling the GitHub API: the payload
 * already contains the title, the branch and the actor, so the job needs no
 * token beyond `contents: read` and cannot fail on a 403 or a rate limit.
 *
 * Usage:
 *   node tools/ci/assert-traceability.mjs             # reads $GITHUB_EVENT_PATH
 *   node tools/ci/assert-traceability.mjs event.json  # local testing
 */

import { appendFileSync, readFileSync } from "node:fs";

/**
 * The key as it must appear in a PR title: uppercase, whole word. `[1-9]\d*`
 * rather than `\d+` because Linear numbers issues from 1, so `MDRS-0` names
 * nothing and is the one bogus key this check can reject without asking Linear.
 */
const TITLE_KEY = /\bMDRS-[1-9]\d*\b/i;

/**
 * The key as it appears in a branch name. Case-insensitive and not
 * word-anchored on purpose: Linear generates `argedikas/mdrs-9-merge-both-git-
 * histories-...`, where the key is bounded by a slash and a hyphen rather than
 * by word boundaries, and humans type both `taha/mdrs-49-x` and `MDRS-49-x`.
 * `[1-9]\d*` for the same reason as TITLE_KEY: there is no MDRS-0.
 */
const BRANCH_KEY = /mdrs-[1-9]\d*/i;

/**
 * Bots that open PRs no human titled. Compared after lowercasing and after
 * stripping a leading `app/`, because the same identity is spelled
 * `dependabot[bot]` in the event payload's `user.login` and `app/dependabot`
 * in ruleset/bypass contexts. Five such PRs existed here (all dependabot, all
 * since closed) and every one of them would fail this gate for no reason a
 * human could act on.
 *
 * `release-please` is listed for completeness, NOT because it fires here. The
 * Release Please workflow runs on `RELEASE_PLEASE_TOKEN`, a user PAT — it has
 * to, because a PR opened with `github.token` never emits the `release` event
 * and the seven deploy workflows would never run — so the author of every
 * release PR is the human who owns that PAT, and this set never matches it
 * (MDRS-91: seven release PRs red on this gate). Release PRs are recognised by
 * RELEASE_BRANCH below instead; the actor form only takes over if the token
 * is ever swapped for a GitHub App identity.
 */
const EXEMPT_ACTORS = new Set([
  "dependabot", // `app/dependabot`, after the prefix is stripped
  "dependabot[bot]",
  "dependabot-preview[bot]",
  "release-please", // `app/release-please`, only on a bot token — see above
  "release-please[bot]",
]);

/**
 * The head branch release-please creates with `separate-pull-requests: true`,
 * one per component: `release-please--branches--main--components--<component>`.
 * A release PR has no Linear issue behind it and release-please rewrites its
 * title on every push to `main`, so neither carrier the gate accepts can ever
 * hold a key there; the branch shape is the one thing release-please controls
 * and a token choice cannot change. Anchored on both ends — an unanchored
 * `release-please` substring would wave through `feature/release-please-tweak`.
 * Deliberately not closed over the component list: the same-repo check at the
 * use site is what keeps a fork out, and a list here would have to be kept in
 * step with release-please-config.json for no additional protection. Only
 * honoured for a head in the base repository.
 */
const RELEASE_BRANCH =
  /^release-please--branches--main--components--([a-z0-9-]+)$/;

function summary(lines) {
  const text = `${lines.join("\n")}\n`;
  process.stdout.write(text);
  const path = process.env.GITHUB_STEP_SUMMARY;
  if (path) appendFileSync(path, text);
}

function fail(lines) {
  summary(lines);
  process.exitCode = 1;
}

const eventPath = process.argv[2] ?? process.env.GITHUB_EVENT_PATH;
if (!eventPath) {
  fail([
    "## Traceability — misconfigured",
    "",
    "Neither an event-file argument nor `$GITHUB_EVENT_PATH` was set, so there",
    "is no pull request to inspect. This job must be triggered by",
    "`on: pull_request`.",
  ]);
  process.exit();
}

let event;
try {
  event = JSON.parse(readFileSync(eventPath, "utf8"));
} catch (error) {
  fail([
    "## Traceability — could not read the event payload",
    "",
    `\`${eventPath}\`: ${error.message}`,
  ]);
  process.exit();
}

const pr = event.pull_request;
if (!pr) {
  fail([
    "## Traceability — misconfigured",
    "",
    "The event payload has no `pull_request` object. This gate only makes sense",
    "on `on: pull_request`; wire it there or delete it.",
  ]);
  process.exit();
}

const title = typeof pr.title === "string" ? pr.title : "";
const branch = typeof pr.head?.ref === "string" ? pr.head.ref : "";

// ONLY `pull_request.user.login` — the PR's author. Never `event.sender.login`.
// `sender` is whoever triggered THIS event, so a dependabot label change or a
// bot push on a human's keyless PR would exempt it; and because a required
// check resolves to the LATEST run for (name, head_sha), that one event would
// flip an already-red Traceability green on the same commit. `user.login` is on
// every `pull_request` payload and is stable across
// opened/synchronize/edited/labeled, so sender adds no coverage and only widens
// the hole.
const author = typeof pr.user?.login === "string" ? pr.user.login : "";
const exemptActor = EXEMPT_ACTORS.has(
  author.toLowerCase().replace(/^app\//, "")
)
  ? author
  : null;

if (exemptActor) {
  summary([
    "## Traceability — exempt",
    "",
    `PR #${pr.number ?? "?"} was opened by \`${exemptActor}\`, an automation`,
    "account with no Linear issue behind it. Exempt by actor; no key required.",
  ]);
  process.exit();
}

// Same-repository heads only. `head.ref` is chosen by whoever pushes it, so a
// fork could name its branch `release-please--branches--main--components--
// tedrisat` and walk through this exemption with no key; release-please only
// ever pushes to the base repository, so a matching branch from anywhere else
// is not a release PR whatever it is called.
const headRepo =
  typeof pr.head?.repo?.full_name === "string" ? pr.head.repo.full_name : "";
const baseRepo =
  typeof pr.base?.repo?.full_name === "string" ? pr.base.repo.full_name : "";
const sameRepo = headRepo !== "" && headRepo === baseRepo;

const releaseComponent = sameRepo
  ? branch.match(RELEASE_BRANCH)?.[1]
  : undefined;
if (releaseComponent) {
  summary([
    "## Traceability — exempt",
    "",
    `PR #${pr.number ?? "?"} is release-please's release PR for`,
    `\`${releaseComponent}\` (head branch \`${branch}\`). A release has no Linear`,
    "issue behind it and release-please rewrites the title on every push to",
    "`main`, so no key is required. Exempt by branch shape, not by a key match",
    "(MDRS-91).",
  ]);
  process.exit();
}

const titleHasKey = TITLE_KEY.test(title);
const branchHasKey = BRANCH_KEY.test(branch);

if (titleHasKey || branchHasKey) {
  const carriers = [
    titleHasKey ? `title (\`${title.match(TITLE_KEY)[0]}\`)` : null,
    branchHasKey ? `branch (\`${branch.match(BRANCH_KEY)[0]}\`)` : null,
  ].filter(Boolean);
  summary([
    "## Traceability — ok",
    "",
    `Linear key found in the ${carriers.join(" and the ")}.`,
    "",
    "This checks the key's *shape*, not its existence: it does not ask Linear",
    "whether that issue is real or related to this diff. A green tick here means",
    "the integration has something to match on, nothing more.",
  ]);
  process.exit();
}

summary([
  "## Traceability — ok, no Linear issue",
  "",
  `**Title:** \`${title}\``,
  `**Branch:** \`${branch}\``,
  "",
  "This PR names no `MDRS-<n>` issue, which is expected: work is no longer",
  "tracked in Linear, and the pull request body is the record of what changed,",
  "why, and how it was verified.",
]);
