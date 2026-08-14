#!/usr/bin/env node
/**
 * Reports Linear issues that are Done with nothing in this repo behind them
 * (MDRS-49).
 *
 * Every other gate in this directory checks work on its way IN — a commit
 * message, a PR title, a lint count. None of them can see the failure that
 * MDRS-16 is: an issue moved to Done while the repo learned nothing about it.
 * Measured on this workspace, MDRS-16 has `attachments: []` and no commit on
 * main CLAIMS to implement it — the only mention anywhere is a line of prose in
 * 4eb2784, a commit about MDRS-10, reading "MDRS-16 owns that entry point".
 * MDRS-24 has `attachments: []` too, because it shipped as three direct pushes
 * and Linear's GitHub integration attaches PULL REQUESTS, not bare commits.
 * Both are invisible to a pre-merge check by construction — there was no merge.
 *
 * So this runs in the other direction: start from Linear's Done column, and for
 * each issue ask whether ANYTHING here points back at it —
 *
 *   * an attachment whose URL is a GitHub pull request (what the integration
 *     creates when a PR carries the key), or
 *   * a commit on main that ASSERTS the key — in its subject line (what a
 *     direct push leaves behind, and the only trace MDRS-24 has), or in an
 *     anchored trailer such as `Refs MDRS-9`.
 *
 * Either counts. An issue with neither is the finding: it is either work that
 * happened somewhere else and should say so, or a ticket closed without being
 * done.
 *
 * What deliberately does NOT count is a key mentioned in free body prose. This
 * repo's commit bodies cross-reference other issues constantly ("Refs MDRS-10 …
 * MDRS-16 owns that entry point", "MDRS-20 removes it with the Vitest
 * conversion"), so a substring search over the whole message treats someone
 * else's forward reference as proof the issue shipped. Measured over the 17
 * MDRS keys on main, six (13, 16, 17, 19, 20, 21) appear ONLY as body
 * cross-references and never in a subject or a trailer — a 35% false-negative
 * rate on exactly the population this tool exists to find, including the
 * MDRS-16 that motivated it.
 *
 * This is deliberately NOT a blocking CI job. It is a rear-view report over a
 * queue that people move by hand, so it will have false positives (docs-only
 * tickets, work that genuinely lives in another repo) and blocking a PR on
 * someone else's ticket hygiene is how gates get bypassed. Run it on a schedule
 * or by hand.
 *
 * Uses only node builtins: `fetch` (Node 18+, and this workspace requires 22+)
 * and `git log` through child_process.
 *
 * Usage:
 *   LINEAR_API_KEY=lin_api_... node tools/ci/reconcile-linear.mjs
 *   node tools/ci/reconcile-linear.mjs --since 2026-07-01 --dry-run
 *
 * Options:
 *   --since <date>  Only issues completed on/after this date (ISO 8601 or
 *                   YYYY-MM-DD). Default below.
 *   --team <key>    Linear team key. Default MDRS.
 *   --ref <ref>     Git ref to scan for commits. Default: origin/main, falling
 *                   back to main, falling back to HEAD.
 *   --dry-run       Report only; always exit 0. Alias: --report-only.
 *   --help
 *
 * Exit codes: 0 = every Done issue is accounted for (or --dry-run, or no API
 * key), 1 = at least one Done issue has no trace here, 2 = the tool could not
 * do its job (bad arguments, Linear error, no git).
 */

import { spawnSync } from "node:child_process";

const LINEAR_ENDPOINT = "https://api.linear.app/graphql";

/**
 * 2026-07-24 is the day the two pre-merge histories were grafted into this repo
 * (7da5455, 196ff8c). Nothing completed before then can have a commit here to
 * find, so scanning further back only manufactures false positives.
 */
const DEFAULT_SINCE = "2026-07-24";

const DEFAULT_TEAM = "MDRS";

/**
 * Is this attachment URL a real GitHub pull request?
 *
 * Parsed, not pattern-matched. The obvious regex — /github\.com\/…\/pull\/\d+/ —
 * is unanchored, so `https://evil.example/github.com/amel-tech/medaris/pull/1`
 * satisfies it. CodeQL flags that as js/regex/missing-regexp-anchor, and here it
 * is not academic: this predicate is the whole "does this Done issue have work
 * behind it?" test, and Linear attachment URLs are attacker-supplied in the sense
 * that anyone who can edit an issue can add one. A tool that can be told an issue
 * shipped by pasting a link is worse than no tool, because it reports green.
 *
 * `new URL` also normalises away the tricks a hand-written anchor still misses:
 * userinfo (`https://github.com@evil.example/…`), case, and default ports.
 */
const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);

