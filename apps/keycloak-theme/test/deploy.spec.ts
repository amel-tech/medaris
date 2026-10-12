/**
 * How the theme ships (MDRS-99; as an image since 2026-10-12): the JAR is
 * built and smoke-tested in CI on every change, baked into a Keycloak image
 * pinned in apps/keycloak-theme/Dockerfile, and a full release promotes the
 * image development built.
 *
 * Checked here, without a network, a registry or a server:
 *
 *   - the Dockerfile: one pinned Keycloak version, never below what
 *     production runs, and the JAR under the theme id the realms ask for;
 *   - everything else that starts a Keycloak for this theme reads that pin;
 *   - the two workflows, as text: the JAR workflow fires on changes to this
 *     app and keeps the JAR; the Keycloak workflow ships that JAR in the
 *     image, promotes on a full release, and restarts Keycloak only then;
 *   - `tools/ci/promote-image.sh`, which all seven deploy workflows use for
 *     that promotion, against stub `docker` and `gh` commands;
 *   - the realm configuration names the same theme id as the JAR.
 *
 * That the JAR itself loads in Keycloak is `tools/keycloak/smoke-theme-jar.sh`,
 * which the JAR workflow runs after the build (it needs Maven for the build
 * and Docker for Keycloak, so it is not part of `-t test`).
 */
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { themeNames } from "../src/kc.gen";
import { DOCKERFILE, keycloakVersion } from "./keycloak-image";

const ROOT = join(__dirname, "../../..");
const THEME_ID = themeNames[0];
const SHIPPED_JAR = "keycloak-theme-for-kc-all-other-versions.jar";

/**
 * What production ran on 2026-10-12 (`kc.sh --version`). Its database is
 * migrated to this version, so pinning an older image would downgrade it.
 */
const PRODUCTION_KEYCLOAK = "26.6.3";

/** A GitHub Actions expression, `${{ … }}`, as it appears in a workflow. */
const expr = (inner: string) => `\${{ ${inner} }}`;

const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

/** A top-level job of a workflow: from its key to the next job's key. */
const job = (workflow: string, name: string) => {
  const start = workflow.indexOf(`\n  ${name}:\n`);
  expect(start, `job ${name}`).toBeGreaterThan(-1);
  const rest = workflow.slice(start + 1);
  const next = rest.search(/\n {2}[a-z][\w-]*:\n/);
  return next === -1 ? rest : rest.slice(0, next);
};

/** a >= b for dotted numeric versions. */
const atLeast = (a: string, b: string) => {
  const [x, y] = [a.split(".").map(Number), b.split(".").map(Number)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const [p, q] = [x[i] ?? 0, y[i] ?? 0];
    if (p !== q) return p > q;
  }
  return true;
};

describe("Keycloak image", () => {
  const dockerfile = readFileSync(DOCKERFILE, "utf8");
  const instructions = dockerfile
    .split("\n")
    .filter((line) => line.trim() !== "" && !line.startsWith("#"));

  it("pins one Keycloak version, not below what production runs", () => {
    expect(dockerfile.match(/^ARG KEYCLOAK_VERSION=/gm)).toHaveLength(1);
    const version = keycloakVersion();
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(atLeast(version, PRODUCTION_KEYCLOAK), version).toBe(true);
  });

  it("adds the shipped JAR under the theme id and nothing else", () => {
    expect(instructions).toEqual([
      expect.stringMatching(/^ARG KEYCLOAK_VERSION=/),
      `FROM quay.io/keycloak/keycloak:\${KEYCLOAK_VERSION}`,
      `COPY --chown=keycloak:root ${SHIPPED_JAR} /opt/keycloak/providers/${THEME_ID}.jar`,
    ]);
  });

  it.each([
    ["the smoke test", "tools/keycloak/smoke-theme-jar.sh"],
    ["run-keycloak", "apps/keycloak-theme/package.json"],
    ["the e-mail e2e spec", "apps/keycloak-theme/test/email.e2e.spec.ts"],
  ])("%s takes the Keycloak version from the Dockerfile", (_label, path) => {
    const text = read(path);
    expect(text).not.toMatch(/quay\.io\/keycloak\/keycloak:\d/);
    expect(text).not.toMatch(/\b26\.\d+\.\d+\b/);
  });

  it("is the image the smoke test boots", () => {
    const smoke = read("tools/keycloak/smoke-theme-jar.sh");
    expect(smoke).toContain(
      'dockerfile="$repo_root/apps/keycloak-theme/Dockerfile"'
    );
    expect(smoke).toMatch(/docker build .*-f "\$dockerfile"/);
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
      `path: apps/keycloak-theme/dist_keycloak/${SHIPPED_JAR}`
    );
    expect(workflow.slice(upload)).toContain("if-no-files-found: error");
  });
});

