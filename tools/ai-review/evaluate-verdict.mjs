#!/usr/bin/env node
/**
 * Per-lens verdict evaluator for the AI multi-lens review gate (MDRS-50).
 *
 * This file exists because the reference implementation this gate is modelled
 * on (Sidre's .github/workflows/claude-code-review.yml) passed pull requests it
 * had never reviewed, for weeks, and reported "✅ All lenses passed" while doing
 * it. Two measured facts drive every decision below:
 *
 *  1. On Sidre run 31668933212 (PR #532) all six lenses returned the record
 *     `{"type":"result","subtype":"success","is_error":true,"duration_ms":309,
 *       "num_turns":1,"total_cost_usd":0}` — the signature of the model never
 *     running at all (the API rejected six concurrent sessions on a personal
 *     OAuth token). The action step still reported outcome=success, because the
 *     wrapper exited cleanly; the gate then found no verdict file and exited 0.
 *     A gate whose "green" is the ABSENCE of a failure cannot tell "reviewed and
 *     clean" from "never ran". So: green here is a positive assertion, built
 *     from harness-owned numbers, that a model actually did work.
 *
 *  2. A lens that DOES run a full, paid, successful review still fails to write
 *     a verdict file it was asked to write 15-30% of the time. Naive fail-closed
 *     on a model-written file reddens ~74% of PRs at six lenses. So the verdict
 *     is never read from a file the model was told to create. It is read from
 *     `$RUNNER_TEMP/claude-execution-output.json`, which claude-code-action
 *     writes itself, and from the model's own final message inside it. The model
 *     needs no Write tool anywhere — which is also the only way a "read-only"
 *     tool allowlist can be honest.
 *
 * What silently breaks without this file: the workflow would have to decide
 * red/green from `steps.<id>.outcome` in bash. That signal is actively wrong
 * here — Sidre's two death modes (rate-limit rejection, and the action refusing
 * to run on a PR that edits its own workflow) both exit 0, i.e. with the
 * OPPOSITE code from what their meaning warrants. Liveness must come from the
 * execution record, never from the wrapper's exit status.
 *
 * Four outcomes, four exit codes, one machine-readable line, one JSON artifact:
 *
 *   0 PASS            a review demonstrably ran and raised nothing blocking
 *   1 BLOCK           a review ran and raised >=1 blocking finding (enforcing)
 *   2 DEAD            liveness failed — the review cannot be shown to have run
 *   3 NOT_CONFIGURED  no ANTHROPIC_API_KEY — a documented skip, not a pass
 *
 * DEAD is unconditional. `AI_REVIEW_ENFORCE_BLOCK` is read by exactly one
 * function, called from exactly one branch (the findings branch), and it is
 * structurally unable to reach the liveness path — Sidre's bug was one `&&`
 * that put both axes in a single condition, so that any non-success outcome
 * fell through to PASS. Findings are the advisory axis; liveness is not.
 *
 * Usage (from .github/workflows/ai-review.yml):
 *   AI_REVIEW_LENS=authz AI_REVIEW_KEY_PRESENT=true \
 *   node tools/ai-review/evaluate-verdict.mjs
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

const EXIT_PASS = 0;
const EXIT_BLOCK = 1;
const EXIT_DEAD = 2;
const EXIT_NOT_CONFIGURED = 3;

const env = process.env;
const runnerTemp = env.RUNNER_TEMP || process.cwd();

const lens = env.AI_REVIEW_LENS || "unknown";
const lensTitle = env.AI_REVIEW_LENS_TITLE || lens;
const executionFile =
  env.AI_REVIEW_EXECUTION_FILE ||
  join(runnerTemp, "claude-execution-output.json");
const verdictFile =
  env.AI_REVIEW_VERDICT_FILE || join(runnerTemp, "ai-review-verdict.json");

// Severities that block, and the confidence required. A missing `confidence`
// is read as "high": the fail-closed reading. Over-blocking here is cheap —
// findings start advisory (AI_REVIEW_ENFORCE_BLOCK=false), so a false BLOCK
// costs a comment, while a false PASS costs the whole point of the gate.
const BLOCKING_SEVERITIES = new Set(["critical", "high"]);
const BLOCKING_CONFIDENCES = new Set(["high"]);

/**
 * The ONLY reader of the enforce flag. It is called from the findings branch
 * and from nowhere else; the liveness branch has already exited by the time
 * this can run. Keep it that way — inlining this check into a condition that
 * also tests liveness is precisely the Sidre defect (its :269
 * `[ "$REVIEW_OUTCOME" = "success" ] && [ "$AI_REVIEW_ENFORCE_BLOCK" = "true" ]`).
 */