function isGitHubPullRequestUrl(raw) {
  let url;
  try {
    url = new URL(raw ?? "");
  } catch {
    return false; // not a URL at all
  }
  if (url.protocol !== "https:") return false;
  if (!GITHUB_HOSTS.has(url.hostname.toLowerCase())) return false;

  // /<owner>/<repo>/pull/<number> — exactly, with no path traversal before it.
  const segments = url.pathname.split("/").filter(Boolean);
  return (
    segments.length === 4 &&
    segments[2] === "pull" &&
    /^\d+$/.test(segments[3])
  );
}

/**
 * A trailer line: a body line that OPENS with a reference keyword and then
 * contains NOTHING but issue keys. Both halves matter. The `^` under /m is what
 * makes the key a claim about this commit instead of a passing mention; the
 * "keys only to end of line" tail is what keeps prose out — `Fixed paths that
 * MDRS-9's rename left dangling` opens with a keyword but is a sentence, not a
 * trailer. Group 1 is the key list, so `Refs MDRS-9, MDRS-10` counts for both.
 */
const TRAILER_LINE =
  /^[ \t]*(?:refs|references|closes|fixes|resolves|part-of|implements)[:\s]+((?:[A-Za-z]+-\d+[\s,;]*)+)$/gim;

const USAGE =
  "Usage: node tools/ci/reconcile-linear.mjs [--since <date>] [--team <key>] " +
  "[--ref <git-ref>] [--dry-run]";

function die(message, code = 2) {
  console.error(`✖ reconcile-linear: ${message}`);
  process.exit(code);
}

// ── Arguments ───────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const options = {
    since: DEFAULT_SINCE,
    team: DEFAULT_TEAM,
    ref: null,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const next = argv[++i];
      if (next === undefined) die(`${arg} needs a value.\n${USAGE}`);
      return next;
    };
    switch (arg) {
      case "--since":
        options.since = value();
        break;
      case "--team":
        options.team = value();
        break;
      case "--ref":
        options.ref = value();
        break;
      case "--dry-run":
      case "--report-only":
        options.dryRun = true;
        break;
      case "--help":
      case "-h":
        console.log(USAGE);
        process.exit(0);
        break;
      default:
        die(`unrecognised argument \`${arg}\`.\n${USAGE}`);
    }
  }

  const since = new Date(options.since);
  if (Number.isNaN(since.getTime())) {
    die(`--since \`${options.since}\` is not a date I can parse.`);
  }
  options.sinceIso = since.toISOString();
  return options;
}

// ── Git side ────────────────────────────────────────────────────────────────

function git(args) {
  return spawnSync("git", args, {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
}

function resolveRef(preferred) {
  const candidates = preferred ? [preferred] : ["origin/main", "main", "HEAD"];
  for (const candidate of candidates) {
    if (
      git(["rev-parse", "--verify", "--quiet", `${candidate}^{commit}`])
        .status === 0
    ) {
      return candidate;
    }
  }
  die(
    preferred
      ? `--ref \`${preferred}\` does not resolve to a commit in this clone.`
      : "none of origin/main, main or HEAD resolve here. Run this from inside " +
          "the repo, and make sure the clone is not shallow to the point of " +
          "having no main."
  );
}

/**
 * Reads every commit message on `ref` once, rather than shelling out to
 * `git log --grep` per issue. One pass over ~900 commits is cheaper than N
 * passes, and matching in JS avoids depending on which regex dialect the local
 * git was built with — `\b` is not portable across git's -E/-P/basic modes, and
 * without a word boundary MDRS-4 matches MDRS-49.
 */
function readCommitMessages(ref) {
  // ASCII record/unit separators: they cannot occur in a commit message,
  // unlike any newline- or pipe-based delimiter.
  const RECORD = "\u001e";
  const FIELD = "\u001f";
  const result = git(["log", ref, `--format=%H${FIELD}%s${FIELD}%b${RECORD}`]);
  if (result.status !== 0) {
    die(`\`git log ${ref}\` failed: ${(result.stderr || "").trim()}`);
  }
  return result.stdout
    .split(RECORD)
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [sha, subject = "", body = ""] = record.split(FIELD);
      // `claims` is everything in this message that ASSERTS an issue key: the
      // subject line, plus any anchored trailer. The rest of the body is
      // deliberately dropped — see the header on why prose mentions must not
      // count.
      const trailers = [...body.matchAll(TRAILER_LINE)].map((m) => m[1]);
      return { sha, subject, claims: [subject, ...trailers].join("\n") };
    });
}

// ── Linear side ─────────────────────────────────────────────────────────────

const DONE_ISSUES_QUERY = `
  query DoneIssues($team: String!, $since: DateTimeOrDuration!, $after: String) {
    issues(
      first: 100
      after: $after
      filter: {
        team: { key: { eq: $team } }
        state: { type: { eq: "completed" } }
        completedAt: { gte: $since }
      }
    ) {
      pageInfo { hasNextPage endCursor }
      nodes {
        identifier
        title
        url
        completedAt
        state { name }
        attachments(first: 50) { nodes { url title } }
      }
    }
  }
`;