describe("Keycloak workflow", () => {
  const workflow = read(".github/workflows/keycloak-theme-app.yaml");
  const fullRelease = "github.event.release.prerelease == false";

  it("bakes the JAR the JAR workflow built and smoke-tested into the image", () => {
    expect(job(workflow, "jar")).toContain(
      "uses: ./.github/workflows/keycloak-theme-jar.yaml"
    );
    const image = job(workflow, "image");
    expect(image).toContain(`name: ${expr("needs.jar.outputs.artifact")}`);
    expect(image).toContain("path: dist_keycloak");
    // The build context is the downloaded JAR, not the repository.
    expect(image).toContain("context: dist_keycloak");
    expect(image).toContain("file: ./apps/keycloak-theme/Dockerfile");
    expect(workflow).toContain(
      `IMAGE_NAME: ${expr("github.repository")}-keycloak`
    );
    expect(workflow).not.toContain(
      "nx run keycloak-theme:build-keycloak-theme"
    );
  });

  it("no longer copies anything over SSH", () => {
    expect(existsSync(join(ROOT, "tools/keycloak/deploy-theme.sh"))).toBe(
      false
    );
    // The header may say what went away; no step may still use it.
    const code = workflow
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("#"))
      .join("\n");
    for (const gone of [
      "appleboy/",
      "KC_SSH_",
      "KC_THEME_DIR",
      "deploy-theme",
    ]) {
      expect(code).not.toContain(gone);
    }
  });

  it("promotes the development image on a full release, as the other apps do", () => {
    const promote = job(workflow, "promote");
    expect(promote).toContain(fullRelease);
    expect(promote).toContain("tools/ci/promote-image.sh");
    expect(promote).toContain("actions: read");
    // The fallback: the JAR and the image are built only when promotion
    // found nothing.
    expect(job(workflow, "jar")).toContain(
      "needs.promote.outputs.digest == ''"
    );
  });

  it("pushes latest from main and restarts Keycloak on a full release only", () => {
    expect(job(workflow, "image")).toContain(
      "type=raw,value=latest,enable=${{ github.event_name == 'push' &&"
    );
    const restart = job(workflow, "restart");
    expect(restart).toContain("github.event_name == 'release'");
    expect(restart).toContain(fullRelease);
    expect(restart).toContain(
      `COOLIFY_WEBHOOK: ${expr("secrets.KEYCLOAK_COOLIFY_RESTART_WEBHOOK")}`
    );
    expect(restart).toContain(
      `COOLIFY_TOKEN: ${expr("secrets.COOLIFY_DEPLOY_TOKEN")}`
    );
    expect(restart).toContain("--fail-with-body");
    // No other job calls Coolify.
    expect(workflow.match(/COOLIFY_WEBHOOK:/g)).toHaveLength(1);
  });

  it("is built on every push to main that touches the theme", () => {
    const cd = job(
      read(".github/workflows/cd-development.yaml"),
      "keycloak-theme"
    );
    expect(cd).toContain("uses: ./.github/workflows/keycloak-theme-app.yaml");
    expect(cd).not.toContain("github.event_name != 'push'");
    expect(cd).toContain("packages: write");
    expect(cd).toContain("actions: read");
  });
});

