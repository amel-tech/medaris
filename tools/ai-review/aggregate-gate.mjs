#!/usr/bin/env node
/**
 * Collapses every AI review lens into the single status context
 * `AI Multi-Lens Review Gate` (MDRS-50).
 *
 * Why one context: a branch ruleset binds to a check NAME. If the gate were the
 * per-lens checks themselves, adding or renaming a lens would silently make the
 * ruleset require a check that no longer exists (blocking every PR) or stop
 * requiring one that does (blocking none). Ruleset 20827887 currently requires
 * `Verify` + `Commit hygiene`; this context is deliberately NOT added to it
 * until it has burned in, but its name is fixed from day one so that adding it
 * later is a one-line change and never a rename.
 *
 * Why a script rather than bash in the workflow: this job's entire job is to
 * enumerate `needs.*.result` exhaustively and say, in writing, what each value
 * means. Sidre's aggregator handled `success` and `skipped` and folded
 * everything else into "at least one lens blocked" — so `cancelled`, which its
 * own `cancel-in-progress: true` manufactures on every superseded run, was
 * reported as a blocking finding, and a preflight failure would have been
 * reported the same way. Neither is true, and neither is a thing you want a
 * reviewer to guess at from a red X.
 *
 * What silently breaks without this file: the gate would have to infer "did a
 * review happen" from job conclusions alone. It cannot — a skipped matrix job
 * is reported to branch protection as passing, so any path that skips the
 * lenses and still publishes this context publishes a green gate over an
 * unreviewed diff. Every skip below is therefore explicit, named, and stated in
 * the sticky comment as "no review happened", never as approval.
 *
 * Reads the per-lens verdict artifacts written by evaluate-verdict.mjs (one
 * JSON per lens, deterministic, produced by our code and not by the model),
 * cross-checks their count against what the preflight selected, writes a job
 * summary, updates one sticky PR comment, and exits 0 (green) or 1 (red).
 *
 * Usage (from .github/workflows/ai-review.yml):
 *   node tools/ai-review/aggregate-gate.mjs
 */

import { appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const env = process.env;

const preflightResult = env.PREFLIGHT_RESULT || "";
const preflightMode = env.PREFLIGHT_MODE || "";
const preflightSkipReason = env.PREFLIGHT_SKIP_REASON || "";
const lensResult = env.LENS_RESULT || "";
const rawLensCount = env.PREFLIGHT_LENS_COUNT ?? "";
// Deliberately NOT `parseInt(...) || 0`. That collapses "", "abc" and NaN into
// 0, and 0 is the one lens count that is green ("nothing matched"). An
// unreadable count means the gate does not know how many lenses it selected,
// which cannot be allowed to read as "it selected none".
const parsedLensCount = Number.parseInt(rawLensCount, 10);
const lensCountIsValid =
  /^\d+$/.test(rawLensCount.trim()) && Number.isInteger(parsedLensCount);
const expectedLensCount = lensCountIsValid ? parsedLensCount : -1;
const expectedLensKeys = (env.PREFLIGHT_LENS_KEYS || "")
  .split(",")
  .map((key) => key.trim())
  .filter(Boolean);
const verdictDir = env.AI_REVIEW_VERDICT_DIR || "";
const runUrl = env.RUN_URL || "";
const repo = env.GITHUB_REPOSITORY || "";
const prNumber = env.PR_NUMBER || "";
const token = env.GH_TOKEN || env.GITHUB_TOKEN || "";
const apiUrl = env.GITHUB_API_URL || "https://api.github.com";
const enforceBlock = env.AI_REVIEW_ENFORCE_BLOCK === "true";

const MARKER = "<!-- ai-review-gate -->";

/** Collected verdict artifacts, one per lens leg that reached its evaluator. */
/**
 * Last line of defence before anything model-authored reaches a PUBLIC comment.
 *
 * The lens jobs hold the review credential in their environment while reviewing
 * untrusted pull-request code, so a successful prompt injection could in
 * principle route a secret into a findings string. The allowlist in
 * ai-review.yml is the real control — `cat` and `sed` are deliberately absent,
 * so there is no arbitrary-path read to exfiltrate WITH. This is the belt to
 * that pair of braces, and it exists because the consequence is asymmetric: a
 * redacted true positive costs a reviewer one click, a leaked subscription
 * token on a public repository costs a credential rotation and is permanent in
 * the fork network.
 *
 * Patterns are shape-based rather than a list of known secret names, because
 * the thing worth catching is the one nobody thought to name.
 */
const SECRET_SHAPES = [
  /sk-ant-[A-Za-z0-9_-]{16,}/g, // Anthropic API keys
  /gh[pousr]_[A-Za-z0-9]{16,}/g, // GitHub tokens
  /github_pat_[A-Za-z0-9_]{20,}/g, // fine-grained PATs
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, // JWTs
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
];

function redactSecrets(text) {
  if (typeof text !== "string") return text;
  let out = text;
  for (const shape of SECRET_SHAPES)
    out = out.replace(shape, "«redacted by the AI review gate»");
  return out;
}

function loadVerdicts(root) {
  if (!root || !existsSync(root)) return [];
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      // Read first, ask questions after. This used to `statSync` and then
      // `readFileSync`, which CodeQL flags as a time-of-check/time-of-use race:
      // the path can change between the two calls. The directory case still
      // needs the stat, but it is now the thing that FAILS rather than the
      // thing that gates — a path that is a directory throws EISDIR on read and
      // lands in the same catch as any other unreadable entry.
      let contents = null;
      let isDirectory = false;
      try {
        contents = readFileSync(full, "utf8");
      } catch (error) {
        isDirectory = error.code === "EISDIR";
        if (!isDirectory && error.code !== "ENOENT")
          console.log(`::warning::could not read ${full}: ${error.message}`);
      }

      if (isDirectory) {
        walk(full);
      } else if (contents !== null && entry.endsWith(".json")) {
        try {
          const parsed = JSON.parse(contents);
          if (
            parsed &&
            typeof parsed === "object" &&
            parsed.lens &&
            parsed.verdict
          )
            found.push(parsed);
        } catch {
          // A corrupt artifact is treated as a missing one: the count check
          // below turns that into red rather than into a silent pass.
        }
      }
    }
  };
  walk(root);
  return found;
}

function writeSummary(lines) {
  const target = env.GITHUB_STEP_SUMMARY;
  if (!target) {
    console.log(lines.join("\n"));
    return;
  }
  appendFileSync(target, `${lines.join("\n")}\n`, "utf8");
}

/**
 * Sticky comment. Best-effort by design: on a fork PR the `pull_request` token
 * is read-only, so this POST/PATCH 403s. A gate that turned red because it
 * could not comment would be reporting the wrong thing, so failures here are
 * warned about and never change the verdict.
 */
async function upsertComment(body) {
  if (!token || !repo || !prNumber) {
    console.log(
      "::notice::No token/repo/PR available — skipping the sticky gate comment."
    );
    return;
  }
  const headers = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "x-github-api-version": "2022-11-28",
  };
  try {
    let existingId = null;
    for (let page = 1; page <= 10 && existingId === null; page += 1) {
      const response = await fetch(
        `${apiUrl}/repos/${repo}/issues/${prNumber}/comments?per_page=100&page=${page}`,
        { headers }
      );
      if (!response.ok)
        throw new Error(`list comments: HTTP ${response.status}`);
      const comments = await response.json();
      if (!Array.isArray(comments) || comments.length === 0) break;
      const match = comments.find((comment) =>
        (comment.body || "").includes(MARKER)
      );
      if (match) existingId = match.id;
      if (comments.length < 100) break;
    }

    const target = existingId
      ? `${apiUrl}/repos/${repo}/issues/comments/${existingId}`
      : `${apiUrl}/repos/${repo}/issues/${prNumber}/comments`;
    const response = await fetch(target, {
      method: existingId ? "PATCH" : "POST",
      headers,
      body: JSON.stringify({ body: redactSecrets(body) }),
    });
    if (!response.ok) throw new Error(`write comment: HTTP ${response.status}`);
  } catch (error) {
    console.log(
      `::warning::Could not post the AI review gate comment (${error.message}). ` +
        "This does not change the gate verdict; on fork pull requests the token is read-only by design."
    );
  }
}

