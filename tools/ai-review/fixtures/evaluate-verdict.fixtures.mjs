#!/usr/bin/env node
/**
 * Fixture suite for tools/ai-review/evaluate-verdict.mjs (MDRS-50).
 *
 * This file exists because the gate cannot test its own verdict logic in CI, by
 * construction. Both jobs in .github/workflows/ai-review.yml run the evaluator
 * from `.gate-base` — a checkout of the BASE branch — so that a pull request
 * cannot supply the code that decides whether it passes. The consequence is that
 * an edit to evaluate-verdict.mjs is never exercised by the run that reviews it;
 * these fixtures are the only pre-merge signal on that file.
 *
 * It runs the real script as a subprocess against constructed execution records
 * and asserts the exit code, the machine-readable line and the verdict artifact.
 * Every case below is a shape that was observed or reproduced, not invented:
 *
 *  - The Sidre death record. `is_error:true / num_turns:1 / total_cost_usd:0`,
 *    the signature of the model never running, which the reference gate reported
 *    as "✅ All lenses passed".
 *  - The extractor cases. Two of them (`template fence then the real object`,
 *    and prose containing a brace before the object) were REAL defects found by
 *    red-teaming this implementation: the first silently discarded a confirmed
 *    critical finding and reported PASS, the second turned a healthy paid review
 *    red. Both are regressions worth catching forever — if you change
 *    extractFindingsJson, these are the cases that say whether you broke it.
 *  - Both values of AI_REVIEW_ENFORCE_BLOCK against a dead lens, asserting that
 *    the advisory flag cannot reach the liveness path in either direction. That
 *    conjunction is the whole of the reference implementation's bug.
 *
 * What silently breaks without this file: the two extractor defects above are
 * invisible in every artifact, summary and PR comment the gate produces — a lens
 * that discards its findings reports exactly what a clean review reports. There
 * is no signal anywhere except this suite.
 *
 * Usage: node tools/ai-review/fixtures/evaluate-verdict.fixtures.mjs
 */

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = join(
  dirname(dirname(fileURLToPath(import.meta.url))),
  "evaluate-verdict.mjs"
);

const CODE = {
  0: "PASS(0)",
  1: "BLOCK(1)",
  2: "DEAD(2)",
  3: "NOT_CONFIGURED(3)",
};

const healthy = (result) => ({
  type: "result",
  subtype: "success",
  is_error: false,
  duration_ms: 412_000,
  num_turns: 37,
  total_cost_usd: 1.04,
  result,
});

const findingsJson = (findings, summary = "checked the diff") =>
  JSON.stringify({ lens: "authz", summary, findings });

const BLOCKING = [
  {
    severity: "high",
    confidence: "high",
    file: "apps/teskilat/src/auth.ts",
    line: 42,
    title: "Admin route has no guard",
    detail: "Anyone authenticated can call it.",
    fix: "Add the roles guard.",
  },
];

// The schema block the workflow prompt shows the model. A model that restates it
// before answering used to win the extractor's "first fence" preference.
const TEMPLATE_FENCE =
  '```json\n{\n  "lens": "authz",\n  "summary": "one or two sentences",\n' +
  '  "findings": [\n    {\n      "severity": "critical|high|medium|low",\n' +
  '      "confidence": "high|medium|low"\n    }\n  ]\n}\n```\n';