describe("promote-image.sh", () => {
  const SCRIPT = join(ROOT, "tools/ci/promote-image.sh");
  const IMAGE = "ghcr.io/amel-tech/medaris-keycloak";
  const SOURCE = `${IMAGE}:sha-abc1234`;
  const TARGETS = [`${IMAGE}:1.5.0`, `${IMAGE}:stable`];

  // Stub registry: one file per tag, holding its digest. `appear-after`
  // makes the source tag exist from that inspect on (development finishing
  // its build); `broken-create` makes a retag land on another digest.
  const DOCKER = `#!/usr/bin/env bash
state=$STUB_STATE
key() { printf '%s' "$1" | tr '/:@' '___'; }
echo "docker $*" >>"$state/calls"
case "$3" in
inspect)
  if [ -f "$state/appear-after" ] && [ "$4" = "$(cat "$state/appear-ref")" ]; then
    n=$(( $(cat "$state/inspects" 2>/dev/null || echo 0) + 1 ))
    echo "$n" >"$state/inspects"
    [ "$n" -lt "$(cat "$state/appear-after")" ] || echo sha256:dev >"$state/$(key "$4")"
  fi
  if [ -f "$state/$(key "$4")" ]; then cat "$state/$(key "$4")"; else echo "ERROR: $4: not found" >&2; exit 1; fi ;;
create)
  shift 3
  tags=()
  while [ $# -gt 0 ]; do
    case "$1" in --tag) tags+=("$2"); shift 2 ;; *) digest=\${1#*@}; shift ;; esac
  done
  [ ! -f "$state/broken-create" ] || digest=sha256:other
  for t in "\${tags[@]}"; do echo "$digest" >"$state/$(key "$t")"; done ;;
esac
`;
  // Stub GitHub API: prints the "<id> <status> <conclusion>" lines of `runs`.
  const GH = `#!/usr/bin/env bash
echo "gh $*" >>"$STUB_STATE/calls"
cat "$STUB_STATE/runs" 2>/dev/null || true
`;

  let base: string;
  let state: string;
  const key = (ref: string) => ref.replace(/[/:@]/g, "_");
  const put = (name: string, value: string) =>
    writeFileSync(join(state, name), `${value}\n`);
  const tag = (ref: string) =>
    existsSync(join(state, key(ref)))
      ? readFileSync(join(state, key(ref)), "utf8").trim()
      : undefined;
  const calls = () =>
    existsSync(join(state, "calls"))
      ? readFileSync(join(state, "calls"), "utf8")
      : "";

  const promote = (args = [SOURCE, ...TARGETS], waitSeconds = "5") =>
    spawnSync("bash", [SCRIPT, ...args], {
      encoding: "utf8",
      env: {
        PATH: `${join(base, "bin")}:${process.env.PATH}`,
        STUB_STATE: state,
        GITHUB_REPOSITORY: "amel-tech/medaris",
        COMMIT_SHA: "abc1234def",
        WAIT_SECONDS: waitSeconds,
        POLL_SECONDS: "0",
      },
    });

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), "promote-image-"));
    state = join(base, "state");
    mkdirSync(state);
    mkdirSync(join(base, "bin"));
    for (const [name, body] of [
      ["docker", DOCKER],
      ["gh", GH],
    ] as const) {
      writeFileSync(join(base, "bin", name), body);
      chmodSync(join(base, "bin", name), 0o755);
    }
  });

  afterEach(() => rmSync(base, { recursive: true, force: true }));

  it("points the release tags at the digest development pushed", () => {
    put(key(SOURCE), "sha256:dev");

    const run = promote();

    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toBe("sha256:dev\n");
    for (const target of TARGETS) {
      expect(tag(target)).toBe("sha256:dev");
    }
    expect(calls()).toContain(
      `docker buildx imagetools create --tag ${TARGETS[0]} --tag ${TARGETS[1]} ${IMAGE}@sha256:dev`
    );
    expect(calls()).not.toContain("gh api");
  });

  it("waits while development is still building the commit", () => {
    put("appear-after", "3");
    put("appear-ref", SOURCE);
    put("runs", "1 in_progress -");

    const run = promote();

    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toBe("sha256:dev\n");
    expect(tag(`${IMAGE}:stable`)).toBe("sha256:dev");
    expect(calls()).toContain(
      "gh api repos/amel-tech/medaris/actions/workflows/cd-development.yaml/runs?head_sha=abc1234def"
    );
  });

  it.each([
    ["no CD run exists for the commit", ""],
    ["the CD run was cancelled", "1 completed cancelled"],
    ["the CD run finished without building it", "1 completed success"],
  ])("prints an empty digest at once when %s", (_label, runs) => {
    put("runs", runs);

    const run = promote([SOURCE, ...TARGETS], "600");

    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toBe("\n");
    expect(tag(`${IMAGE}:stable`)).toBeUndefined();
    expect(calls()).not.toContain("imagetools create");
  });

  it("stops waiting after WAIT_SECONDS", () => {
    put("runs", "1 queued -");

    const run = promote([SOURCE, ...TARGETS], "0");

    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toBe("\n");
    expect(run.stderr).toMatch(/gave up after 0s/);
  });

  it("fails when a release tag does not land on the digest", () => {
    put(key(SOURCE), "sha256:dev");
    put("broken-create", "");

    const run = promote();

    expect(run.status).toBe(1);
    expect(run.stdout).toBe("");
    expect(run.stderr).toMatch(/resolves to 'sha256:other'/);
  });

  it("refuses a target outside the source's repository", () => {
    const run = promote([SOURCE, "ghcr.io/amel-tech/medaris-other:stable"]);

    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/is not a tag of/);
    expect(calls()).toBe("");
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
