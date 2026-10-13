import {
  backfill,
  parseArgs,
  run,
  settingsFrom,
} from "../../../../../tools/keycloak/backfill-gender.mjs";

/**
 * #317, step 2 of the gender production order: tools/keycloak/backfill-gender.mjs
 * copies the genders tedrisat already has into Keycloak. Driven here against
 * an in-memory stand-in for the admin REST API and a stub `user_profiles`
 * read, so nothing reaches a database or a Keycloak.
 */

const KC = "https://auth.example.test";
const ADMIN_PASSWORD = "kc-admin-pass-4f1c";
const DB_PASSWORD = "db-pass-93ab";
const TOKEN = "admin-token-7d2e";

const ENV_FILE = [
  `KC_URL=${KC}`,
  "KC_REALM=medaris",
  "ALLOW_REMOTE=1",
  "KC_ADMIN_USER=realm-admin",
  `KC_ADMIN_PASSWORD=${ADMIN_PASSWORD}`,
  `TEDRISAT_DATABASE_URL=postgres://tedrisat:${DB_PASSWORD}@db.example.test:5432/tedrisat_db`,
].join("\n");

const id = (n: number) => `c0000000-0000-4000-8000-00000000000${n}`;
const AYSE = id(1); // FEMALE in tedrisat, no gender in Keycloak
const OMER = id(2); // MALE in both
const ZEYNEP = id(3); // FEMALE in tedrisat, MALE in Keycloak
const GONE = id(4); // MALE in tedrisat, deleted in Keycloak
const ALI = id(5); // MALE in tedrisat, a Keycloak user with no attributes

type Rep = Record<string, unknown> & {
  attributes?: Record<string, string[]>;
};

/** The realm as the admin API shows it, and a record of every call. */
function stubKeycloak(
  options: { putStatus?: number; getStatus?: number } = {}
) {
  const users = new Map<string, Rep>([
    [
      AYSE,
      {
        id: AYSE,
        username: "ayse",
        email: "ayse@example.test",
        firstName: "Ayşe",
        lastName: "Yılmaz",
        attributes: { privacyNoticeRead: ["yes"] },
      },
    ],
    [OMER, { id: OMER, attributes: { gender: ["MALE"] } }],
    [ZEYNEP, { id: ZEYNEP, attributes: { gender: ["MALE"] } }],
    [ALI, { id: ALI, username: "ali" }],
  ]);
  const calls: { method: string; url: string; body?: string; auth?: string }[] =
    [];
  const fetch = vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const headers = (init.headers ?? {}) as Record<string, string>;
    calls.push({
      method,
      url,
      body: typeof init.body === "string" ? init.body : undefined,
      auth: headers.authorization,
    });
    if (url === `${KC}/realms/master/protocol/openid-connect/token`) {
      return Response.json({ access_token: TOKEN, expires_in: 60 });
    }
    const match = url.match(/\/admin\/realms\/medaris\/users\/([^/]+)$/);
    if (!match || headers.authorization !== `Bearer ${TOKEN}`) {
      return new Response(null, { status: 401 });
    }
    const user = users.get(decodeURIComponent(match[1] as string));
    if (method === "GET") {
      if (options.getStatus)
        return new Response(null, { status: options.getStatus });
      return user ? Response.json(user) : new Response(null, { status: 404 });
    }
    if (options.putStatus)
      return new Response(null, { status: options.putStatus });
    if (!user) return new Response(null, { status: 404 });
    users.set(user.id as string, JSON.parse(init.body as string));
    return new Response(null, { status: 204 });
  });
  return { users, calls, fetch };
}

const PROFILES = [
  { userId: AYSE, gender: "FEMALE" },
  { userId: OMER, gender: "MALE" },
  { userId: ZEYNEP, gender: "FEMALE" },
  { userId: GONE, gender: "MALE" },
  { userId: ALI, gender: "MALE" },
];

async function runWith(
  argv: string[],
  keycloak: ReturnType<typeof stubKeycloak>,
  extra: { now?: () => number; profiles?: typeof PROFILES } = {}
) {
  const out: string[] = [];
  const err: string[] = [];
  const readProfiles = vi.fn(async () => extra.profiles ?? PROFILES);
  const code = await run(argv, {
    readFile: (file: string) => {
      if (file !== "prod.env") throw new Error("ENOENT");
      return ENV_FILE;
    },
    readProfiles,
    fetch: keycloak.fetch,
    now: extra.now ?? (() => 0),
    out: (line: string) => out.push(line),
    err: (line: string) => err.push(line),
  });
  return { code, out, err, readProfiles, printed: [...out, ...err].join("\n") };
}