const cases = [
  {
    name: "Sidre death record (is_error:true, num_turns:1, total_cost_usd:0)",
    record: {
      type: "result",
      subtype: "success",
      is_error: true,
      duration_ms: 309,
      num_turns: 1,
      total_cost_usd: 0,
      result: "Credit balance is too low / rate limit exceeded",
    },
    expect: { exit: 2, verdict: "DEAD" },
  },
  {
    name: "missing execution record file",
    record: null,
    expect: { exit: 2, verdict: "DEAD" },
  },
  {
    name: "malformed JSON in result",
    record: healthy('Here is my review: {"lens": "authz", "findings": [ oops'),
    expect: { exit: 2, verdict: "DEAD" },
  },
  {
    name: "healthy record, no findings key at all (prose-only final message)",
    record: healthy("Everything looks fine to me!"),
    expect: { exit: 2, verdict: "DEAD" },
  },
  {
    name: "healthy record with a blocking finding, enforcing",
    record: healthy(findingsJson(BLOCKING)),
    env: { AI_REVIEW_ENFORCE_BLOCK: "true" },
    expect: { exit: 1, verdict: "BLOCK", advisory: false, blocking: 1 },
  },
  {
    name: "healthy record with a blocking finding, advisory (default)",
    record: healthy(findingsJson(BLOCKING)),
    env: { AI_REVIEW_ENFORCE_BLOCK: "false" },
    expect: { exit: 0, verdict: "BLOCK", advisory: true, blocking: 1 },
  },
  {
    name: "healthy record with no findings",
    record: healthy(findingsJson([])),
    expect: { exit: 0, verdict: "PASS", blocking: 0 },
  },
  {
    name: "healthy record, high severity but low confidence (advisory only)",
    record: healthy(
      findingsJson([
        { severity: "high", confidence: "low", title: "maybe a race" },
      ])
    ),
    expect: { exit: 0, verdict: "PASS", blocking: 0 },
  },
  {
    name: "healthy record, high severity with confidence omitted (fail closed)",
    record: healthy(
      findingsJson([{ severity: "critical", title: "secret in repo" }])
    ),
    env: { AI_REVIEW_ENFORCE_BLOCK: "true" },
    expect: { exit: 1, verdict: "BLOCK", blocking: 1 },
  },
  {
    name: "findings JSON wrapped in a ```json fence with prose around it",
    record: healthy(
      `Done reviewing.\n\`\`\`json\n${findingsJson(BLOCKING)}\n\`\`\`\nThanks!`
    ),
    env: { AI_REVIEW_ENFORCE_BLOCK: "true" },
    expect: { exit: 1, verdict: "BLOCK", blocking: 1 },
  },

  // ── Extractor regressions: the two reproduced fail-open / cry-wolf paths ──
  {
    name: "REGRESSION: model restates the schema fence, THEN emits the real object",
    record: healthy(
      `I will answer in this shape:\n\n${TEMPLATE_FENCE}\nHere is my review:\n\n${findingsJson(BLOCKING)}`
    ),
    env: { AI_REVIEW_ENFORCE_BLOCK: "true" },
    // Was PASS / exit 0 / findingsCount 0: the template fence won and a
    // confirmed critical finding vanished from the artifact, the summary and
    // the PR comment.
    expect: { exit: 1, verdict: "BLOCK", blocking: 1, findings: 1 },
  },
  {
    name: "REGRESSION: schema fence, then the real object also fenced",
    record: healthy(
      `Schema:\n\n${TEMPLATE_FENCE}\nResult:\n\n\`\`\`json\n${findingsJson(BLOCKING)}\n\`\`\``
    ),
    env: { AI_REVIEW_ENFORCE_BLOCK: "true" },
    expect: { exit: 1, verdict: "BLOCK", blocking: 1, findings: 1 },
  },
  {
    // The literal `${VAR}` IS the fixture: a model narrating about shell or
    // template interpolation before its findings object used to make the
    // extractor pick the wrong candidate and report a silent PASS.
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the literal is the test input
    name: "REGRESSION: prose containing ${VAR} before the object",
    record: healthy(
      `The config uses \${VAR} interpolation.\nVerdict:\n${findingsJson(BLOCKING)}`
    ),
    env: { AI_REVIEW_ENFORCE_BLOCK: "true" },
    // Was DEAD / exit 2 — indexOf("{")..lastIndexOf("}") spanned the ${VAR}.
    // The lens prompts themselves contain brace-bearing globs, so this was the
    // most likely red in the whole system.
    expect: { exit: 1, verdict: "BLOCK", blocking: 1 },
  },
  {
    name: "REGRESSION: prose containing a path glob before the object",
    record: healthy(
      `I looked at apps/{tedrisat,teskilat}/test/{unit,e2e} first.\n${findingsJson([])}`
    ),
    expect: { exit: 0, verdict: "PASS", blocking: 0 },
  },
  {
    name: "REGRESSION: a scratch JSON object before the findings object",
    record: healthy(`{"note":"scratch"}\n\n${findingsJson(BLOCKING)}`),
    env: { AI_REVIEW_ENFORCE_BLOCK: "true" },
    expect: { exit: 1, verdict: "BLOCK", blocking: 1 },
  },
  {
    name: "unmatched `{` in prose cannot swallow the real object",
    record: healthy(`Consider a { in prose.\n${findingsJson(BLOCKING)}`),
    env: { AI_REVIEW_ENFORCE_BLOCK: "true" },
    expect: { exit: 1, verdict: "BLOCK", blocking: 1 },
  },
  {
    name: "object whose string values contain braces and a fence",
    record: healthy(
      findingsJson([
        {
          severity: "high",
          confidence: "high",
          // Asserts a finding whose own text contains braces does not shift the
          // brace-depth scanner and truncate the object.
          // biome-ignore lint/suspicious/noTemplateCurlyInString: the literal is the test input
          title: "uses ${DB_PASSWORD} in ```code```",
          detail: "a } and a { inside a string must not shift depth",
        },
      ])
    ),
    env: { AI_REVIEW_ENFORCE_BLOCK: "true" },
    expect: { exit: 1, verdict: "BLOCK", blocking: 1 },
  },
  {
    name: "object emitted first, trailing prose after it",
    record: healthy(`${findingsJson([])}\n\nThat is everything I found.`),
    expect: { exit: 0, verdict: "PASS", blocking: 0 },
  },

  {
    name: "execution record as a message array with the result last",
    record: [
      { type: "system", subtype: "init" },
      { type: "assistant", message: { content: [] } },
      healthy(findingsJson([])),
    ],
    expect: { exit: 0, verdict: "PASS" },
  },
  {
    name: "liveness: num_turns == 1 on an otherwise clean record",
    record: { ...healthy(findingsJson([])), num_turns: 1 },
    expect: { exit: 2, verdict: "DEAD" },
  },
  // Cost is auth-mode dependent, and these three pin exactly how. Under a
  // metered key a zero-cost run cannot have happened, so it is DEAD. Under the
  // subscription token this gate actually uses, zero is not evidence of
  // anything and must NOT redden a healthy review — that would take every run
  // down. What stays load-bearing in both modes is that the field EXISTS: its
  // absence means this is not a completed result record.
  {
    name: "liveness: total_cost_usd == 0 under metered auth (api-key)",
    record: { ...healthy(findingsJson([])), total_cost_usd: 0 },
    env: { AI_REVIEW_AUTH_MODE: "api-key" },
    expect: { exit: 2, verdict: "DEAD" },
  },
  {
    name: "liveness: total_cost_usd == 0 under subscription auth (oauth) is NOT dead",
    record: { ...healthy(findingsJson([])), total_cost_usd: 0 },
    env: { AI_REVIEW_AUTH_MODE: "oauth" },
    expect: { exit: 0, verdict: "PASS" },
  },
  {
    name: "liveness: total_cost_usd absent entirely is DEAD in every auth mode",
    record: (() => {
      const { total_cost_usd, ...rest } = healthy(findingsJson([]));
      void total_cost_usd;
      return rest;
    })(),
    env: { AI_REVIEW_AUTH_MODE: "oauth" },
    expect: { exit: 2, verdict: "DEAD" },
  },
  {
    name: "liveness: the Sidre death record stays DEAD under subscription auth",
    record: {
      type: "result",
      subtype: "success",
      is_error: true,
      num_turns: 1,
      total_cost_usd: 0,
      duration_ms: 309,
      result: "",
    },
    env: { AI_REVIEW_AUTH_MODE: "oauth" },
    expect: { exit: 2, verdict: "DEAD" },
  },
  {
    name: "liveness: is_error missing entirely",
    record: (() => {
      const { is_error, ...rest } = healthy(findingsJson([]));
      void is_error;
      return rest;
    })(),
    expect: { exit: 2, verdict: "DEAD" },
  },
  {
    name: "no ANTHROPIC_API_KEY (documented skip)",
    record: null,
    env: { AI_REVIEW_KEY_PRESENT: "false" },
    expect: { exit: 3, verdict: "NOT_CONFIGURED" },
  },
  {
    name: "ENFORCE_BLOCK=true cannot rescue a dead lens",
    record: {
      type: "result",
      is_error: true,
      num_turns: 1,
      total_cost_usd: 0,
      result: "rate limited",
    },
    env: { AI_REVIEW_ENFORCE_BLOCK: "true" },
    expect: { exit: 2, verdict: "DEAD" },
  },
  {
    name: "ENFORCE_BLOCK=false cannot rescue a dead lens either",
    record: {
      type: "result",
      is_error: true,
      num_turns: 1,
      total_cost_usd: 0,
      result: "rate limited",
    },
    env: { AI_REVIEW_ENFORCE_BLOCK: "false" },
    expect: { exit: 2, verdict: "DEAD" },
  },
];

