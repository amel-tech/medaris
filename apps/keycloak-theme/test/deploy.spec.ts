/**
 * MDRS-99: the theme is built in CI on every change, and deployed under the
 * theme id the realms ask for.
 *
 * Three things are checked here, without a network or a server:
 *
 *   - `tools/keycloak/deploy-theme.sh`, the script the deploy workflow runs on
 *     the Keycloak host, against a scratch directory standing in for the
 *     host's providers directory;
 *   - the two workflows, as text: the JAR workflow must fire on changes to
 *     this app and keep the JAR, and the deploy workflow must ship that JAR
 *     with a key, not a password, through the script above;
 *   - the realm configuration names the same theme id as the JAR.
 *
 * That the JAR itself loads in Keycloak is `tools/keycloak/smoke-theme-jar.sh`,
 * which the JAR workflow runs after the build (it needs Maven for the build
 * and Docker for Keycloak, so it is not part of `-t test`).
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { themeNames } from "../src/kc.gen";

const ROOT = join(__dirname, "../../..");
const SCRIPT = join(ROOT, "tools/keycloak/deploy-theme.sh");
const THEME_ID = themeNames[0];
const JAR = `${THEME_ID}.jar`;

/** A GitHub Actions expression, `${{ … }}`, as it appears in a workflow. */
const expr = (inner: string) => `\${{ ${inner} }}`;

const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

/** Bytes that pass the script's zip-header check. */
const jarBytes = (tag: string) => Buffer.from(`PK\u0003\u0004${tag}`);

describe("deploy-theme.sh", () => {
  let base: string;
  let providers: string;
  let staged: string;

  const deploy = (env: Record<string, string | undefined>) =>
    spawnSync("sh", [SCRIPT], {
      encoding: "utf8",
      env: { PATH: process.env.PATH, ...env },
    });

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), "mdrs-99-"));
    providers = join(base, "providers");
    mkdirSync(providers);
    mkdirSync(join(base, "stage"));
    staged = join(
      base,
      "stage",
      "keycloak-theme-for-kc-all-other-versions.jar"
    );
  });

  afterEach(() => rmSync(base, { recursive: true, force: true }));

  it("installs the JAR under the theme id and removes the staged copy", () => {
    writeFileSync(staged, jarBytes("new"));

    const run = deploy({ KC_THEME_DIR: providers, KC_STAGED_JAR: staged });

    expect(run.status, run.stderr).toBe(0);
    expect(readdirSync(providers)).toEqual([JAR]);
    expect(readFileSync(join(providers, JAR))).toEqual(jarBytes("new"));
    expect(existsSync(staged)).toBe(false);
    expect(existsSync(join(base, "stage"))).toBe(false);
    expect(run.stdout).toMatch(/sha256 [0-9a-f]{64}/);
  });

  it("backs up the previous JAR and retires madrasah-theme.jar", () => {
    writeFileSync(join(providers, JAR), jarBytes("old"));
    writeFileSync(join(providers, "madrasah-theme.jar"), jarBytes("legacy"));
    writeFileSync(staged, jarBytes("new"));

    const run = deploy({ KC_THEME_DIR: providers, KC_STAGED_JAR: staged });

    expect(run.status, run.stderr).toBe(0);
    const files = readdirSync(providers);
    // Keycloak loads every *.jar in providers/; after a deploy only ours may
    // remain, so a realm still on `madrasah-keycloak-theme` stops resolving.
    expect(files.filter((f) => f.endsWith(".jar"))).toEqual([JAR]);
    expect(readFileSync(join(providers, JAR))).toEqual(jarBytes("new"));

    const backup = files.find((f) => f.startsWith(`${JAR}.backup.`));
    expect(backup).toMatch(/\.backup\.\d{8}_\d{6}$/);
    expect(readFileSync(join(providers, backup as string))).toEqual(
      jarBytes("old")
    );

    const retired = files.find((f) =>
      f.startsWith("madrasah-theme.jar.retired.")
    );
    expect(retired).toMatch(/\.retired\.\d{8}_\d{6}$/);
    expect(readFileSync(join(providers, retired as string))).toEqual(
      jarBytes("legacy")
    );
  });

  it.each([
    [
      "KC_THEME_DIR is unset",
      { KC_THEME_DIR: undefined },
      /KC_THEME_DIR is not set/,
    ],
    [
      "KC_THEME_DIR does not exist",
      { KC_THEME_DIR: "/nonexistent/mdrs-99" },
      /does not exist/,
    ],
    [
      "KC_STAGED_JAR is unset",
      { KC_STAGED_JAR: undefined },
      /KC_STAGED_JAR is not set/,
    ],
  ])("refuses to run when %s", (_label, override, message) => {
    writeFileSync(staged, jarBytes("new"));

    const run = deploy({
      KC_THEME_DIR: providers,
      KC_STAGED_JAR: staged,
      ...override,
    });

    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(message);
    expect(readdirSync(providers)).toEqual([]);
  });

  it("does not replace a working theme with a file that is not a JAR", () => {
    writeFileSync(join(providers, JAR), jarBytes("old"));
    writeFileSync(staged, "<html>502 Bad Gateway</html>");

    const run = deploy({ KC_THEME_DIR: providers, KC_STAGED_JAR: staged });

    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/not a JAR/);
    expect(readdirSync(providers)).toEqual([JAR]);
    expect(readFileSync(join(providers, JAR))).toEqual(jarBytes("old"));
  });

  it("keeps only the newest KC_THEME_BACKUPS backups", () => {
    const stamps = ["20260101_000000", "20260201_000000", "20260301_000000"];
    for (const stamp of stamps) {
      writeFileSync(join(providers, `${JAR}.backup.${stamp}`), jarBytes(stamp));
    }
    writeFileSync(join(providers, JAR), jarBytes("old"));
    writeFileSync(staged, jarBytes("new"));

    const run = deploy({
      KC_THEME_DIR: providers,
      KC_STAGED_JAR: staged,
      KC_THEME_BACKUPS: "2",
    });

    expect(run.status, run.stderr).toBe(0);
    const backups = readdirSync(providers)
      .filter((f) => f.startsWith(`${JAR}.backup.`))
      .sort();
    // The two newest: the one this deploy made, and 20260301.
    expect(backups).toHaveLength(2);
    expect(backups[0]).toBe(`${JAR}.backup.20260301_000000`);
    expect(readFileSync(join(providers, backups[1] as string))).toEqual(
      jarBytes("old")
    );
  });

  it("deploys the theme id keycloakify builds", () => {
    expect(readFileSync(SCRIPT, "utf8")).toContain(`THEME_ID="${THEME_ID}"`);
  });
});