function findingsAreEnforced() {
  return env.AI_REVIEW_ENFORCE_BLOCK === "true";
}

function writeSummary(lines) {
  const target = env.GITHUB_STEP_SUMMARY;
  if (!target) {
    console.log(lines.join("\n"));
    return;
  }
  appendFileSync(target, `${lines.join("\n")}\n`, "utf8");
}

function writeArtifact(payload) {
  mkdirSync(dirname(verdictFile), { recursive: true });
  writeFileSync(verdictFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function truncate(value, max = 1200) {
  if (typeof value !== "string") return "";
  return value.length <= max ? value : `${value.slice(0, max)}\n…[truncated]`;
}

/**
 * Terminal path. Every exit from this script goes through here, so the artifact
 * and the machine-readable line always exist for the aggregator — including on
 * DEAD, which is exactly when a human needs them most.
 */
function finish({
  verdict,
  exitCode,
  reason,
  liveness,
  findings,
  blocking,
  advisory,
  resultText,
}) {
  const payload = {
    lens,
    title: lensTitle,
    verdict,
    exitCode,
    reason,
    advisory: Boolean(advisory),
    blockingCount: blocking ? blocking.length : 0,
    findingsCount: findings ? findings.length : 0,
    findings: findings ?? [],
    liveness: liveness ?? null,
    resultExcerpt: truncate(resultText, 600),
  };
  writeArtifact(payload);

  const icon =
    verdict === "PASS"
      ? "✅"
      : verdict === "BLOCK"
        ? advisory
          ? "⚠️"
          : "❌"
        : verdict === "DEAD"
          ? "💀"
          : "⏭️";

  const lines = [
    `### ${icon} AI review — ${lensTitle} (\`${lens}\`): ${verdict}`,
    "",
    reason,
    "",
  ];

  // Always echo the raw harness numbers. The Sidre outage went undiagnosed
  // across ~40 runs because nothing ever printed them; with these three values
  // on the run page, `is_error=true / num_turns=1 / total_cost_usd=0` names the
  // failure at a glance.
  lines.push("| liveness signal | value |", "| --- | --- |");
  if (liveness) {
    lines.push(
      `| execution record | \`${liveness.file}\` |`,
      `| file present | \`${liveness.filePresent}\` |`,
      `| is_error | \`${liveness.isError}\` |`,
      `| num_turns | \`${liveness.numTurns}\` |`,
      `| total_cost_usd | \`${liveness.totalCostUsd}\` |`,
      `| duration_ms | \`${liveness.durationMs}\` |`
    );
  } else {
    lines.push("| execution record | not read (lens did not run) |");
  }
  lines.push(
    "",
    `Findings enforcement: \`AI_REVIEW_ENFORCE_BLOCK=${env.AI_REVIEW_ENFORCE_BLOCK ?? "unset"}\` (liveness is enforced regardless).`
  );

  if (findings && findings.length > 0) {
    lines.push("", "#### Findings", "");
    for (const finding of findings) {
      const blocks = finding.__blocking ? "**BLOCKING** " : "";
      const where = finding.file
        ? `\`${finding.file}${finding.line ? `:${finding.line}` : ""}\` — `
        : "";
      lines.push(
        `- ${blocks}[${finding.severity ?? "?"}/${finding.confidence ?? "?"}] ${where}${finding.title ?? "(untitled)"}`
      );
      if (finding.detail) lines.push(`  - ${finding.detail}`);
      if (finding.fix) lines.push(`  - Fix: ${finding.fix}`);
    }
  }

  if (verdict === "DEAD") {
    lines.push(
      "",
      "#### Raw `result` from the execution record",
      "",
      "```text",
      truncate(resultText) || "(empty)",
      "```"
    );
  }

  writeSummary(lines);

  // The machine-readable line the aggregator falls back to when artifacts are
  // unavailable, and the one a human greps for in the raw log.
  console.log(
    `AI_REVIEW_VERDICT=${verdict} lens=${lens} exit=${exitCode} advisory=${Boolean(advisory)} blocking=${payload.blockingCount}`
  );
  if (env.GITHUB_OUTPUT) {
    appendFileSync(env.GITHUB_OUTPUT, `verdict=${verdict}\n`, "utf8");
  }
  process.exit(exitCode);
}

/**
 * claude-code-action writes the execution record as either the result object
 * itself or the full message log with the result object last. Accept both, and
 * treat "neither" as DEAD rather than guessing.
 */
function extractResultRecord(parsed) {
  if (Array.isArray(parsed)) {
    for (let i = parsed.length - 1; i >= 0; i -= 1) {
      const entry = parsed[i];
      if (entry && typeof entry === "object" && entry.type === "result")
        return entry;
    }
    const last = parsed[parsed.length - 1];
    return last && typeof last === "object" && "is_error" in last ? last : null;
  }
  if (parsed && typeof parsed === "object") {
    if (parsed.type === "result" || "is_error" in parsed) return parsed;
    if (Array.isArray(parsed.messages))
      return extractResultRecord(parsed.messages);
  }
  return null;
}

/**
 * Every balanced `{…}` span in the text, as `[start, end)` offsets, string- and
 * escape-aware so that a brace inside a JSON string value does not shift the
 * depth. A stack of open positions means an UNMATCHED `{` earlier in the text —
 * the model writing "use a { here" before its answer — cannot swallow the real
 * object: its opener simply stays on the stack and is discarded, while the real
 * object's own pair is still emitted. Nested spans are emitted too; they are
 * filtered out below by requiring a `findings` array.
 */
function balancedSpans(text) {
  const spans = [];
  const stack = [];
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") stack.push(i);
    else if (char === "}" && stack.length > 0) spans.push([stack.pop(), i + 1]);
  }
  return spans;
}

/**
 * Pull the findings object out of the model's final message.
 *
 * The model is told to emit a bare JSON object and nothing else; in practice it
 * fences it, narrates around it, or — the case that matters — restates the
 * schema block the prompt showed it BEFORE emitting its real answer. Two rules
 * follow from that, and both were bugs here before:
 *
 *  1. POSITION IS THE DISAMBIGUATOR, NOT ORDER OF CLEVERNESS. The contract says
 *     the object is the LAST thing in the message, so among all candidates that
 *     look like a findings object we take the one that starts LATEST. Preferring
 *     the first fence (as this did) makes a model that echoes the schema
 *     template report PASS with zero findings — a confirmed critical finding
 *     silently discarded, which is the exact failure this gate exists to stop.
 *
 *  2. PROSE CONTAINING A BRACE MUST NOT KILL A PAID REVIEW. `indexOf("{")` to
 *     `lastIndexOf("}")` (as this did) spans from a `${VAR}` or an
 *     `apps/{tedrisat,teskilat}` glob in the preamble — the lens prompts
 *     themselves contain such globs — right through the real object, parses as
 *     nothing, and turned a healthy review DEAD/red. Scanning balanced spans
 *     finds the object regardless of what surrounds it.
 *
 * "Found nothing usable" is still DEAD, not PASS: an unreadable final message
 * means we cannot assert what the review concluded.
 */
function extractFindingsJson(resultText) {
  const trimmed = (resultText ?? "").trim();
  if (!trimmed) return null;

  // [startOffset, text]. Offset 0 for the whole message so that a bare object
  // is the lowest-priority reading of itself, never a competitor to a later span.
  const candidates = [[0, trimmed]];

  for (const match of trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi))
    candidates.push([match.index, match[1].trim()]);

  for (const [start, end] of balancedSpans(trimmed))
    candidates.push([start, trimmed.slice(start, end)]);

  let best = null;
  let fallback = null;
  for (const [start, candidate] of candidates) {
    let parsed;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      continue; // not JSON: prose, a path glob, a `${VAR}`, a fenced diff
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      continue;
    if (Array.isArray(parsed.findings)) {
      if (!best || start >= best.start) best = { start, parsed };
    } else if (!fallback || start >= fallback.start) {
      fallback = { start, parsed };
    }
  }
  // The fallback (an object with no `findings` array) is returned so the caller
  // reports "ran but did not answer in the contract shape" rather than "no JSON
  // at all". Both are DEAD; only the reason text differs.
  return best ? best.parsed : (fallback?.parsed ?? null);
}