let failures = 0;
const results = [];

for (const testCase of cases) {
  const dir = mkdtempSync(join(tmpdir(), "mdrs50-"));
  const executionFile = join(dir, "claude-execution-output.json");
  const verdictFile = join(dir, "ai-review-verdict.json");
  const summaryFile = join(dir, "summary.md");
  writeFileSync(summaryFile, "");
  if (testCase.record !== null) {
    writeFileSync(executionFile, JSON.stringify(testCase.record, null, 2));
  }

  let stdout = "";
  let exitCode = 0;
  try {
    stdout = execFileSync("node", [SCRIPT], {
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        RUNNER_TEMP: dir,
        AI_REVIEW_LENS: "authz",
        AI_REVIEW_LENS_TITLE: "Authorization",
        AI_REVIEW_EXECUTION_FILE: executionFile,
        AI_REVIEW_VERDICT_FILE: verdictFile,
        AI_REVIEW_KEY_PRESENT: "true",
        GITHUB_STEP_SUMMARY: summaryFile,
        ...(testCase.env ?? {}),
      },
    });
  } catch (error) {
    exitCode = error.status;
    stdout = error.stdout ?? "";
  }

  const line = (stdout.match(/^AI_REVIEW_VERDICT=.*$/m) ?? ["(none)"])[0];
  const artifact = existsSync(verdictFile)
    ? JSON.parse(readFileSync(verdictFile, "utf8"))
    : null;
  const summary = readFileSync(summaryFile, "utf8");

  const problems = [];
  if (exitCode !== testCase.expect.exit)
    problems.push(`exit ${exitCode} != ${testCase.expect.exit}`);
  if (!artifact) problems.push("no verdict artifact written");
  else {
    if (artifact.verdict !== testCase.expect.verdict)
      problems.push(
        `artifact verdict ${artifact.verdict} != ${testCase.expect.verdict}`
      );
    if (
      "advisory" in testCase.expect &&
      artifact.advisory !== testCase.expect.advisory
    )
      problems.push(
        `advisory ${artifact.advisory} != ${testCase.expect.advisory}`
      );
    if (
      "blocking" in testCase.expect &&
      artifact.blockingCount !== testCase.expect.blocking
    )
      problems.push(
        `blockingCount ${artifact.blockingCount} != ${testCase.expect.blocking}`
      );
    if (
      "findings" in testCase.expect &&
      artifact.findingsCount !== testCase.expect.findings
    )
      problems.push(
        `findingsCount ${artifact.findingsCount} != ${testCase.expect.findings}`
      );
  }
  if (!line.includes(`AI_REVIEW_VERDICT=${testCase.expect.verdict}`))
    problems.push(`machine line: ${line}`);
  // Every non-skip path must echo the three raw liveness numbers into the summary.
  if (testCase.expect.verdict !== "NOT_CONFIGURED") {
    for (const field of ["is_error", "num_turns", "total_cost_usd"]) {
      if (!summary.includes(field)) problems.push(`summary missing ${field}`);
    }
  }

  if (problems.length > 0) failures += 1;
  results.push({
    name: testCase.name,
    expected: `${testCase.expect.verdict} / exit ${testCase.expect.exit}`,
    actual: `${artifact ? artifact.verdict : "no artifact"} / exit ${exitCode} (${CODE[exitCode] ?? exitCode})`,
    line,
    status: problems.length === 0 ? "PASS" : `FAIL — ${problems.join("; ")}`,
  });
  rmSync(dir, { recursive: true, force: true });
}

for (const result of results) {
  console.log(`\n• ${result.name}`);
  console.log(`    expected : ${result.expected}`);
  console.log(`    actual   : ${result.actual}`);
  console.log(`    stdout   : ${result.line}`);
  console.log(`    ${result.status}`);
}
console.log(`\n${results.length - failures}/${results.length} fixtures passed`);
process.exit(failures === 0 ? 0 : 1);
