/**
 * tools/env/root-env.cjs — the workspace env loader (MDRS-71).
 *
 * The spec lives here, not next to the loader: `tools/` is not an Nx project and
 * has no test target, and the loader has six call sites — the four next.config.js
 * files and both load-env.ts — with no coverage at all before this, so it runs in
 * the suite closest to it.
 *
 * The loader is reached by a computed path, never a relative specifier: one
 * that leaves the project would need an `allow` entry in eslint.config.mjs,
 * and the next.config.js files state why that is the wrong shape — the
 * boundary rule rejects it, "and it is right to". MDRS-66 replaces this with
 * `@medaris/env`.
 *
 * COMPOSE_PARITY is the contract. Every expectation in it was measured against
 * `docker compose config` reading the same lines out of a real .env, because
 * compose interpolates this file for docker-compose.yml and is therefore the
 * reader that decides what a line means. Re-measure before changing a row.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// `require`, not `import`: the loader is .cjs on purpose — next.config.js is ESM
// and the Nest apps compile to CommonJS, and one .cjs module is the only shape
// both consume without a second copy of the rules.
//
// The path is computed rather than written as a relative specifier, so the
// boundary rule never sees an import leaving the project — the next.config.js
// files state why an `allow` entry would be the wrong shape. Computing it from
// this file's own position also avoids a second copy of the loader's
// `findRepoRoot`, which is already duplicated across both load-env.ts files and
// all four next.config.js. MDRS-66 replaces this with `@medaris/env`.
const rootEnv = require(
  resolve(__dirname, "../../../../tools/env/root-env.cjs")
);

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
  // Backslashes. Inside double quotes `\\` is one backslash, so a value that
  // ends in one must be written `"ends\\"` — and must not be read as escaping
  // the closing quote, which would hand the value back with its quotes on.
  ["I", 'I="ends\\\\"', "ends\\"],
  ["L", 'L="a\\\\\\"b"', 'a\\"b'],
  ["O", 'O="a\\\\nb"', "a\\nb"],
  ["P", 'P="tail\\\\" # note', "tail\\"],
  // Inside single quotes only `\'` is an escape; `\\` and `\"` stay literal.
  ["M", "M='a\\\\b'", "a\\\\b"],
  ["N", "N='it\\'s'", "it's"],
  ["Q", "Q='sq\\\"dq'", 'sq\\"dq'],
  // A `\\` pair before the closing single quote still closes the value and
  // keeps both characters. (A lone `\'` at the end is unterminated, and compose
  // refuses the whole file on it — so does this parser, see UNTERMINATED.)
  ["V", "V='ends\\\\'", "ends\\\\"],
  // An empty value followed by a comment is not empty to compose: with nothing
  // before the `#` there is no whitespace-preceded comment to strip, so the
  // text is the value. Pinned so nobody "fixes" it into a divergence.
  ["J", "J= # note", "# note"],
  ["K", "K=#novalue", "#novalue"],
  // Single quotes suppress compose's `$` substitution, so this is the one
  // `$`-bearing shape both readers agree on — and the documented remedy for a
  // generated secret that contains a `$`.
  ["T", "T='p$ss'", "p$ss"],
];

/**
 * Where the parser knowingly diverges from compose. Compose substitutes
 * `${NAME}` and bare `$NAME` inside unquoted and double-quoted values (measured:
 * `R=p$ss` -> `p`, `S="p${X}q"` -> `pabcq` with X=abc); this parser does not.
 * Pinned so the divergence is a stated decision, not an accident, and so the
 * docblock in root-env.cjs and this list cannot drift apart.
 */
const NO_SUBSTITUTION: ReadonlyArray<readonly [string, string, string]> = [
  ["R", "R=p$ss", "p$ss"],
  // biome-ignore lint/suspicious/noTemplateCurlyInString: this is a literal .env line, and `${X}` staying literal is the point
  ["S", 'S="p${X}q"', "p${X}q"],
];

/**
 * Lines compose refuses the whole file on (measured: `docker compose config`
 * exits 1 with `unterminated quoted value ...`). The parser throws on the same
 * lines, naming the key, so neither reader boots on them (MDRS-75).
 */
const UNTERMINATED: ReadonlyArray<readonly [string, string]> = [
  ["K", 'K="oops'],
  ["U", "U='a\\'"],
];

describe("root-env parseEnv", () => {
  it.each(
    COMPOSE_PARITY
  )("%s: %s agrees with docker compose", (key, line, expected) => {
    // Row J warns by design (see below); keep that out of the test output.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const entries = rootEnv.parseEnv(line);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toEqual({ key, value: expected });
    } finally {
      warn.mockRestore();
    }
  });

  it("warns when an empty value's comment becomes the value", () => {
    // `J= # note` is `# note` to compose, and parity is kept — but that is a
    // plausible-looking credential handed to `process.env.X || default`, so
    // the parser names the key instead of staying silent.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(rootEnv.parseEnv("J= # note")).toEqual([
        { key: "J", value: "# note" },
      ]);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toMatch(/^\[env\] J has a comment where/);
      // A value that starts with or contains `#` with no whitespace after the
      // `=` is a value to compose and to this parser alike, and does not warn.
      warn.mockClear();
      rootEnv.parseEnv("K=#novalue\nF=a#b");
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
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

  it.each(
    NO_SUBSTITUTION
  )("%s: %s is NOT substituted here, unlike compose", (key, line, expected) => {
    expect(rootEnv.parseEnv(line)).toEqual([{ key, value: expected }]);
  });

  it.each(
    UNTERMINATED
  )("%s: %s throws naming the key, as compose refuses the file", (key, line) => {
    // Compose refuses the whole .env on an unterminated quote (measured:
    // `unterminated quoted value "s3cr3t`, exit 1). Keeping the value with its
    // opening quote and warning was a third behaviour: `docker compose up`
    // failed while `next build` booted with `"s3cr3t` as a credential and
    // failed later as an opaque `invalid_client` (MDRS-75).
    expect(() => rootEnv.parseEnv(line)).toThrow(
      new RegExp(`^\\[env\\] ${key} opens with `)
    );
  });

  it("throws on a quoted value that spans several lines", () => {
    // Documented limitation, not a feature: the file is split on newlines
    // before any quote is read, so the first line is unterminated. It used to
    // be kept verbatim with its body lines parsed as junk keys; compose reads
    // the same lines as one value. A PEM must be one `\n`-escaped line.
    expect(() =>
      rootEnv.parseEnv('PEM="-----BEGIN-----\nabc=\n-----END-----"')
    ).toThrow(/^\[env\] PEM opens with "/);
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
