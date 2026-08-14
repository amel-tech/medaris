#!/usr/bin/env node
/**
 * Fixture suite for tools/ai-review/aggregate-gate.mjs (MDRS-50).
 *
 * Same reason for existing as its sibling: the gate runs the aggregator from
 * `.gate-base` (a checkout of the base branch) so that a pull request cannot
 * supply the code that judges it, which means a change to the aggregator is
 * never exercised by the run that reviews it. This suite is the only pre-merge
 * signal on that file.
 *
 * It exercises every `needs.*.result` value for both jobs, every skip mode, and
 * — the part worth being careful about — every way the aggregator can be told
 * something it does not understand. The single property under test is that NO
 * input produces a green gate without a positive assertion that a review
 * happened. Four cases below are reproduced fail-open paths, each of which
 * printed a green headline before the fix:
 *
 *   PREFLIGHT_MODE=''       → "✅ No lens matched this diff"
 *   PREFLIGHT_MODE='banana' → "✅ No lens matched this diff"
 *   lens_count='' or 'abc'  → "✅ No lens matched this diff"  (parseInt→NaN→0)
 *   lens_count=2, keys='', zero artifacts
 *                           → "✅ 0 of 2 lenses reviewed this pull request"
 *
 * The last one is the one to keep: it is the gate contradicting itself in its
 * own headline, because the "every selected lens reported back" check was
 * written against lens KEYS only and passes vacuously when the key list is
 * empty.
 *
 * No GH_TOKEN is set, so the sticky-comment path degrades to a notice rather
 * than making network calls.
 *
 * Usage: node tools/ai-review/fixtures/aggregate-gate.fixtures.mjs
 */

import { execFileSync } from "node:child_process";
import {
  mkdirSync,
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
  "aggregate-gate.mjs"
);

const liveness = {
  file: "x",
  filePresent: true,
  isError: false,
  numTurns: 22,
  totalCostUsd: 0.9,
};
const verdict = (lens, over = {}) => ({
  lens,
  title: lens,
  verdict: "PASS",
  exitCode: 0,
  reason: "ok",
  advisory: false,
  blockingCount: 0,
  findingsCount: 0,
  findings: [],
  liveness,
  ...over,
});

