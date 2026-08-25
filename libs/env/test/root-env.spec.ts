/**
 * @medaris/env — the first tests this code has ever had.
 *
 * MDRS-25 shipped the prefix scheme with no coverage at all, and MDRS-66 found
 * that the walk-up had been copied six times and had already drifted. Both
 * facts point the same way: the rules need to be pinned somewhere that fails
 * when they change. The not-found case gets the most attention here because it
 * is the one the six copies disagreed about.
 *
 * `createRequire` rather than a static import: the module under test is
 * CommonJS by design (see the WHY .cjs note in src/root-env.cjs) and lives
 * inside this same package, so there is no `node_modules/@medaris/env` self-link
 * to resolve through. This is the same shape the four next.config.js call sites
 * use, which makes the test exercise the real consumption path.
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const requireCjs = createRequire(import.meta.url);
const rootEnv = requireCjs(
  "../src/root-env.cjs"
) as typeof import("../src/root-env.js");

const {
  APPS,
  MARKER,
  classify,
  findRepoRoot,
  loadRootEnv,
  parseEnv,
  resolveFor,
} = rootEnv;

/** A directory tree with no `pnpm-workspace.yaml` anywhere above it. */
function makeOrphanDir(): string {
  const base = mkdtempSync(join(tmpdir(), "medaris-env-orphan-"));
  const deep = join(base, "a", "b", "c");
  mkdirSync(deep, { recursive: true });
  return deep;
}

/** A directory tree that IS a workspace root, optionally holding a `.env`. */
function makeWorkspace(envBody?: string): { root: string; deep: string } {
  const root = mkdtempSync(join(tmpdir(), "medaris-env-ws-"));
  writeFileSync(join(root, MARKER), "packages:\n  - 'libs/env'\n");
  const deep = join(root, "libs", "env", "src");
  mkdirSync(deep, { recursive: true });
  if (envBody !== undefined) writeFileSync(join(root, ".env"), envBody);
  return { root, deep };
}

describe("MARKER", () => {
  it("is the workspace root marker, named once", () => {
    expect(MARKER).toBe("pnpm-workspace.yaml");
  });
});

describe("findRepoRoot — the one not-found behaviour (MDRS-66)", () => {
  it("returns the directory holding the marker", () => {
    const { root, deep } = makeWorkspace();
    expect(findRepoRoot(deep)).toBe(root);
  });

  it("finds the marker when it is in the starting directory itself", () => {
    const { root } = makeWorkspace();
    expect(findRepoRoot(root)).toBe(root);
  });

  it("THROWS rather than returning null when no marker exists", () => {
    // This is the assertion the whole issue turns on. Before MDRS-66 the two
    // Nest call sites reached this state and skipped in silence.
    expect(() => findRepoRoot(makeOrphanDir())).toThrow(
      /no pnpm-workspace\.yaml/
    );
  });

  it("names the directory it searched from, so the failure is diagnosable", () => {
    const orphan = makeOrphanDir();
    expect(() => findRepoRoot(orphan)).toThrow(orphan);
  });
});