/** Nothing printed may name a person or carry a secret. */
const expectNothingSecret = (printed: string) => {
  for (const secret of [
    ADMIN_PASSWORD,
    DB_PASSWORD,
    TOKEN,
    AYSE,
    OMER,
    ZEYNEP,
    GONE,
    ALI,
    "ayse@example.test",
  ]) {
    expect(printed).not.toContain(secret);
  }
};

describe("backfill-gender (#317)", () => {
  it("dry-runs by default: reads both sides, writes nothing, prints counts only", async () => {
    const keycloak = stubKeycloak();
    const { code, out, readProfiles, printed } = await runWith(
      ["--env-file", "prod.env"],
      keycloak
    );

    expect(code).toBe(0);
    expect(readProfiles).toHaveBeenCalledWith(
      `postgres://tedrisat:${DB_PASSWORD}@db.example.test:5432/tedrisat_db`
    );
    expect(keycloak.calls.filter((c) => c.method === "PUT")).toEqual([]);
    expect(out).toEqual([
      "backfill-gender: dry run, nothing written (--apply writes)",
      "  tedrisat profiles with a gender:     5",
      "  not in Keycloak:                     1",
      "  gender already set in Keycloak:      2",
      "    of which another than tedrisat's:  1",
      "  would write:                         2",
    ]);
    expectNothingSecret(printed);
  });

  it("with --apply writes the gender only where Keycloak has none, and keeps every other attribute", async () => {
    const keycloak = stubKeycloak();
    const { code, out, printed } = await runWith(
      ["--env-file=prod.env", "--apply"],
      keycloak
    );

    expect(code).toBe(0);
    const puts = keycloak.calls.filter((c) => c.method === "PUT");
    expect(puts.map((c) => c.url)).toEqual([
      `${KC}/admin/realms/medaris/users/${AYSE}`,
      `${KC}/admin/realms/medaris/users/${ALI}`,
    ]);
    expect(keycloak.users.get(AYSE)).toEqual({
      id: AYSE,
      username: "ayse",
      email: "ayse@example.test",
      firstName: "Ayşe",
      lastName: "Yılmaz",
      attributes: { privacyNoticeRead: ["yes"], gender: ["FEMALE"] },
    });
    expect(keycloak.users.get(ALI)?.attributes).toEqual({ gender: ["MALE"] });
    // Keycloak is the source: an account with another gender keeps it.
    expect(keycloak.users.get(ZEYNEP)?.attributes).toEqual({
      gender: ["MALE"],
    });
    expect(out).toContain("  written:                             2");
    expect(out).toContain("  refused by Keycloak (400):           0");
    expectNothingSecret(printed);

    // A second run finds everything in place.
    const again = await runWith(
      ["--env-file", "prod.env", "--apply"],
      keycloak
    );
    expect(again.out).toContain("  written:                             0");
    expect(again.out).toContain("  gender already set in Keycloak:      4");
  });

  it("counts an account Keycloak refuses (400) and goes on", async () => {
    const keycloak = stubKeycloak({ putStatus: 400 });
    const { code, out } = await runWith(
      ["--env-file", "prod.env", "--apply"],
      keycloak
    );
    expect(code).toBe(0);
    expect(out).toContain("  written:                             0");
    expect(out).toContain("  refused by Keycloak (400):           2");
  });

  it("stops on any other answer, never reading it as 'no such user', and says how far it got", async () => {
    const keycloak = stubKeycloak({ getStatus: 503 });
    const { code, out, err, printed } = await runWith(
      ["--env-file", "prod.env", "--apply"],
      keycloak
    );
    expect(code).toBe(1);
    expect(err).toEqual(["backfill-gender: stopped: GET user answered 503"]);
    expect(out).toContain("  not in Keycloak:                     0");
    expect(keycloak.calls.filter((c) => c.method === "PUT")).toEqual([]);
    expectNothingSecret(printed);
  });

  it("sends the admin password in a request body only, the token in a header only, and renews the token", async () => {
    const keycloak = stubKeycloak();
    let clock = 0;
    await runWith(["--env-file", "prod.env"], keycloak, {
      // 20 s pass on every read of the clock: the token is renewed past 45 s.
      now: () => {
        clock += 20_000;
        return clock;
      },
    });
    const tokenCalls = keycloak.calls.filter((c) =>
      c.url.endsWith("/openid-connect/token")
    );
    expect(tokenCalls.length).toBeGreaterThan(1);
    expect(tokenCalls[0]?.body).toContain(
      `password=${encodeURIComponent(ADMIN_PASSWORD)}`
    );
    for (const call of keycloak.calls) {
      expect(call.url).not.toContain(ADMIN_PASSWORD);
      expect(call.url).not.toContain(TOKEN);
    }
  });

  it("takes nothing secret from the command line", async () => {
    const keycloak = stubKeycloak();
    const typed = `postgres://tedrisat:${DB_PASSWORD}@db/x`;
    const { code, err, readProfiles } = await runWith(
      ["--env-file", "prod.env", typed],
      keycloak
    );
    expect(code).toBe(1);
    expect(err.join("\n")).not.toContain(DB_PASSWORD);
    expect(readProfiles).not.toHaveBeenCalled();
    expect(keycloak.fetch).not.toHaveBeenCalled();

    expect(() => parseArgs([])).toThrow(/usage/);
    expect(() => parseArgs(["--env-file"])).toThrow(/needs a file/);
    expect(() => parseArgs(["--password", "x"])).toThrow(/unknown argument/);
    expect(parseArgs(["--env-file", "a", "--env-file=b"])).toEqual({
      envFiles: ["a", "b"],
      apply: false,
    });
  });

  it("refuses the settings config/keycloak/scripts refuse, without repeating a secret", () => {
    const base = {
      TEDRISAT_DATABASE_URL: `postgres://u:${DB_PASSWORD}@h/db`,
      KC_URL: KC,
      ALLOW_REMOTE: "1",
      KC_ADMIN_USER: "realm-admin",
      KC_ADMIN_PASSWORD: ADMIN_PASSWORD,
    };
    const refusal = (env: Record<string, string>) => {
      try {
        settingsFrom(env);
      } catch (error) {
        return (error as Error).message;
      }
      return "accepted";
    };
    expect(refusal({ ...base, ALLOW_REMOTE: "" })).toMatch(/ALLOW_REMOTE=1/);
    expect(refusal({ ...base, KC_ADMIN_PASSWORD: "" })).toMatch(
      /no default for a remote Keycloak/
    );
    expect(refusal({ ...base, KC_URL: "http://auth.example.test" })).toMatch(
      /cleartext/
    );
    expect(
      refusal({ ...base, KC_URL: `https://admin:${ADMIN_PASSWORD}@auth.x` })
    ).toMatch(/must not carry credentials/);
    expect(refusal({ ...base, TEDRISAT_DATABASE_URL: "" })).toMatch(
      /TEDRISAT_DATABASE_URL/
    );
    expect(refusal({ ...base, KC_REALM: "../master" })).toMatch(/realm name/);
    for (const env of [
      { ...base, ALLOW_REMOTE: "" },
      { ...base, KC_URL: "http://auth.example.test" },
      { ...base, KC_URL: `https://admin:${ADMIN_PASSWORD}@auth.x` },
    ]) {
      expect(refusal(env)).not.toContain(ADMIN_PASSWORD);
    }
    // A local Keycloak needs none of the guards, and gets the local defaults.
    expect(
      settingsFrom({ TEDRISAT_DATABASE_URL: base.TEDRISAT_DATABASE_URL })
    ).toMatchObject({
      kcUrl: "http://localhost:8080",
      realm: "medaris",
      adminUser: "admin",
    });
  });

  it("skips a row that is not a uuid and a gender, without asking Keycloak", async () => {
    const user = vi.fn();
    const update = vi.fn();
    const counts = await backfill({
      profiles: [
        { userId: "f:ldap:42", gender: "FEMALE" },
        { userId: AYSE, gender: "OTHER" },
      ],
      keycloak: { user, update },
      apply: true,
    });
    expect(counts).toMatchObject({ profiles: 2, skipped: 2, written: 0 });
    expect(user).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});
