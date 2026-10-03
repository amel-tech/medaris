import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { useDatabaseForThisFile } from "../helpers/test-app.helper";

/**
 * MDRS-187: migration 0036 adds the medrese-wide ban scope, the table of
 * permanent-ban requests and the table of requests for a course outside a
 * medrese, without touching a ban that exists before it; its rollback takes
 * them off again. Like the other migration specs, the schema is built file by
 * file so that rows can exist BEFORE 0036 runs — and 0036 runs in a
 * transaction of its own, as drizzle's migrator runs it on a database that
 * already holds 0030: a new enum value cannot be named in the transaction that
 * adds it, which is why the checks on `bans` compare the scope as text.
 */
const MIGRATIONS = join(__dirname, "../../src/database/migrations");
const ROLLBACKS = join(__dirname, "../../src/database/rollbacks");
const TARGET = "0036_madrasah_bans_offsite_requests";

const statementsOf = (file: string): string[] =>
  readFileSync(file, "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

describe("0036_madrasah_bans_offsite_requests migration (e2e)", () => {
  let client: Client;

  const run = async (file: string) => {
    for (const statement of statementsOf(file)) {
      await client.query(statement);
    }
  };
  const runInOneTransaction = async (file: string) => {
    await client.query("begin");
    try {
      await run(file);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  };
  const tables = async (): Promise<string[]> =>
    (
      await client.query(
        "select table_name from information_schema.tables where table_schema = 'public' and table_name in ('bans', 'ban_permanent_requests', 'offsite_course_requests') order by table_name"
      )
    ).rows.map((r: { table_name: string }) => r.table_name);
  const scopes = async (): Promise<string[]> =>
    (
      await client.query(
        "select enumlabel from pg_enum where enumtypid = 'ban_scope'::regtype order by enumsortorder"
      )
    ).rows.map((r: { enumlabel: string }) => r.enumlabel);

  const ids = {
    user: "c1870000-0000-4000-8000-000000000001",
    kosk: "c1870000-0000-4000-8000-000000000002",
    course: "c1870000-0000-4000-8000-000000000003",
    madrasah: "c1870000-0000-4000-8000-000000000004",
  };
  const insertBan = (scope: string, extra: Record<string, string>) => {
    const columns = Object.keys(extra);
    return client.query(
      `insert into bans (user_id, scope, reason, banned_by, banned_role, banned_tier${columns.map((c) => `, ${c}`).join("")}) values ($1, $2, 'r', $1, 'X', 2${columns.map((_, i) => `, $${i + 3}`).join("")})`,
      [ids.user, scope, ...Object.values(extra)]
    );
  };

  beforeAll(async () => {
    await useDatabaseForThisFile();
    client = new Client({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      user: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });
    await client.connect();

    const journal = JSON.parse(
      readFileSync(join(MIGRATIONS, "meta/_journal.json"), "utf8")
    ) as { entries: { tag: string }[] };
    const tags = journal.entries.map((e) => e.tag);
    const target = tags.indexOf(TARGET);
    expect(target).toBeGreaterThan(0);
    for (const tag of tags.slice(0, target)) {
      await run(join(MIGRATIONS, `${tag}.sql`));
    }
  });

  afterAll(async () => {
    await client?.end();
  });

  it("keeps the bans that exist, accepts a medrese-wide one, refuses a mixed-up row, and the rollback restores 0030's shape", async () => {
    expect(await scopes()).toEqual(["COURSE", "KOSK"]);
    await insertBan("COURSE", { kosk_id: ids.kosk, course_id: ids.course });
    await insertBan("KOSK", { kosk_id: ids.kosk });

    await runInOneTransaction(join(MIGRATIONS, `${TARGET}.sql`));

    expect(await scopes()).toEqual(["COURSE", "KOSK", "MADRASAH"]);
    expect(await tables()).toEqual([
      "ban_permanent_requests",
      "bans",
      "offsite_course_requests",
    ]);
    const { rows: kept } = await client.query(
      "select scope, kosk_id, madrasah_id from bans order by scope"
    );
    expect(kept).toEqual([
      { scope: "COURSE", kosk_id: ids.kosk, madrasah_id: null },
      { scope: "KOSK", kosk_id: ids.kosk, madrasah_id: null },
    ]);

    // A medrese-wide ban has a medrese and no köşk, and nothing else does.
    await insertBan("MADRASAH", { madrasah_id: ids.madrasah });
    await expect(insertBan("MADRASAH", { kosk_id: ids.kosk })).rejects.toThrow(
      /bans_madrasah_scope_columns/
    );
    await expect(
      insertBan("KOSK", { kosk_id: ids.kosk, madrasah_id: ids.madrasah })
    ).rejects.toThrow(/bans_madrasah_scope_columns/);
    // One open ban over the medrese per person.
    await expect(
      insertBan("MADRASAH", { madrasah_id: ids.madrasah })
    ).rejects.toThrow(/bans_open_madrasah_uq/);

    await run(join(ROLLBACKS, `${TARGET}.down.sql`));
    expect(await scopes()).toEqual(["COURSE", "KOSK"]);
    expect(await tables()).toEqual(["bans"]);
    const { rows: restored } = await client.query(
      "select scope from bans order by scope"
    );
    expect(restored).toEqual([{ scope: "COURSE" }, { scope: "KOSK" }]);

    // And forward again: the rollback leaves exactly the state 0036 expects.
    await runInOneTransaction(join(MIGRATIONS, `${TARGET}.sql`));
    expect(await scopes()).toEqual(["COURSE", "KOSK", "MADRASAH"]);
  });
});
