#!/usr/bin/env node
/**
 * The dependency-advisory check, in the two shapes the Security workflow runs.
 *
 *   gate    Fails only on a high/critical advisory that THIS change brings in:
 *           one that `pnpm audit` reports for the head lockfile and not for the
 *           base lockfile, keyed by advisory + package + version. A change that
 *           leaves pnpm-lock.yaml alone passes without asking the registry.
 *
 *   report  Lists every high/critical advisory in the current lockfile, split
 *           into runtime and dev-only, as the body of the one open
 *           `dependency-audit` issue. Never fails on findings.
 *
 * Why the split (2026-10-25): the whole-tree audit used to run as a blocking
 * check on every pull request and every push to main. An advisory published
 * overnight against a package nobody had touched then turned every unrelated
 * PR red until someone wrote a floor for it: eight floor/bump PRs between 8
 * September and 23 October, three of them in the last five days of that span.
 * The advisory is real, but it is not the PR's doing, and a check that is red
 * for reasons the author cannot act on stops being read. Now the PR answers
 * only for what it changed, and the standing list lives in one issue that the
 * scheduled run rewrites and closes.
 *
 * GitHub's own dependency review cannot do the gate half here: its dependency
 * graph does not read this repo's pnpm-lock.yaml (the compare endpoint returns
 * 403 and Dependabot alerts list nothing, xlsx included), so the diff is taken
 * from `pnpm audit` on both lockfiles instead. `pnpm audit` needs nothing but
 * the lockfile; it is run in a temporary directory holding only that file, so
 * neither half depends on an install. Measured: the result is identical to an
 * audit run in the installed workspace.
 *
 * Policy comes from audit-ci.json (severity flags, `skip-dev`, the dated
 * allowlist, retry). The file kept its name and format when audit-ci itself
 * was dropped; any key this script does not implement is an error rather than
 * a silently ignored setting.
 *
 * Usage:
 *   node tools/ci/dependency-audit.mjs gate --base <ref> [--head <ref>]
 *       --head defaults to the working-tree pnpm-lock.yaml.
 *   node tools/ci/dependency-audit.mjs report [--body <file>]
 *       [--previous <file>] [--comment <file>]
 *       Without --body the report goes to stdout. --body is written only when
 *       there is something to report; --comment only when --previous (the
 *       issue's current body) lacks an advisory this run found.
 */

import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const SEVERITIES = ["low", "moderate", "high", "critical"];
const POLICY_KEYS = new Set([
  "$comment",
  ...SEVERITIES,
  "skip-dev",
  "allowlist",
  "retry",
]);

/** The marker the report leaves in the issue body, so the next run can tell what is new. */
const MARKER = /<!-- dependency-audit: ([^>]*) -->/;

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(2);
}

function loadPolicy() {
  const raw = JSON.parse(readFileSync("audit-ci.json", "utf8"));
  const unknown = Object.keys(raw).filter((key) => !POLICY_KEYS.has(key));
  if (unknown.length > 0) {
    fail(
      `audit-ci.json: ${unknown.join(", ")} is not implemented by tools/ci/dependency-audit.mjs`
    );
  }
  const lowest = SEVERITIES.findIndex((severity) => raw[severity] === true);
  if (lowest === -1) fail("audit-ci.json: no severity is set to true");
  for (const entry of raw.allowlist ?? []) {
    if (!/^GHSA(-[0-9a-z]{4}){3}$/.test(entry)) {
      fail(`audit-ci.json: allowlist entry ${entry} is not a GHSA id`);
    }
  }
  return {
    severities: new Set(SEVERITIES.slice(lowest)),
    skipDev: raw["skip-dev"] === true,
    allowlist: new Set(raw.allowlist ?? []),
    attempts: 1 + (raw.retry?.count ?? 0),
    delay: raw.retry?.delay ?? 0,
  };
}