function isBlocking(finding) {
  const severity = String(finding.severity ?? "").toLowerCase();
  const confidence = String(finding.confidence ?? "high").toLowerCase();
  return (
    BLOCKING_SEVERITIES.has(severity) && BLOCKING_CONFIDENCES.has(confidence)
  );
}

// ── 1. Configuration ───────────────────────────────────────────────────────
// medaris has zero repository secrets today (`actions/secrets` → total_count 0).
// "No key" is a configuration state, not a review outcome: it must not read as
// a pass, and it must not crash. The workflow maps exit 3 — and only exit 3 —
// to a non-failing step; the aggregator turns it into a stated, visible skip.
// Reaching this branch at all means the preflight job's own key check was
// wrong, so it is defence in depth rather than the normal path.
if (env.AI_REVIEW_KEY_PRESENT !== "true") {
  finish({
    verdict: "NOT_CONFIGURED",
    exitCode: EXIT_NOT_CONFIGURED,
    reason:
      "`ANTHROPIC_API_KEY` is not configured for this repository, so no lens could run. " +
      "This is a documented skip, **not** a passing review: nothing was examined. " +
      "Provision the secret to turn the gate on.",
    liveness: null,
  });
}

// ── 2. Liveness ────────────────────────────────────────────────────────────
// Everything below is the positive assertion that a model did work. It runs
// before any notion of findings or enforcement exists.
const liveness = {
  file: executionFile,
  filePresent: existsSync(executionFile),
  isError: null,
  numTurns: null,
  totalCostUsd: null,
  durationMs: null,
};

