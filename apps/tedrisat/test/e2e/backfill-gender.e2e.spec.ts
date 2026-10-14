import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { INestApplication } from "@nestjs/common";
import { DatabaseService } from "../../src/database/database.service";
import { userProfiles } from "../../src/database/schema/user-profile.schema";
import { createTestApp } from "../helpers/test-app.helper";
import { TestDatabaseUtils } from "../helpers/test-database.helper";

/**
 * #317, step 2 of the gender production order: tools/keycloak/backfill-gender.mjs
 * copies the genders tedrisat already has into Keycloak. Run here as the
 * operator runs it, as its own process with env files, against this file's
 * database (the schema the migrations build) and a stand-in for Keycloak's
 * admin REST API on loopback, so nothing reaches a real Keycloak.
 */
const TOOL = join(__dirname, "../../../../tools/keycloak/backfill-gender.mjs");
const ADMIN_PASSWORD = `kc-admin-${Math.random().toString(36).slice(2)}`;
const TOKEN = `admin-token-${Math.random().toString(36).slice(2)}`;

const id = (n: number) => `c0000000-0000-4000-8000-00000000000${n}`;
const AYSE = id(1); // FEMALE in tedrisat, no gender in Keycloak
const OMER = id(2); // MALE in both
const ZEYNEP = id(3); // FEMALE in tedrisat, MALE in Keycloak
const GONE = id(4); // MALE in tedrisat, deleted in Keycloak
const ALI = id(5); // MALE in tedrisat, a Keycloak user with no attributes
const NONE = id(6); // no gender in tedrisat: not read at all

type Rep = Record<string, unknown> & { attributes?: Record<string, string[]> };
interface Seen {
  method: string;
  url: string;
  body: string;
  auth: string | undefined;
}

/** The admin API as the tool uses it: a token, then GET and PUT of one user. */
class StubKeycloak {
  users = new Map<string, Rep>();
  seen: Seen[] = [];
  getStatus: number | null = null;
  putStatus: number | null = null;
  private server: Server = createServer((req, res) => this.answer(req, res));