/**
 * Every value `needs.<job>.result` can take, each with the reason it maps the
 * way it does. GitHub documents four (`success`, `failure`, `cancelled`,
 * `skipped`); the fifth case is the empty/unknown string, which is what you get
 * when the job did not exist or the expression could not be evaluated. It is
 * undocumented, so it is handled explicitly rather than being allowed to fall
 * into a default that means "fine".
 */
function classifyLensResult(result) {
  switch (result) {
    case "success":
      // Every matrix leg exited 0. That means each leg's evaluator asserted
      // liveness AND either found nothing blocking or was in advisory mode.
      // Still not sufficient on its own — the artifact count check below has to
      // agree, because "no leg ran" also aggregates to success in some shapes.
      return { state: "success", message: "every lens leg exited cleanly" };
    case "failure":
      // At least one leg exited non-zero. From evaluate-verdict.mjs that is
      // exit 1 (enforced blocking finding) or exit 2 (DEAD). Both are red, and
      // the artifacts tell the reviewer which — never collapse them into
      // "a lens blocked", because DEAD means nothing was reviewed at all.
      return { state: "red", message: "at least one lens leg failed" };
    case "cancelled":
      // Unhandled in Sidre, and manufactured by its own concurrency group.
      // A cancelled leg reviewed nothing, so it cannot vouch for the diff; red
      // is correct and costs nothing, because the run that superseded it will
      // publish its own verdict over this same head SHA moments later.
      return {
        state: "red",
        message: "a lens leg was cancelled — nothing was reviewed",
      };
    case "skipped":
      // Reached only when the preflight said `run` but the lens job's `if` was
      // false anyway: a contradiction between two parts of this workflow.
      // Branch protection treats a skipped job as passing, so a gate that
      // shrugged here would be the exact fail-open shape MDRS-50 exists to
      // remove.
      return {
        state: "red",
        message:
          "lenses were skipped although the preflight selected work — the gate is misconfigured",
      };
    default:
      // Empty or unrecognised. Do not guess.
      return {
        state: "red",
        message: `unrecognised lens job result \`${result || "(empty)"}\` — treated as red, since the gate cannot assert a review happened`,
      };
  }
}

/** The same exhaustive treatment for the preflight job. */
function classifyPreflightResult(result) {
  switch (result) {
    case "success":
      return { ok: true, message: "preflight completed" };
    case "failure":
      // The gate could not even work out what to review. Nothing downstream is
      // trustworthy.
      return {
        ok: false,
        message:
          "the preflight job failed — the gate could not determine what to review",
      };
    case "cancelled":
      return {
        ok: false,
        message:
          "the preflight job was cancelled — the gate never determined what to review",
      };
    case "skipped":
      // Preflight carries no `if`, so this should be unreachable; if it happens
      // the workflow was edited into an unsafe shape.
      return {
        ok: false,
        message:
          "the preflight job was skipped, which this workflow never does deliberately",
      };
    default:
      return {
        ok: false,
        message: `unrecognised preflight result \`${result || "(empty)"}\``,
      };
  }
}