if (!liveness.filePresent) {
  finish({
    verdict: "DEAD",
    exitCode: EXIT_DEAD,
    reason:
      `The action wrote no execution record at \`${executionFile}\`. The lens cannot be shown to ` +
      "have run, so the gate reports **red**. This is the case Sidre exited 0 on.",
    liveness,
  });
}

let rawRecord = "";
let parsedRecord = null;
try {
  rawRecord = readFileSync(executionFile, "utf8");
  parsedRecord = JSON.parse(rawRecord);
} catch (error) {
  finish({
    verdict: "DEAD",
    exitCode: EXIT_DEAD,
    reason: `The execution record at \`${executionFile}\` is not parseable JSON (${error.message}).`,
    liveness,
    resultText: truncate(rawRecord, 600),
  });
}

const record = extractResultRecord(parsedRecord);
if (!record) {
  finish({
    verdict: "DEAD",
    exitCode: EXIT_DEAD,
    reason:
      "The execution record parsed but contained no `result` object. Either the action's output " +
      "shape changed (fix this script, do not bypass it) or the session produced nothing.",
    liveness,
    resultText: truncate(rawRecord, 600),
  });
}

liveness.isError = record.is_error;
liveness.numTurns = record.num_turns;
liveness.totalCostUsd = record.total_cost_usd;
liveness.durationMs = record.duration_ms;

const resultText = typeof record.result === "string" ? record.result : "";