  async start(): Promise<string> {
    await new Promise<void>((r) => this.server.listen(0, "127.0.0.1", r));
    return `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  stop(): Promise<void> {
    return new Promise((r) => this.server.close(() => r()));
  }

  reset(): void {
    this.seen = [];
    this.getStatus = null;
    this.putStatus = null;
    this.users = new Map<string, Rep>([
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
      [NONE, { id: NONE }],
    ]);
  }

  private answer(req: IncomingMessage, res: ServerResponse): void {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      const method = req.method ?? "GET";
      const url = req.url ?? "";
      const auth = req.headers.authorization;
      this.seen.push({ method, url, body, auth });
      const send = (status: number, json?: unknown) => {
        res.writeHead(
          status,
          json ? { "content-type": "application/json" } : {}
        );
        res.end(json ? JSON.stringify(json) : undefined);
      };

      if (url === "/realms/master/protocol/openid-connect/token") {
        const form = new URLSearchParams(body);
        return form.get("password") === ADMIN_PASSWORD &&
          form.get("username") === "realm-admin"
          ? send(200, { access_token: TOKEN, expires_in: 60 })
          : send(401, { error: "invalid_grant" });
      }
      const match = url.match(/^\/admin\/realms\/medaris\/users\/([^/?]+)$/);
      if (!match || auth !== `Bearer ${TOKEN}`) return send(401);
      const userId = decodeURIComponent(match[1] as string);
      const user = this.users.get(userId);
      if (method === "GET") {
        if (this.getStatus) return send(this.getStatus);
        return user ? send(200, user) : send(404);
      }
      if (method === "PUT") {
        if (this.putStatus) return send(this.putStatus);
        if (!user) return send(404);
        this.users.set(userId, JSON.parse(body));
        return send(204);
      }
      return send(405);
    });
  }
}

describe("backfill-gender (#317, e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  const keycloak = new StubKeycloak();
  let dir: string;
  let databaseUrl: string;

  /** Runs the tool as its own process, with nothing from this one's environment. */
  const backfill = (args: string[]) =>
    new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
      execFile(
        process.execPath,
        [TOOL, ...args],
        { env: { PATH: process.env.PATH ?? "" }, timeout: 60_000 },
        (error, stdout, stderr) =>
          resolve({
            code: error ? ((error.code as number | undefined) ?? 1) : 0,
            stdout,
            stderr,
          })
      );
    });
  const envFiles = ["--env-file", "kc.env", "--env-file", "db.env"];
  const inDir = (args: string[]) =>
    args.map((arg) => (arg.endsWith(".env") ? join(dir, arg) : arg));

  /** Nothing printed may name a person or carry a secret. */
  const expectNothingSecret = (printed: string) => {
    for (const secret of [
      ADMIN_PASSWORD,
      TOKEN,
      process.env.DB_PASSWORD as string,
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

  beforeAll(async () => {
    app = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
    const env = process.env;
    databaseUrl = `postgres://${encodeURIComponent(env.DB_USERNAME ?? "")}:${encodeURIComponent(env.DB_PASSWORD ?? "")}@${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}`;

    const kcUrl = await keycloak.start();
    dir = mkdtempSync(join(tmpdir(), "backfill-gender-"));
    writeFileSync(
      join(dir, "kc.env"),
      [
        "# as config/keycloak/env/prod.env, pointed at the stand-in",
        `KC_URL=${kcUrl}`,
        "KC_REALM=medaris",
        "KC_ADMIN_USER=realm-admin",
        `KC_ADMIN_PASSWORD=${ADMIN_PASSWORD}`,
      ].join("\n")
    );
    writeFileSync(
      join(dir, "db.env"),
      `TEDRISAT_DATABASE_URL=${databaseUrl}\n`
    );
    writeFileSync(
      join(dir, "remote.env"),
      "KC_URL=https://auth.example.invalid\nKC_ADMIN_USER=a\nKC_ADMIN_PASSWORD=b\n"
    );
  });

  beforeEach(async () => {
    keycloak.reset();
    await dbUtils.cleanTables("user_profiles");
    await databaseService.db.insert(userProfiles).values([
      { userId: AYSE, gender: "FEMALE" },
      { userId: OMER, gender: "MALE" },
      { userId: ZEYNEP, gender: "FEMALE" },
      { userId: GONE, gender: "MALE" },
      { userId: ALI, gender: "MALE" },
      { userId: NONE, kunye: "Künyesi var, cinsiyeti yok" },
    ]);
  });

  afterAll(async () => {
    await keycloak.stop();
    rmSync(dir, { recursive: true, force: true });
    await dbUtils.cleanTables("user_profiles");
    await app.close();
  });

  const puts = () => keycloak.seen.filter((s) => s.method === "PUT");

  it("dry-runs by default: reads both sides, writes nothing, prints counts only", async () => {
    const { code, stdout, stderr } = await backfill(inDir(envFiles));

    expect(stderr).toBe("");
    expect(code).toBe(0);
    expect(stdout.trimEnd().split("\n")).toEqual([
      "backfill-gender: dry run, nothing written (--apply writes)",
      "  tedrisat profiles with a gender:     5",
      "  not in Keycloak:                     1",
      "  gender already set in Keycloak:      2",
      "    of which another than tedrisat's:  1",
      "  would write:                         2",
    ]);
    expect(puts()).toEqual([]);
    // The profile without a gender is never asked about.
    expect(keycloak.seen.map((s) => s.url).join("\n")).not.toContain(NONE);
    expectNothingSecret(stdout + stderr);
  });

  it("with --apply writes the gender only where Keycloak has none, keeping every other attribute", async () => {
    const { code, stdout, stderr } = await backfill(
      inDir([...envFiles, "--apply"])
    );

    expect(code).toBe(0);
    expect(puts().map((s) => s.url)).toEqual([
      `/admin/realms/medaris/users/${AYSE}`,
      `/admin/realms/medaris/users/${ALI}`,
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
    expect(stdout).toContain("  written:                             2\n");
    expect(stdout).toContain("  refused by Keycloak (400):           0\n");
    expectNothingSecret(stdout + stderr);

    // The password went in a body, the token in a header; never in a URL.
    for (const seen of keycloak.seen) {
      expect(seen.url).not.toContain(ADMIN_PASSWORD);
      expect(seen.url).not.toContain(TOKEN);
    }

    // A second dry run finds nothing left to do.
    const again = await backfill(inDir(envFiles));
    expect(again.stdout).toContain(
      "  would write:                         0\n"
    );
    expect(again.stdout).toContain(
      "  gender already set in Keycloak:      4\n"
    );
  });

  it("counts an account Keycloak refuses (400) and goes on", async () => {
    keycloak.putStatus = 400;
    const { code, stdout } = await backfill(inDir([...envFiles, "--apply"]));
    expect(code).toBe(0);
    expect(stdout).toContain("  written:                             0\n");
    expect(stdout).toContain("  refused by Keycloak (400):           2\n");
  });

  it("stops on any other answer, never reading it as 'no such user'", async () => {
    keycloak.getStatus = 503;
    const { code, stdout, stderr } = await backfill(
      inDir([...envFiles, "--apply"])
    );
    expect(code).toBe(1);
    expect(stderr.trim()).toBe(
      "backfill-gender: stopped: GET user answered 503"
    );
    expect(stdout).toContain("  not in Keycloak:                     0\n");
    expect(puts()).toEqual([]);
    expectNothingSecret(stdout + stderr);
  });

  it("takes nothing secret from the command line, and refuses a remote Keycloak without ALLOW_REMOTE", async () => {
    const typed = await backfill([...inDir(envFiles), databaseUrl]);
    expect(typed.code).toBe(1);
    expect(typed.stderr).toContain("unknown argument #5");
    expectNothingSecret(typed.stdout + typed.stderr);

    const remote = await backfill(
      inDir(["--env-file", "db.env", "--env-file", "remote.env"])
    );
    expect(remote.code).toBe(1);
    expect(remote.stderr).toContain("Set ALLOW_REMOTE=1");

    const none = await backfill([]);
    expect(none.code).toBe(1);
    expect(none.stderr).toContain("usage:");
    // None of the three reached the stand-in.
    expect(keycloak.seen).toEqual([]);
  });
});
