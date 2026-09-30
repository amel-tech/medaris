/**
 * MDRS-73 AC2 — `pnpm nx run tokens:process` still regenerates
 * theme/main.css and leaves the hand-authored siblings untouched.
 *
 * The script runs on a temporary copy of the package, never on the checkout:
 * it writes theme/main.css unconditionally, and a test that rewrote a
 * committed file would leave the working tree dirty whenever the committed
 * copy had drifted from input/main.css.
 */
import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HAND_AUTHORED_FILES } from "./families.js";
import { importGraph, PACKAGE_ROOT } from "./support/css-tokens.js";

let copy: string;

function snapshotTheme(dir: string): Record<string, string> {
  return Object.fromEntries(
    readdirSync(join(dir, "theme"))
      .sort()
      .map((f) => [f, readFileSync(join(dir, "theme", f), "utf8")])
  );
}

function runProcess(cwd: string): void {
  execFileSync(process.execPath, ["scripts/process-tokens.js"], {
    cwd,
    stdio: "pipe",
  });
}

beforeEach(() => {
  copy = mkdtempSync(join(tmpdir(), "mdrs73-tokens-"));
  for (const part of ["package.json", "scripts", "input", "theme"]) {
    cpSync(join(PACKAGE_ROOT, part), join(copy, part), { recursive: true });
  }
});

afterEach(() => {
  rmSync(copy, { recursive: true, force: true });
});

describe("AC2: tokens:process", () => {
  it("is the nx target that runs scripts/process-tokens.js", () => {
    const pkg = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")
    );
    const project = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "project.json"), "utf8")
    );
    expect(pkg.scripts.process).toBe("node scripts/process-tokens.js");
    expect(project.targets.process.outputs).toEqual([
      "{projectRoot}/theme/main.css",
    ]);
  });

  it("regenerates theme/main.css byte-for-byte from input/main.css", () => {
    writeFileSync(join(copy, "theme/main.css"), "/* stale */\n");
    runProcess(copy);
    expect(readFileSync(join(copy, "theme/main.css"), "utf8")).toBe(
      readFileSync(join(PACKAGE_ROOT, "theme/main.css"), "utf8")
    );
  });

  it("leaves every hand-authored sibling byte-identical and adds no file", () => {
    const before = snapshotTheme(copy);
    for (const file of [...HAND_AUTHORED_FILES, "index.css"]) {
      expect(before[file], file).toBeDefined();
    }
    rmSync(join(copy, "theme/main.css"));
    runProcess(copy);
    expect(snapshotTheme(copy)).toEqual(before);
  });

  it("still leaves an entry point that imports the regenerated file", () => {
    runProcess(copy);
    const files = importGraph(join(copy, "theme/index.css"));
    expect(files).toContain(join(copy, "theme/main.css"));
  });
});
