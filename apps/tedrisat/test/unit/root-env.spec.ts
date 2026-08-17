/**
 * tools/env/root-env.cjs — the workspace env loader (MDRS-71).
 *
 * The spec lives here, not next to the loader, for the reason cors.config.spec.ts
 * does: `tools/` is not an Nx project and has no test target, and this app's suite
 * is the one that already runs specs for shared code. The loader has six call
 * sites — the four next.config.js files and both load-env.ts — and had no coverage
 * at all before this.
 *
 * COMPOSE_PARITY is the contract. Every expectation in it was measured against
 * `docker compose config` reading the same lines out of a real .env, because
 * compose interpolates this file for docker-compose.yml and is therefore the
 * reader that decides what a line means. Re-measure before changing a row.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// `require`, not `import`: the loader is .cjs on purpose — next.config.js is ESM
// and the Nest apps compile to CommonJS, and one .cjs module is the only shape
// both consume without a second copy of the rules.
const rootEnv = require("../../../../tools/env/root-env.cjs");

/** line in the file -> the value docker compose resolves it to */
const COMPOSE_PARITY: ReadonlyArray<readonly [string, string, string]> = [
  ["A", 'A="quoted"', "quoted"],
  ["B", "B='single'", "single"],
  ["C", 'C="with space"', "with space"],
  ["D", 'D="q" # note', "q"],
  ["E", "E=unq # note", "unq"],
  ["F", "F=a#b", "a#b"],
  // Literal backslash-n. dotenv expands this and compose does not; expanding it
  // would put a real newline in a PEM passed through API__DB_CA_CERT for one
  // reader and not the other.
  ["G", 'G="line1\\nline2"', "line1\\nline2"],
  ["H", 'H="esc\\"inside"', 'esc"inside'],
];

describe("root-env parseEnv", () => {
  it.each(
    COMPOSE_PARITY
  )("%s: %s agrees with docker compose", (key, line, expected) => {
    const entries = rootEnv.parseEnv(line);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({ key, value: expected });
  });

  it("parses the whole file the same way it parses each line alone", () => {
    const text = COMPOSE_PARITY.map(([, line]) => line).join("\n");
    const byKey = new Map(
      rootEnv
        .parseEnv(text)
        .map((e: { key: string; value: string }) => [e.key, e.value])
    );

    for (const [key, , expected] of COMPOSE_PARITY) {
      expect(byKey.get(key)).toBe(expected);
    }
  });

  it("keeps an unterminated quote rather than truncating at end of line", () => {
    // Silently dropping the rest would turn a typo into a plausible-looking
    // credential, which is the failure mode this whole spec exists for.
    expect(rootEnv.parseEnv('K="oops')).toEqual([{ key: "K", value: '"oops' }]);
  });

  it("ignores comments and blank lines", () => {
    expect(rootEnv.parseEnv("# a comment\n\n   \nK=v")).toEqual([
      { key: "K", value: "v" },
    ]);
  });
});

describe("root-env loadRootEnv", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "medaris-root-env-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    delete process.env.KEYCLOAK_CLIENT_SECRET;
    delete process.env.NEXTAUTH_URL;
  });

  it("a quoted secret reaches process.env without its quotes", () => {
    writeFileSync(
      join(root, ".env"),
      'TEDRIS__KEYCLOAK_CLIENT_SECRET="s3cr3t value"\n'
    );

    const applied = rootEnv.loadRootEnv("tedris", { root });

    // The bug this asserts against handed NextAuth `"s3cr3t value"` with the
    // quotes attached, and Keycloak answered invalid_client with nothing
    // pointing at the .env.
    expect(applied.get("KEYCLOAK_CLIENT_SECRET")).toBe("s3cr3t value");
    expect(process.env.KEYCLOAK_CLIENT_SECRET).toBe("s3cr3t value");
  });

  it("does not override a value the real environment already carries", () => {
    process.env.NEXTAUTH_URL = "https://from-the-platform.example";
    writeFileSync(
      join(root, ".env"),
      'TEDRIS__NEXTAUTH_URL="http://localhost:4000"\n'
    );

    rootEnv.loadRootEnv("tedris", { root });

    expect(process.env.NEXTAUTH_URL).toBe("https://from-the-platform.example");
  });
});