describe("theme JAR workflow", () => {
  const workflow = read(".github/workflows/keycloak-theme-jar.yaml");
  const trigger = (event: string) => {
    const block = workflow.match(
      new RegExp(`\\n  ${event}:\\n((?:    .*\\n|      .*\\n)+)`)
    );
    return block?.[1] ?? "";
  };

  it.each([
    "pull_request",
    "push",
  ])("runs on %s for every change to apps/keycloak-theme", (event) => {
    expect(trigger(event)).toContain("- apps/keycloak-theme/**");
  });

  it("builds, smoke-tests and keeps the Keycloak 26 JAR", () => {
    const build = workflow.indexOf(
      "nx run keycloak-theme:build-keycloak-theme"
    );
    const smoke = workflow.indexOf("run: tools/keycloak/smoke-theme-jar.sh");
    const upload = workflow.indexOf("uses: actions/upload-artifact@");

    expect(build).toBeGreaterThan(-1);
    expect(smoke).toBeGreaterThan(build);
    expect(upload).toBeGreaterThan(smoke);
    expect(workflow.slice(upload)).toContain(
      "path: apps/keycloak-theme/dist_keycloak/keycloak-theme-for-kc-all-other-versions.jar"
    );
    expect(workflow.slice(upload)).toContain("if-no-files-found: error");
  });
});

describe("theme deploy workflow", () => {
  const workflow = read(".github/workflows/keycloak-theme-app.yaml");

  it("ships the JAR the JAR workflow built and smoke-tested", () => {
    expect(workflow).toContain(
      "uses: ./.github/workflows/keycloak-theme-jar.yaml"
    );
    expect(workflow).toContain(`name: ${expr("needs.build.outputs.artifact")}`);
    expect(workflow).not.toContain(
      "nx run keycloak-theme:build-keycloak-theme"
    );
  });

  it("checks its configuration before it builds", () => {
    expect(workflow).toMatch(/\n {2}build:\n {4}needs: preflight\n/);
    expect(workflow).toMatch(/\n {2}deploy:\n {4}needs: build\n/);
    const preflight = workflow.slice(
      workflow.indexOf("\n  preflight:"),
      workflow.indexOf("\n  build:")
    );
    expect(preflight).toContain("secrets.KC_SSH_PRIVATE_KEY != ''");
    expect(preflight).toContain(`KC_THEME_DIR: ${expr("vars.KC_THEME_DIR")}`);
  });

  it("authenticates with a pinned deploy key, not a password", () => {
    expect(workflow).not.toMatch(/^\s+password:/m);
    expect(workflow).not.toContain("secrets.KC_SSH_PASSWORD");
    for (const action of ["appleboy/scp-action@", "appleboy/ssh-action@"]) {
      const step = workflow.slice(workflow.indexOf(action)).split("\n\n")[0];
      expect(step).toContain(`key: ${expr("secrets.KC_SSH_PRIVATE_KEY")}`);
      expect(step).toContain(
        `fingerprint: ${expr("secrets.KC_SSH_HOST_FINGERPRINT")}`
      );
    }
  });

  it("swaps the JAR in through deploy-theme.sh, into KC_THEME_DIR", () => {
    expect(workflow).toContain("script_path: tools/keycloak/deploy-theme.sh");
    expect(workflow).toContain("envs: KC_THEME_DIR,KC_STAGED_JAR");
    expect(workflow).toContain(`KC_THEME_DIR: ${expr("vars.KC_THEME_DIR")}`);
    expect(workflow).not.toContain("madrasah-theme.jar");
    expect(workflow).not.toContain("/opt/keycloak/themes");
  });
});

describe("realm configuration", () => {
  it("asks for the theme id the JAR provides", () => {
    const realm = JSON.parse(read("config/keycloak/realms/_base.json")) as {
      loginTheme: string;
      emailTheme: string;
    };
    expect(realm.loginTheme).toBe(THEME_ID);
    expect(realm.emailTheme).toBe(THEME_ID);
  });
});