// Liveness, split into what is auth-independent and what is not.
//
// Both observed death modes are caught by the first two assertions alone:
//
//   never invoked        is_error=true  num_turns=1  total_cost_usd=0
//   one turn, error text is_error=true  num_turns=2  total_cost_usd=0.1285
//
// so `is_error === false && num_turns > 1` is the load-bearing pair, and it
// holds under any authentication mode.
//
// Cost is deliberately NOT load-bearing. This gate runs on a subscription
// OAuth token rather than a metered API key, because medaris has no budget.
// The reference implementation's healthy runs did report real per-lens costs
// under the same auth, so `> 0` would probably hold — but "probably" is the
// wrong footing for the assertion that decides whether every review is
// believed. If a subscription ever reports zero, a `> 0` check would mark
// every healthy run DEAD and the gate would be worse than useless.
//
// What IS asserted for every mode is that the field is present and numeric.
// A well-formed result record always carries it; its absence means we are
// looking at something other than a completed run, which is exactly the
// condition this function exists to catch. The `> 0` refinement applies only
// when AI_REVIEW_AUTH_MODE says a metered key is in play, where a zero really
// does mean nothing was spent and therefore nothing ran.
const authMode = process.env.AI_REVIEW_AUTH_MODE ?? "oauth";

const livenessFailures = [];
if (record.is_error !== false)
  livenessFailures.push(
    `is_error is \`${record.is_error}\`, expected \`false\``
  );
if (!(typeof record.num_turns === "number" && record.num_turns > 1))
  livenessFailures.push(
    `num_turns is \`${record.num_turns}\`, expected a number > 1`
  );
if (typeof record.total_cost_usd !== "number")
  livenessFailures.push(
    `total_cost_usd is \`${record.total_cost_usd}\`, expected a number ` +
      "(its absence means this is not a completed result record)"
  );
else if (authMode === "api-key" && !(record.total_cost_usd > 0))
  livenessFailures.push(
    `total_cost_usd is \`${record.total_cost_usd}\` under metered auth ` +
      "(AI_REVIEW_AUTH_MODE=api-key), expected a number > 0 — a billed run " +
      "that cost nothing did not happen"
  );

if (livenessFailures.length > 0) {
  finish({
    verdict: "DEAD",
    exitCode: EXIT_DEAD,
    reason:
      "Liveness assertion failed — the model did not demonstrably run, so no verdict can be " +
      `trusted from this lens:\n\n${livenessFailures.map((f) => `- ${f}`).join("\n")}\n\n` +
      "`is_error:true / num_turns:1 / total_cost_usd:0` is the rate-limit-rejection signature; " +
      "read the raw `result` below for the API's own message.",
    liveness,
    resultText,
  });
}

// ── 3. Findings ────────────────────────────────────────────────────────────
// Only now — with liveness proven — does the advisory axis come into play.
const findingsObject = extractFindingsJson(resultText);
if (!findingsObject || !Array.isArray(findingsObject.findings)) {
  finish({
    verdict: "DEAD",
    exitCode: EXIT_DEAD,
    reason:
      "The lens ran (liveness holds) but its final message was not a findings object with a " +
      "`findings` array. The gate cannot tell a clean review from a lost one, so it reports " +
      "**red** rather than assuming the former. Re-run; if it recurs, the lens prompt drifted.",
    liveness,
    resultText,
  });
}

const findings = findingsObject.findings.map((finding) => ({
  severity: finding.severity,
  confidence: finding.confidence,
  file: finding.file,
  line: finding.line,
  title: finding.title,
  detail: finding.detail,
  fix: finding.fix,
  __blocking: isBlocking(finding),
}));
const blocking = findings.filter((finding) => finding.__blocking);

if (blocking.length === 0) {
  finish({
    verdict: "PASS",
    exitCode: EXIT_PASS,
    reason:
      `The ${lensTitle} lens reviewed this pull request and raised no blocking finding ` +
      `(${findings.length} advisory finding(s)).` +
      (findingsObject.summary ? `\n\n${findingsObject.summary}` : ""),
    liveness,
    findings,
    blocking,
    resultText,
  });
}

const enforced = findingsAreEnforced();
finish({
  verdict: "BLOCK",
  exitCode: enforced ? EXIT_BLOCK : EXIT_PASS,
  advisory: !enforced,
  reason: enforced
    ? `The ${lensTitle} lens raised ${blocking.length} blocking finding(s). Address them and push.`
    : `The ${lensTitle} lens raised ${blocking.length} blocking finding(s). ` +
      "`AI_REVIEW_ENFORCE_BLOCK` is not `true`, so this is **advisory** and does not fail the " +
      "check. Liveness is unaffected by that flag and is still enforced.",
  liveness,
  findings,
  blocking,
  resultText,
});
