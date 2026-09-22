#!/usr/bin/env node
/**
 * Asserts that a pull request carries its Linear issue key (MDRS-49).
 *
 * The problem this closes, measured on this repo: Linear's GitHub integration
 * attaches PULL REQUESTS, not bare commits. MDRS-15 shipped through PR #15 and
 * has an attachment; MDRS-24 shipped as three direct pushes with the key in two
 * commit subjects and has `attachments: []`. So the key in a commit message buys
 * nothing on the Linear side — the key has to be somewhere the integration reads,
 * which is the PR title and the head branch name.
 *
 * Hence the two accepted carriers, either of which satisfies the gate:
 *
 *   * the PR title contains MDRS-<n>   — what the integration matches, and what
 *     lands on main as the squash subject;
 *   * the head branch name contains mdrs-<n> — what Linear's "copy branch name"
 *     produces, and what the integration also matches.
 *
 * Two kinds of PR are exempt because no human titled them and no issue exists
 * to name: dependabot's (by author), and release-please's release PRs (by head
 * branch shape — see RELEASE_BRANCH for why the author is not usable there).
 *
 * Deliberately NOT checked: a per-commit key. All 21 commits on main since the
 * 24 July history merge already carry one, so such a rule would fire on nothing,
 * and it would not have caught the one commit that did slip (4305356, whose body
 * says "(MDRS-24)" and which still left MDRS-24 with no attachment).
 *
 * This reads $GITHUB_EVENT_PATH rather than calling the GitHub API: the payload
 * already contains the title, the branch and the actor, so the job needs no
 * token beyond `contents: read` and cannot fail on a 403 or a rate limit.
 *
 * KNOWN LIMIT — this is a SHAPE check, not an existence check. It proves the
 * text `MDRS-<n>` is where Linear's integration will look; it does NOT prove
 * that issue exists, is open, or has anything to do with the diff. `MDRS-1` on
 * a PR about something else passes, and nothing reconciles a bogus key back
 * (reconcile-linear.mjs walks FROM Linear's Done column, so a key Linear never
 * heard of is never visited). `MDRS-0` is rejected because Linear numbers issues
 * from 1, which is the only nonexistence this check can see for free. Closing
 * the rest needs a Linear `issue(id:)` lookup behind a LINEAR_API_KEY secret,
 * degrading to this shape check when the key is absent; that is not wired yet,
 * so do not read a green Traceability as "the issue exists".
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

fail([
  "## Traceability — no Linear issue key",
  "",
  `**Title:** \`${title}\``,
  `**Branch:** \`${branch}\``,
  "",
  "This PR carries no `MDRS-<n>` key, so Linear's GitHub integration will not",
  "attach it to any issue and the issue it implements will close with no link",
  "back to the work. Fix it either way — one is enough:",
  "",
  "1. **Put the key in the PR title**, e.g.",
  "   `fix(nizam-web): MDRS-49 give NextAuth cookies an app-specific name`.",
  "   Editing the title re-runs this check (it listens for `edited`).",
  "2. **Or use the Linear-generated branch name** — open the issue, *Copy git",
  "   branch name*, and push to that branch, e.g. `taha/mdrs-49-traceability-gates`.",
  "",
  "If this PR genuinely has no Linear issue, create one first. That is the",
  "point of the gate: MDRS-16 was closed with nothing in this repo pointing at",
  "it, and nobody noticed.",
  "",
  "Use a real key. This check only matches the `MDRS-<n>` *shape* — it cannot",
  "tell an issue that exists from one that does not (`MDRS-0` is the only value",
  "it rejects outright, because Linear numbers from 1). Passing it with an",
  "invented number defeats the gate and nothing downstream will catch that.",
]);