describe("loadRootEnv — not-found propagates identically to every call site", () => {
  it("keeps no null-guard around the walk-up", () => {
    // `loadRootEnv` calls the module-local `findRepoRoot` binding, which no spy
    // can intercept, so the propagation itself is proved at the process level
    // instead — see §3.1 of docs/migration/mdrs-66-env-package.md, which runs
    // both call-site shapes outside any workspace. What IS worth pinning here
    // is that the guard cannot quietly come back: `if (!root)` re-silences the
    // Nest side the moment someone re-adds it.
    // Comments are stripped first: root-env.cjs explains in prose that it keeps
    // no `if (!root)` guard, and that sentence would match the pattern itself.
    const code = readFileSync(
      new URL("../src/root-env.cjs", import.meta.url),
      "utf8"
    ).replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/if\s*\(\s*!\s*root\s*\)/);
  });

  it("resolves the real workspace root when given no override", () => {
    // No `options.root`, so the walk-up decides — exactly as it does for the
    // four next.config.js copies and the two load-env.ts copies. This repo IS
    // a workspace, so it must resolve rather than throw.
    expect(() => loadRootEnv("nizam")).not.toThrow();
  });

  it("returns an empty map when the root exists but has no .env", () => {
    // Case 2: production. A missing FILE is normal; a missing WORKSPACE is not.
    const { root } = makeWorkspace();
    expect(loadRootEnv("nizam", { root })).toEqual(new Map());
  });

  it("rejects an app it does not know", () => {
    expect(() =>
      // @ts-expect-error deliberately outside MedarisApp
      loadRootEnv("muhasebe")
    ).toThrow(/unknown app/);
  });

  it("strips the app prefix and sets process.env", () => {
    const { root } = makeWorkspace("NIZAM__MDRS66_PROBE=from-app\n");
    delete process.env.MDRS66_PROBE;
    const applied = loadRootEnv("nizam", { root });
    expect(applied.get("MDRS66_PROBE")).toBe("from-app");
    expect(process.env.MDRS66_PROBE).toBe("from-app");
    delete process.env.MDRS66_PROBE;
  });

  it("never overrides a value already in process.env", () => {
    // The production invariant: a deployed secret outranks any file.
    const { root } = makeWorkspace("NIZAM__MDRS66_PROBE=from-file\n");
    process.env.MDRS66_PROBE = "from-environment";
    expect(loadRootEnv("nizam", { root }).has("MDRS66_PROBE")).toBe(false);
    expect(process.env.MDRS66_PROBE).toBe("from-environment");
    delete process.env.MDRS66_PROBE;
  });

  it("warns about a leftover apps/<app>/.env, which can only shadow keys", () => {
    const { root } = makeWorkspace("NIZAM__MDRS66_PROBE=x\n");
    mkdirSync(join(root, "apps", "nizam"), { recursive: true });
    writeFileSync(join(root, "apps", "nizam", ".env"), "MDRS66_PROBE=stale\n");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      delete process.env.MDRS66_PROBE;
      loadRootEnv("nizam", { root });
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("apps/nizam/.env still exists")
      );
    } finally {
      warn.mockRestore();
      delete process.env.MDRS66_PROBE;
    }
  });

  it("hands a key to no app when it is root-only", () => {
    const { root } = makeWorkspace("MEDARIS_POSTGRES_DB=medaris\n");
    delete process.env.MEDARIS_POSTGRES_DB;
    expect(loadRootEnv("tedrisat", { root })).toEqual(new Map());
  });
});

describe("classify", () => {
  it("treats an unprefixed key as shared across all six apps", () => {
    expect(classify("LOG_LEVEL")).toEqual({
      scope: "shared",
      targets: APPS,
      key: "LOG_LEVEL",
    });
  });

  it("routes WEB__ to the four web apps and API__ to the two Nest apps", () => {
    expect(classify("WEB__X").targets).toEqual([
      "landing",
      "nazir",
      "nizam",
      "tedris",
    ]);
    expect(classify("API__X").targets).toEqual(["tedrisat", "teskilat"]);
  });

  it("routes an app prefix to that one app and lowercases it", () => {
    expect(classify("TEDRISAT__PORT")).toEqual({
      scope: "app",
      targets: ["tedrisat"],
      key: "PORT",
    });
  });

  it("gives root-only keys no targets", () => {
    expect(classify("MEDARIS_POSTGRES_PORT")).toEqual({
      scope: "root",
      targets: [],
      key: "MEDARIS_POSTGRES_PORT",
    });
  });

  it("rejects a prefix that names neither an app nor a group", () => {
    expect(() => classify("MUHASEBE__PORT")).toThrow(/not an app or a group/);
  });

  it("rejects a prefix with nothing after it", () => {
    expect(() => classify("NIZAM__")).toThrow(/no key after it/);
  });
});

describe("parseEnv", () => {
  it("drops blanks, comments and lines without an =", () => {
    expect(parseEnv("\n# a comment\nJUNK\nA=1\n")).toEqual([
      { key: "A", value: "1" },
    ]);
  });

  it("strips an unquoted trailing comment the way dotenv does", () => {
    expect(parseEnv("A=1 # why")).toEqual([{ key: "A", value: "1" }]);
  });

  it("keeps a # inside a quoted value", () => {
    expect(parseEnv('A="1 # not a comment"')).toEqual([
      { key: "A", value: '"1 # not a comment"' },
    ]);
  });

  it("keeps = characters inside the value", () => {
    expect(parseEnv("A=b=c=d")).toEqual([{ key: "A", value: "b=c=d" }]);
  });
});

describe("resolveFor — narrowest declaration wins", () => {
  const entries = [
    { key: "PORT", value: "shared" },
    { key: "WEB__PORT", value: "group" },
    { key: "NIZAM__PORT", value: "app" },
  ];

  it("prefers app over group over shared", () => {
    expect(resolveFor("nizam", entries).get("PORT")).toBe("app");
  });

  it("prefers group over shared for a sibling in the same group", () => {
    expect(resolveFor("tedris", entries).get("PORT")).toBe("group");
  });

  it("falls back to shared for an app in neither narrower scope", () => {
    expect(resolveFor("tedrisat", entries).get("PORT")).toBe("shared");
  });

  it("is order-independent — a shared line after an app line does not win", () => {
    const reversed = [...entries].reverse();
    expect(resolveFor("nizam", reversed).get("PORT")).toBe("app");
  });
});