function verdictLine(verdict) {
  const icon =
    verdict.verdict === "PASS"
      ? "✅"
      : verdict.verdict === "BLOCK"
        ? verdict.advisory
          ? "⚠️"
          : "❌"
        : verdict.verdict === "DEAD"
          ? "💀"
          : "⏭️";
  // The raw liveness numbers travel with every row, green ones included: this
  // table is where the next outage gets diagnosed from the PR alone.
  const live = verdict.liveness
    ? `\`is_error=${verdict.liveness.isError}\` \`num_turns=${verdict.liveness.numTurns}\` \`total_cost_usd=${verdict.liveness.totalCostUsd}\``
    : "_not read_";
  return `| ${icon} \`${verdict.lens}\` | ${verdict.verdict}${verdict.advisory ? " (advisory)" : ""} | ${verdict.blockingCount ?? 0} | ${verdict.findingsCount ?? 0} | ${live} |`;
}

async function main() {
  const verdicts = loadVerdicts(verdictDir);
  const body = [];
  const summary = [];
  let red = false;
  let headline = "";

  const preflight = classifyPreflightResult(preflightResult);

  if (!preflight.ok) {
    red = true;
    headline = `❌ **The gate did not run.** ${preflight.message}.`;
  } else if (
    preflightMode !== "skip" &&
    preflightMode !== "run" &&
    preflightMode !== "queued"
  ) {
    // `mode` gets the same exhaustive treatment as every `needs.*.result`
    // above, and for the same reason. It used to be tested only against
    // "skip", so an empty string, a typo or a future third mode fell through
    // to the `expectedLensCount === 0` branch and published "✅ No lens matched
    // this diff" — a green gate produced by a value the gate did not
    // understand. That is the "default that means fine" shape this whole file
    // exists to remove.
    red = true;
    headline =
      `❌ **The gate did not run.** The preflight reported an unrecognised mode \`${preflightMode || "(empty)"}\`; ` +
      "only `run`, `queued` and `skip` are defined, so the gate cannot say what was or was not reviewed.";
  } else if (preflightMode === "queued") {
    // RED, deliberately, and this is the one mode where that deserves stating.
    //
    // The review is deferred to a quiet window so it does not compete with the
    // team's own interactive Claude usage on the same subscription. Deferred is
    // not reviewed, so the gate must not be green: a queued PR that reported
    // green would be indistinguishable from a reviewed one, which is the exact
    // confusion the rest of this file exists to prevent.
    //
    // Red here blocks nobody today — this context is not a required check. When
    // it becomes one, an admin can still merge through it (`bypass_actors` on
    // ruleset 20827887), and that is the intended path for "this cannot wait
    // until tonight": a named human decides, on the record.
    red = true;
    headline =
      `🕑 **Queued for the nightly review window** — ${preflightSkipReason}\n\n` +
      "Nothing has been reviewed yet. This check is red because deferred is not " +
      "reviewed, not because a finding was raised. It turns green or red on its " +
      "own once the window opens and the lenses actually run.\n\n" +
      "To review now instead, remove and re-add the `ai-review` label. To merge " +
      "without waiting, that is an admin decision through the ruleset bypass.";
  } else if (preflightMode === "skip") {
    // Documented skips. Each of these is green — you cannot block every PR on a
    // capability the repository has not been given — but the comment says
    // plainly that NO review happened, so a green gate here is never mistaken
    // for an AI approval.
    headline =
      `⏭️ **No AI review ran** — ${preflightSkipReason}\n\n` +
      "This gate is green because there was nothing for it to gate, **not** because a review passed. " +
      "Human review carries the whole weight on this pull request.";
  } else if (!lensCountIsValid) {
    // "" or "abc" from a preflight whose selection step never wrote its output.
    red = true;
    headline =
      `❌ **The gate did not run.** The preflight reported an unreadable lens count \`${rawLensCount || "(empty)"}\`, ` +
      "so the gate does not know how many lenses it selected and cannot assert that they ran.";
  } else if (expectedLensCount === 0 && verdicts.length > 0) {
    // Zero selected but something reported: the two halves of the run disagree
    // about whether a review happened, and "no lens matched" is the green
    // reading of that. Never take the green reading of a contradiction.
    red = true;
    headline =
      `❌ **Verdict count mismatch.** The preflight selected no lenses, yet ${verdicts.length} ` +
      "verdict artifact(s) came back. The gate cannot explain what ran, so it reports red.";
  } else if (expectedLensCount === 0) {
    // Green, but never an endorsement: the same caveat every other skip
    // carries. Whole categories of file — a committed `.env`, a private key —
    // are only covered if some lens's globs happen to name them, so "no lens
    // matched" has to read as "nothing was examined", not as "nothing wrong".
    headline =
      "⏭️ **No lens matched this diff.** Every lens is scoped to a set of path globs and none of them " +
      "intersect the files this pull request touches, so **nothing was reviewed**.\n\n" +
      "This gate is green because there was nothing for it to gate, **not** because a review passed. " +
      "Human review carries the whole weight on this pull request — including for files no lens is " +
      "scoped to at all.";
  } else {
    const lens = classifyLensResult(lensResult);
    const dead = verdicts.filter((verdict) => verdict.verdict === "DEAD");
    const notConfigured = verdicts.filter(
      (verdict) => verdict.verdict === "NOT_CONFIGURED"
    );
    const enforcedBlocks = verdicts.filter(
      (verdict) => verdict.verdict === "BLOCK" && !verdict.advisory
    );
    const advisoryBlocks = verdicts.filter(
      (verdict) => verdict.verdict === "BLOCK" && verdict.advisory
    );
    const missing = expectedLensKeys.filter(
      (key) => !verdicts.some((verdict) => verdict.lens === key)
    );

    if (dead.length > 0) {
      red = true;
      headline =
        `💀 **${dead.length} of ${expectedLensCount} lenses could not be shown to have run.** ` +
        "Their liveness assertion failed (see the per-lens job summaries for the raw " +
        "`is_error` / `num_turns` / `total_cost_usd`). This is a **red** gate regardless of " +
        "`AI_REVIEW_ENFORCE_BLOCK`: a review that did not happen cannot pass.";
    } else if (lens.state === "red" && lensResult !== "failure") {
      red = true;
      headline = `❌ **The lenses did not complete.** ${lens.message}.`;
    } else if (missing.length > 0) {
      // The count check. A green gate is a positive assertion, so every lens the
      // preflight selected must have produced a verdict artifact. A leg that
      // died between its evaluator and the artifact upload lands here.
      red = true;
      headline =
        `❌ **Missing verdicts.** The preflight selected ${expectedLensCount} lens(es) but only ` +
        `${verdicts.length} reported back; no verdict from: ${missing.map((key) => `\`${key}\``).join(", ")}. ` +
        "The gate cannot assert those lenses reviewed anything, so it reports red.";
    } else if (verdicts.length !== expectedLensCount) {
      // The `missing` check above is by KEY, so it passes vacuously whenever
      // `lens_keys` is empty — filtering an empty list yields an empty list,
      // and zero artifacts against `lens_count=2` sailed through it and printed
      // "✅ 0 of 2 lenses reviewed this pull request". Compare the numbers too:
      // the guarantee is "a green gate names every lens it selected", and that
      // needs both halves of the same invariant checked independently.
      red = true;
      headline =
        `❌ **Verdict count mismatch.** The preflight selected ${expectedLensCount} lens(es) and ` +
        `${verdicts.length} verdict artifact(s) came back. The gate cannot account for every lens it ` +
        "selected, so it reports red rather than reporting on the ones it happens to have.";
    } else if (new Set(expectedLensKeys).size !== expectedLensCount) {
      // `lens_count` and `lens_keys` are written by the same three lines of the
      // preflight, so disagreement means that step half-failed. Compared as a
      // SET because two lenses sharing a key would also produce two matrix legs
      // writing over each other's artifact name — one review, two claims.
      red = true;
      headline =
        `❌ **The gate cannot name the lenses it selected.** The preflight reported ` +
        `${expectedLensCount} lens(es) but ${new Set(expectedLensKeys).size} distinct lens key(s) ` +
        `(\`${expectedLensKeys.join(", ") || "(empty)"}\`). Those two outputs are written together; ` +
        "disagreeing means the selection step did not complete.";
    } else if (enforcedBlocks.length > 0) {
      red = true;
      headline =
        `❌ **${enforcedBlocks.length} lens(es) raised a blocking finding.** Address them and push; ` +
        "the gate re-runs on every synchronize.";
    } else if (notConfigured.length > 0) {
      headline =
        "⏭️ **The gate is not configured.** One or more lenses reported `NOT_CONFIGURED` " +
        "(`ANTHROPIC_API_KEY` absent). Nothing was reviewed — this is a documented skip, not a pass.";
    } else if (lens.state === "red") {
      red = true;
      headline = `❌ **A lens failed.** ${lens.message}.`;
    } else {
      headline =
        `✅ **${verdicts.length} of ${expectedLensCount} lenses reviewed this pull request and raised nothing blocking.**` +
        (advisoryBlocks.length > 0
          ? `\n\n⚠️ ${advisoryBlocks.length} lens(es) raised a blocking finding that is currently **advisory** ` +
            "(`AI_REVIEW_ENFORCE_BLOCK` is not `true`), so it is reported but does not fail the gate."
          : "");
    }
  }

  body.push(MARKER, "## 🤖 AI Multi-Lens Review Gate", "", headline, "");

  if (verdicts.length > 0) {
    body.push(
      "| lens | verdict | blocking | findings | liveness |",
      "| --- | --- | --- | --- | --- |"
    );
    for (const verdict of verdicts.sort((a, b) =>
      a.lens.localeCompare(b.lens)
    )) {
      body.push(verdictLine(verdict));
    }
    body.push("");
    for (const verdict of verdicts) {
      const shown = (verdict.findings || []).filter(
        (finding) => finding.__blocking
      );
      if (shown.length === 0) continue;
      body.push(
        `<details><summary><code>${verdict.lens}</code> — ${shown.length} blocking finding(s)</summary>`,
        ""
      );
      for (const finding of shown) {
        const where = finding.file
          ? `\`${finding.file}${finding.line ? `:${finding.line}` : ""}\` — `
          : "";
        body.push(
          `- **[${finding.severity}/${finding.confidence ?? "high"}]** ${where}${finding.title ?? ""}`
        );
        if (finding.detail) body.push(`  - ${finding.detail}`);
        if (finding.fix) body.push(`  - Fix: ${finding.fix}`);
      }
      body.push("", "</details>", "");
    }
  }

  body.push(
    `Findings enforcement: \`AI_REVIEW_ENFORCE_BLOCK=${enforceBlock}\`. Liveness is enforced unconditionally and no flag can disable it.`,
    "",
    runUrl
      ? `[Run log](${runUrl}) · the AI reviews and gates; it never approves and never merges.`
      : "The AI reviews and gates; it never approves and never merges."
  );

  summary.push("## AI Multi-Lens Review Gate", "", headline, "");
  summary.push(
    "| signal | value |",
    "| --- | --- |",
    `| preflight result | \`${preflightResult || "(empty)"}\` |`,
    `| preflight mode | \`${preflightMode || "(empty)"}\` |`,
    `| lens job result | \`${lensResult || "(empty)"}\` |`,
    // The RAW value, so an unreadable count is visible as what the preflight
    // actually emitted rather than as the sentinel this file replaced it with.
    `| lenses selected | \`${rawLensCount || "(empty)"}\` (${expectedLensKeys.join(", ") || "none"}) |`,
    `| verdict artifacts | \`${verdicts.length}\` |`,
    `| enforce findings | \`${enforceBlock}\` |`
  );

  writeSummary([...summary, "", ...body.slice(1)]);
  await upsertComment(body.join("\n"));

  console.log(headline.replace(/\n+/g, " "));
  process.exit(red ? 1 : 0);
}

await main();