const cases = [
  // ── The review window ──────────────────────────────────────────────────────
  // `queued` is the one mode that is deferred rather than decided, and it is
  // the mode most likely to be "simplified" into a skip by someone who reads
  // skip as harmless. These three pin it: queued is RED, it is red for a stated
  // reason that does not read as a finding, and no flag can turn it green.
  {
    name: "queued for the review window — RED, not a skip",
    env: {
      PREFLIGHT_RESULT: "success",
      PREFLIGHT_MODE: "queued",
      PREFLIGHT_SKIP_REASON:
        "opened outside the review window (`19:00-00:00 UTC`)",
      LENS_RESULT: "skipped",
      PREFLIGHT_LENS_COUNT: "",
    },
    verdicts: [],
    expect: { exit: 1, contains: "Queued for the nightly review window" },
  },
  {
    name: "queued stays RED with AI_REVIEW_ENFORCE_BLOCK=false",
    env: {
      PREFLIGHT_RESULT: "success",
      PREFLIGHT_MODE: "queued",
      PREFLIGHT_SKIP_REASON: "opened outside the review window",
      LENS_RESULT: "skipped",
      PREFLIGHT_LENS_COUNT: "",
      AI_REVIEW_ENFORCE_BLOCK: "false",
    },
    verdicts: [],
    expect: { exit: 1, contains: "Queued for the nightly review window" },
  },
  {
    name: "queued says plainly that nothing was reviewed",
    env: {
      PREFLIGHT_RESULT: "success",
      PREFLIGHT_MODE: "queued",
      PREFLIGHT_SKIP_REASON: "opened outside the review window",
      LENS_RESULT: "skipped",
      PREFLIGHT_LENS_COUNT: "",
    },
    verdicts: [],
    expect: { exit: 1, contains: "Nothing has been reviewed yet" },
  },
  {
    name: "fork PR — documented skip",
    env: {
      PREFLIGHT_RESULT: "success",
      PREFLIGHT_MODE: "skip",
      PREFLIGHT_SKIP_REASON: "this is a fork pull request",
      LENS_RESULT: "skipped",
      PREFLIGHT_LENS_COUNT: "",
    },
    verdicts: [],
    expect: { exit: 0, contains: "No AI review ran" },
  },
  {
    name: "no lens matched the diff — green, but carries the human-review caveat",
    env: {
      PREFLIGHT_RESULT: "success",
      PREFLIGHT_MODE: "run",
      LENS_RESULT: "skipped",
      PREFLIGHT_LENS_COUNT: "0",
      PREFLIGHT_LENS_KEYS: "",
    },
    verdicts: [],
    expect: {
      exit: 0,
      contains: "No lens matched",
      // The zero-lens state used to be the one green state that read as an
      // endorsement. A committed `.env` can land here.
      alsoContains: "Human review carries the whole weight",
    },
  },
  {
    name: "all lenses passed",
    env: {
      PREFLIGHT_RESULT: "success",
      PREFLIGHT_MODE: "run",
      LENS_RESULT: "success",
      PREFLIGHT_LENS_COUNT: "3",
      PREFLIGHT_LENS_KEYS: "authz,perf,rtl",
    },
    verdicts: [verdict("authz"), verdict("perf"), verdict("rtl")],
    expect: { exit: 0, contains: "raised nothing blocking" },
  },
  {
    name: "one lens DEAD (liveness failed)",
    env: {
      PREFLIGHT_RESULT: "success",
      PREFLIGHT_MODE: "run",
      LENS_RESULT: "failure",
      PREFLIGHT_LENS_COUNT: "2",
      PREFLIGHT_LENS_KEYS: "authz,perf",
    },
    verdicts: [
      verdict("authz"),
      verdict("perf", {
        verdict: "DEAD",
        exitCode: 2,
        liveness: { ...liveness, isError: true, numTurns: 1, totalCostUsd: 0 },
      }),
    ],
    expect: { exit: 1, contains: "could not be shown to have run" },
  },
  {
    name: "one lens DEAD while ENFORCE_BLOCK=false",
    env: {
      PREFLIGHT_RESULT: "success",
      PREFLIGHT_MODE: "run",
      LENS_RESULT: "failure",
      PREFLIGHT_LENS_COUNT: "1",
      PREFLIGHT_LENS_KEYS: "authz",
      AI_REVIEW_ENFORCE_BLOCK: "false",
    },
    verdicts: [verdict("authz", { verdict: "DEAD", exitCode: 2 })],
    expect: { exit: 1, contains: "could not be shown to have run" },
  },
  {
    name: "enforced blocking finding",
    env: {
      PREFLIGHT_RESULT: "success",
      PREFLIGHT_MODE: "run",
      LENS_RESULT: "failure",
      PREFLIGHT_LENS_COUNT: "1",
      PREFLIGHT_LENS_KEYS: "authz",
      AI_REVIEW_ENFORCE_BLOCK: "true",
    },
    verdicts: [
      verdict("authz", {
        verdict: "BLOCK",
        exitCode: 1,
        blockingCount: 1,
        findingsCount: 1,
        findings: [
          {
            severity: "high",
            confidence: "high",
            file: "a.ts",
            line: 1,
            title: "bad",
            __blocking: true,
          },
        ],
      }),
    ],
    expect: { exit: 1, contains: "raised a blocking finding" },
  },
  {
    name: "advisory blocking finding only",
    env: {
      PREFLIGHT_RESULT: "success",
      PREFLIGHT_MODE: "run",
      LENS_RESULT: "success",
      PREFLIGHT_LENS_COUNT: "1",
      PREFLIGHT_LENS_KEYS: "authz",
    },
    verdicts: [
      verdict("authz", {
        verdict: "BLOCK",
        advisory: true,
        blockingCount: 1,
        findingsCount: 1,
        findings: [
          {
            severity: "high",
            confidence: "high",
            title: "bad",
            __blocking: true,
          },
        ],
      }),
    ],
    expect: { exit: 0, contains: "advisory" },
  },
  {
    name: "needs.lens.result == cancelled",
    env: {
      PREFLIGHT_RESULT: "success",
      PREFLIGHT_MODE: "run",
      LENS_RESULT: "cancelled",
      PREFLIGHT_LENS_COUNT: "2",
      PREFLIGHT_LENS_KEYS: "authz,perf",
    },
    verdicts: [verdict("authz")],
    expect: { exit: 1, contains: "cancelled" },
  },
  {
    name: "needs.lens.result == skipped although work was selected",
    env: {
      PREFLIGHT_RESULT: "success",
      PREFLIGHT_MODE: "run",
      LENS_RESULT: "skipped",
      PREFLIGHT_LENS_COUNT: "2",
      PREFLIGHT_LENS_KEYS: "authz,perf",
    },
    verdicts: [],
    expect: { exit: 1, contains: "skipped" },
  },
  {
    name: "needs.lens.result == '' (undocumented / unknown)",
    env: {
      PREFLIGHT_RESULT: "success",
      PREFLIGHT_MODE: "run",
      LENS_RESULT: "",
      PREFLIGHT_LENS_COUNT: "1",
      PREFLIGHT_LENS_KEYS: "authz",
    },
    verdicts: [],
    expect: { exit: 1, contains: "unrecognised" },
  },
  {
    name: "lens job succeeded but a verdict artifact is missing",
    env: {
      PREFLIGHT_RESULT: "success",
      PREFLIGHT_MODE: "run",
      LENS_RESULT: "success",
      PREFLIGHT_LENS_COUNT: "3",
      PREFLIGHT_LENS_KEYS: "authz,perf,rtl",
    },
    verdicts: [verdict("authz"), verdict("perf")],
    expect: { exit: 1, contains: "Missing verdicts" },
  },
  {
    name: "preflight failed",
    env: {
      PREFLIGHT_RESULT: "failure",
      PREFLIGHT_MODE: "",
      LENS_RESULT: "skipped",
      PREFLIGHT_LENS_COUNT: "",
    },
    verdicts: [],
    expect: { exit: 1, contains: "gate did not run" },
  },
  {
    name: "preflight cancelled",
    env: {
      PREFLIGHT_RESULT: "cancelled",
      PREFLIGHT_MODE: "",
      LENS_RESULT: "cancelled",
      PREFLIGHT_LENS_COUNT: "",
    },
    verdicts: [],
    expect: { exit: 1, contains: "cancelled" },
  },
  {
    name: "lens reported NOT_CONFIGURED",
    env: {
      PREFLIGHT_RESULT: "success",
      PREFLIGHT_MODE: "run",
      LENS_RESULT: "success",
      PREFLIGHT_LENS_COUNT: "1",
      PREFLIGHT_LENS_KEYS: "authz",
    },
    verdicts: [
      verdict("authz", {
        verdict: "NOT_CONFIGURED",
        exitCode: 3,
        liveness: null,
      }),
    ],
    expect: { exit: 0, contains: "not configured" },
  },

  // ── Reproduced fail-open paths: every one of these was green ─────────────
  {
    name: "FAIL-OPEN: preflight succeeded but mode is empty",
    env: {
      PREFLIGHT_RESULT: "success",
      PREFLIGHT_MODE: "",
      LENS_RESULT: "skipped",
      PREFLIGHT_LENS_COUNT: "",
      PREFLIGHT_LENS_KEYS: "",
    },
    verdicts: [],
    expect: { exit: 1, contains: "unrecognised mode" },
  },
  {
    name: "FAIL-OPEN: unrecognised preflight mode",
    env: {
      PREFLIGHT_RESULT: "success",
      PREFLIGHT_MODE: "banana",
      LENS_RESULT: "skipped",
      PREFLIGHT_LENS_COUNT: "2",
      PREFLIGHT_LENS_KEYS: "authz,perf",
    },
    verdicts: [],
    expect: { exit: 1, contains: "unrecognised mode" },
  },
  {
    name: "FAIL-OPEN: mode=run with an empty lens count",
    env: {
      PREFLIGHT_RESULT: "success",
      PREFLIGHT_MODE: "run",
      LENS_RESULT: "skipped",
      PREFLIGHT_LENS_COUNT: "",
      PREFLIGHT_LENS_KEYS: "",
    },
    verdicts: [],
    expect: { exit: 1, contains: "unreadable lens count" },
  },
  {
    name: "FAIL-OPEN: mode=run with an unparseable lens count",
    env: {
      PREFLIGHT_RESULT: "success",
      PREFLIGHT_MODE: "run",
      LENS_RESULT: "skipped",
      PREFLIGHT_LENS_COUNT: "abc",
      PREFLIGHT_LENS_KEYS: "",
    },
    verdicts: [],
    expect: { exit: 1, contains: "unreadable lens count" },
  },
  {
    name: "FAIL-OPEN: lens_count=2, no keys, zero artifacts ('0 of 2 reviewed')",
    env: {
      PREFLIGHT_RESULT: "success",
      PREFLIGHT_MODE: "run",
      LENS_RESULT: "success",
      PREFLIGHT_LENS_COUNT: "2",
      PREFLIGHT_LENS_KEYS: "",
    },
    verdicts: [],
    expect: { exit: 1, contains: "count mismatch" },
  },
  {
    name: "FAIL-OPEN: zero lenses selected but a verdict came back",
    env: {
      PREFLIGHT_RESULT: "success",
      PREFLIGHT_MODE: "run",
      LENS_RESULT: "success",
      PREFLIGHT_LENS_COUNT: "0",
      PREFLIGHT_LENS_KEYS: "",
    },
    verdicts: [verdict("authz")],
    expect: { exit: 1, contains: "count mismatch" },
  },
  {
    name: "FAIL-OPEN: more artifacts than the preflight selected",
    env: {
      PREFLIGHT_RESULT: "success",
      PREFLIGHT_MODE: "run",
      LENS_RESULT: "success",
      PREFLIGHT_LENS_COUNT: "1",
      PREFLIGHT_LENS_KEYS: "authz",
    },
    verdicts: [verdict("authz"), verdict("perf")],
    expect: { exit: 1, contains: "count mismatch" },
  },
  {
    name: "FAIL-OPEN: lens_count and lens_keys disagree",
    env: {
      PREFLIGHT_RESULT: "success",
      PREFLIGHT_MODE: "run",
      LENS_RESULT: "success",
      PREFLIGHT_LENS_COUNT: "2",
      PREFLIGHT_LENS_KEYS: "authz",
    },
    verdicts: [verdict("authz"), verdict("perf")],
    expect: { exit: 1, contains: "cannot name the lenses" },
  },
  {
    name: "FAIL-OPEN: two lenses share a key (one review, two claims)",
    env: {
      PREFLIGHT_RESULT: "success",
      PREFLIGHT_MODE: "run",
      LENS_RESULT: "success",
      PREFLIGHT_LENS_COUNT: "2",
      PREFLIGHT_LENS_KEYS: "authz,authz",
    },
    verdicts: [verdict("authz"), verdict("perf")],
    expect: { exit: 1, contains: "cannot name the lenses" },
  },
];