async function fetchDoneIssues(apiKey, { team, sinceIso }) {
  const issues = [];
  let after = null;
  do {
    let response;
    try {
      response = await fetch(LINEAR_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: DONE_ISSUES_QUERY,
          variables: { team, since: sinceIso, after },
        }),
      });
    } catch (error) {
      die(`could not reach ${LINEAR_ENDPOINT}: ${error.message}`);
    }

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      die(
        `Linear answered ${response.status} ${response.statusText}.\n  ${detail}\n` +
          "  A 401 here means LINEAR_API_KEY is wrong or revoked; the header is " +
          "the raw key, with no `Bearer ` prefix."
      );
    }

    const payload = await response.json();
    if (payload.errors?.length) {
      die(
        `Linear returned GraphQL errors:\n  ${payload.errors
          .map((e) => e.message)
          .join("\n  ")}`
      );
    }

    const page = payload.data?.issues;
    if (!page)
      die("Linear's response had no `data.issues`; nothing to report.");

    issues.push(...page.nodes);
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (after);

  return issues;
}

// ── Report ──────────────────────────────────────────────────────────────────

const options = parseArgs(process.argv.slice(2));

const apiKey = process.env.LINEAR_API_KEY;
if (!apiKey) {
  // Exit 0, not 1. "I could not look" is not "I found a violation", and this
  // tool is the kind of thing that runs on a schedule where a missing secret
  // should read as skipped rather than as a red build every night.
  console.log(
    "reconcile-linear: skipped — LINEAR_API_KEY is not set.\n" +
      "  Create a personal API key at https://linear.app/settings/api and export\n" +
      "  it as LINEAR_API_KEY, or add it as a repository secret for the\n" +
      "  scheduled workflow. Nothing was checked."
  );
  process.exit(0);
}

const ref = resolveRef(options.ref);
const commits = readCommitMessages(ref);
const issues = await fetchDoneIssues(apiKey, options);

console.log(
  `reconcile-linear: ${issues.length} Done issue(s) in team ${options.team} ` +
    `completed since ${options.sinceIso}, checked against ${commits.length} ` +
    `commit(s) on ${ref}.\n`
);

const orphans = [];

for (const issue of issues) {
  const key = issue.identifier;
  // Word-bounded so MDRS-4 does not match MDRS-49, and case-insensitive because
  // branch-derived text and hand-typed references disagree on case.
  const keyPattern = new RegExp(
    `\\b${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
    "i"
  );

  const pullRequest = issue.attachments.nodes.find((attachment) =>
    isGitHubPullRequestUrl(attachment.url)
  );
  const commit = commits.find((c) => keyPattern.test(c.claims));

  if (pullRequest) {
    console.log(`✔ ${key.padEnd(9)} PR   ${pullRequest.url}`);
  } else if (commit) {
    console.log(
      `✔ ${key.padEnd(9)} git  ${commit.sha.slice(0, 7)} ${commit.subject}`
    );
  } else {
    console.log(`✖ ${key.padEnd(9)} —    ${issue.title}`);
    orphans.push(issue);
  }
}

if (orphans.length === 0) {
  console.log(
    "\n✔ reconcile-linear: every Done issue has a PR or a commit here."
  );
  process.exit(0);
}

console.error(
  `\n✖ reconcile-linear: ${orphans.length} Done issue(s) with no pull request ` +
    "attachment and no commit on this repo's main:\n"
);
for (const issue of orphans) {
  console.error(
    `  ${issue.identifier}  ${issue.title}\n` +
      `    completed ${issue.completedAt}  state "${issue.state?.name}"\n` +
      `    ${issue.url}`
  );
}
console.error(
  "\n  Each of these is one of three things, and they need different fixes:\n" +
    "\n" +
    "  1. The work shipped but the PR never carried the key, so Linear never\n" +
    "     attached it. Add a link on the issue by hand, and let the\n" +
    "     `Traceability` check stop the next one.\n" +
    "  2. The work shipped as a direct push whose commit subject and trailers\n" +
    "     never named the key. Same fix, plus: it should have been a PR. (A key\n" +
    "     mentioned only in body prose does not count here — that is how other\n" +
    "     people's commits cross-reference an issue, not how a commit claims it.)\n" +
    "  3. The work never happened in this repo — it lives in another repo, or\n" +
    "     it was closed as obsolete. Say which, on the issue.\n" +
    "\n" +
    "  Nothing here blocks a merge. This is a list to work through, not a gate."
);

process.exit(options.dryRun ? 0 : 1);