function lockfileAt(ref) {
  if (ref === undefined) return readFileSync("pnpm-lock.yaml", "utf8");
  const shown = spawnSync("git", ["show", `${ref}:pnpm-lock.yaml`], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (shown.status !== 0)
    fail(`git show ${ref}:pnpm-lock.yaml: ${shown.stderr.trim()}`);
  return shown.stdout;
}

/** `pnpm audit --json` on a lockfile alone. pnpm exits 1 when it finds anything, so the exit code says nothing. */
async function audit(lockfile, policy) {
  const dir = mkdtempSync(join(tmpdir(), "dependency-audit-"));
  try {
    writeFileSync(join(dir, "pnpm-lock.yaml"), lockfile);
    let last = "";
    for (let attempt = 1; attempt <= policy.attempts; attempt++) {
      const run = spawnSync("pnpm", ["audit", "--json"], {
        cwd: dir,
        encoding: "utf8",
        maxBuffer: 256 * 1024 * 1024,
      });
      try {
        const parsed = JSON.parse(run.stdout);
        if (parsed.advisories && typeof parsed.advisories === "object")
          return parsed;
        last = run.stdout.slice(0, 500);
      } catch {
        last = (run.stderr || run.stdout).trim().slice(0, 500);
      }
      if (attempt < policy.attempts) await sleep(policy.delay);
    }
    fail(
      `pnpm audit returned no advisory list after ${policy.attempts} attempts: ${last}`
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** One entry per advisory and installed version, with the policy applied. */
function findings(result, policy) {
  const kept = [];
  const allowlisted = new Set();
  for (const advisory of Object.values(result.advisories)) {
    if (policy.allowlist.has(advisory.github_advisory_id)) {
      allowlisted.add(advisory.github_advisory_id);
      continue;
    }
    if (!policy.severities.has(advisory.severity)) continue;
    for (const finding of advisory.findings) {
      if (policy.skipDev && finding.dev) continue;
      kept.push({
        key: `${advisory.github_advisory_id} ${advisory.module_name}@${finding.version}`,
        id: advisory.github_advisory_id,
        url: advisory.url,
        title: advisory.title,
        severity: advisory.severity,
        name: advisory.module_name,
        version: finding.version,
        patched: advisory.patched_versions,
        dev: finding.dev,
        paths: shortestFirst(finding.paths),
      });
    }
  }
  const stale = [...policy.allowlist].filter((id) => !allowlisted.has(id));
  return { kept, allowlisted: [...allowlisted].sort(), stale: stale.sort() };
}

/** The shortest dependency chain is the one worth reading first. */
function shortestFirst(paths) {
  return [...new Set(paths)].sort(
    (a, b) => a.split(">").length - b.split(">").length || a.localeCompare(b)
  );
}

/** `apps__tedrisat>@nestjs/platform-express>multer` → `apps/tedrisat › @nestjs/platform-express › multer`. */
function readablePath(path) {
  const [importer, ...rest] = path.split(">");
  const root = importer === "." ? "(root)" : importer.replaceAll("__", "/");
  return [root, ...rest].join(" › ");
}

function line(finding) {
  return `${finding.severity} ${finding.id} ${finding.name}@${finding.version} (fixed in ${finding.patched}) via ${readablePath(finding.paths[0])}`;
}

function summary(markdown) {
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
}

async function gate(args) {
  if (!args.base) fail("gate needs --base <ref>");
  const policy = loadPolicy();
  const base = lockfileAt(args.base);
  const head = lockfileAt(args.head);
  if (base === head) {
    const note = `pnpm-lock.yaml is unchanged against ${args.base}, so this change brings in no advisory.`;
    console.log(`✔ ${note}`);
    summary(`### Dependency advisories\n\n${note}`);
    return;
  }

  const [before, after] = await Promise.all([
    audit(base, policy),
    audit(head, policy),
  ]);
  const was = findings(before, policy).kept;
  const now = findings(after, policy).kept;
  const wasKeys = new Set(was.map((f) => f.key));
  const nowKeys = new Set(now.map((f) => f.key));
  const introduced = now.filter((f) => !wasKeys.has(f.key));
  const cleared = was.filter((f) => !nowKeys.has(f.key));
  const standing = now.length - introduced.length;

  const out = [];
  if (introduced.length > 0) {
    out.push(
      `✖ ${introduced.length} advisory finding(s) this change brings in:`
    );
    for (const f of introduced) out.push(`    ${line(f)}`);
  } else {
    out.push("✔ This change brings in no high/critical advisory.");
  }
  if (cleared.length > 0) {
    out.push(`  ${cleared.length} finding(s) this change clears:`);
    for (const f of cleared) out.push(`    ${line(f)}`);
  }
  out.push(
    `  ${standing} finding(s) were already on ${args.base}; they do not fail this check and are tracked in the dependency-audit issue.`
  );
  console.log(out.join("\n"));
  summary(`### Dependency advisories\n\n\`\`\`\n${out.join("\n")}\n\`\`\``);
  if (introduced.length > 0) process.exitCode = 1;
}

function table(group) {
  const byAdvisory = new Map();
  for (const f of group) {
    const key = `${f.id} ${f.name}`;
    const entry = byAdvisory.get(key) ?? {
      ...f,
      versions: new Set(),
      paths: [],
    };
    entry.versions.add(f.version);
    entry.paths = shortestFirst([...entry.paths, ...f.paths]);
    byAdvisory.set(key, entry);
  }
  const rows = [...byAdvisory.values()].sort(
    (a, b) =>
      SEVERITIES.indexOf(b.severity) - SEVERITIES.indexOf(a.severity) ||
      a.name.localeCompare(b.name)
  );
  return [
    "| Severity | Advisory | Package | Installed | Fixed in | Reached through |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows.map((r) => {
      const shown = r.paths.slice(0, 2).map((p) => `\`${readablePath(p)}\``);
      const more = r.paths.length - shown.length;
      return `| ${r.severity} | [${r.id}](${r.url}) ${r.title.replaceAll("|", "\\|")} | \`${r.name}\` | ${[...r.versions].join(", ")} | \`${r.patched}\` | ${shown.join("<br>")}${more > 0 ? `<br>and ${more} more` : ""} |`;
    }),
  ];
}

async function report(args) {
  const policy = loadPolicy();
  const { kept, allowlisted, stale } = findings(
    await audit(lockfileAt(), policy),
    policy
  );
  const ids = [...new Set(kept.map((f) => f.id))].sort();
  const runtimeIds = new Set(kept.filter((f) => !f.dev).map((f) => f.id));
  const runtime = kept.filter((f) => runtimeIds.has(f.id));
  const devOnly = kept.filter((f) => !runtimeIds.has(f.id));
  const run =
    process.env.GITHUB_RUN_ID &&
    `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;

  if (ids.length === 0) {
    console.log(
      "✔ No high/critical advisory outside the audit-ci.json allowlist."
    );
    summary(
      "### Dependency advisories\n\nNone outside the audit-ci.json allowlist."
    );
    return;
  }

  const body = [
    `<!-- dependency-audit: ${ids.join(" ")} -->`,
    `The scheduled audit of \`pnpm-lock.yaml\` finds ${ids.length} high/critical advisor${ids.length === 1 ? "y" : "ies"} outside the \`audit-ci.json\` allowlist. They block nothing: a pull request fails **Security gates** only on an advisory it brings in itself. This issue is rewritten on every run and closed by the first run that finds none.`,
    "",
    `### Runtime (${new Set(runtime.map((f) => f.id)).size})`,
    "",
    "At least one path runs through `dependencies` rather than `devDependencies`.",
    "",
    ...(runtime.length > 0 ? table(runtime) : ["None."]),
    "",
    `### Dev tooling only (${new Set(devOnly.map((f) => f.id)).size})`,
    "",
    "Every path runs through `devDependencies`: builds, tests, codegen.",
    "",
    ...(devOnly.length > 0 ? table(devOnly) : ["None."]),
    "",
    "### Clearing one",
    "",
    "- A direct dependency: raise its catalog entry in `pnpm-workspace.yaml`.",
    "- A transitive one whose parent's range already admits the fix: Renovate's weekly lock file maintenance re-resolves it.",
    "- A transitive one its parent pins exactly: a floor under **Security floors** in `pnpm-workspace.yaml`, with the advisory and its removal condition on one line.",
    "- No fixed release at all: add the advisory to `audit-ci.json`'s allowlist with a dated reason.",
    "",
    `Allowlisted in \`audit-ci.json\` and still found: ${allowlisted.length > 0 ? allowlisted.join(", ") : "none"}.`,
    ...(stale.length > 0
      ? [
          `Allowlisted but no longer found, so the entry can go: ${stale.join(", ")}.`,
        ]
      : []),
    ...(run ? [`Last run: ${run}`] : []),
  ].join("\n");

  summary(body);
  if (!args.body) {
    console.log(body);
    return;
  }
  writeFileSync(args.body, `${body}\n`);
  console.log(`✖ ${ids.length} advisories; issue body written to ${args.body}`);

  if (args.previous && args.comment && existsSync(args.previous)) {
    const before = new Set(
      readFileSync(args.previous, "utf8").match(MARKER)?.[1].split(" ") ?? []
    );
    const fresh = kept.filter((f) => !before.has(f.id));
    if (before.size > 0 && fresh.length > 0) {
      const lines = [...new Set(fresh.map((f) => `- ${line(f)}`))];
      writeFileSync(
        args.comment,
        `New since the last run:\n\n${lines.join("\n")}\n`
      );
    }
  }
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const args = { command };
  for (let i = 0; i < rest.length; i += 2) {
    const flag = rest[i];
    if (!flag.startsWith("--") || rest[i + 1] === undefined)
      fail(`unexpected argument ${flag}`);
    args[flag.slice(2)] = rest[i + 1];
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (args.command === "gate") await gate(args);
else if (args.command === "report") await report(args);
else
  fail(
    "usage: dependency-audit.mjs gate --base <ref> [--head <ref>] | report [--body <file>]"
  );