let failures = 0;
for (const testCase of cases) {
  const dir = mkdtempSync(join(tmpdir(), "mdrs50-gate-"));
  const verdictDir = join(dir, "verdicts");
  const summaryFile = join(dir, "summary.md");
  writeFileSync(summaryFile, "");
  for (const artifact of testCase.verdicts) {
    const sub = join(verdictDir, `ai-review-verdict-${artifact.lens}`);
    mkdirSync(sub, { recursive: true });
    writeFileSync(
      join(sub, "ai-review-verdict.json"),
      JSON.stringify(artifact)
    );
  }

  let stdout = "";
  let exitCode = 0;
  try {
    stdout = execFileSync("node", [SCRIPT], {
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        AI_REVIEW_VERDICT_DIR: verdictDir,
        GITHUB_STEP_SUMMARY: summaryFile,
        RUN_URL: "https://example.invalid/run/1",
        ...testCase.env,
      },
    });
  } catch (error) {
    exitCode = error.status;
    stdout = error.stdout ?? "";
  }
  const summary = readFileSync(summaryFile, "utf8").toLowerCase();
  const problems = [];
  if (exitCode !== testCase.expect.exit)
    problems.push(`exit ${exitCode} != ${testCase.expect.exit}`);
  const needles = [testCase.expect.contains, testCase.expect.alsoContains];
  for (const needle of needles) {
    if (needle && !summary.includes(needle.toLowerCase()))
      problems.push(`summary missing "${needle}"`);
  }
  // Nothing may report green with a ✅ headline unless a lens actually reported.
  if (exitCode === 0 && summary.includes("✅") && testCase.verdicts.length === 0)
    problems.push("green ✅ headline with zero verdict artifacts");
  if (problems.length > 0) failures += 1;

  console.log(`\n• ${testCase.name}`);
  console.log(
    `    expected : exit ${testCase.expect.exit} / "${testCase.expect.contains}"`
  );
  console.log(
    `    actual   : exit ${exitCode} — ${stdout.trim().split("\n").pop()}`
  );
  console.log(
    `    ${problems.length === 0 ? "PASS" : `FAIL — ${problems.join("; ")}`}`
  );
  rmSync(dir, { recursive: true, force: true });
}
console.log(`\n${cases.length - failures}/${cases.length} gate fixtures passed`);
process.exit(failures === 0 ? 0 : 1);
