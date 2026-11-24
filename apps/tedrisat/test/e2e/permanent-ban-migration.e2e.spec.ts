import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { useDatabaseForThisFile } from "../helpers/test-app.helper";

/**
 * MDRS-194: migration 0082 adds the PLATFORM ban scope and the decision
 * columns of a permanent-ban request without touching a ban or a request
 * that exists before it; its rollback takes them off again. Like the other
 * migration specs, the schema is built file by file so that rows can exist
 * BEFORE 0082 runs, and 0082 runs in a transaction of its own, as drizzle's
 * migrator runs it: a new enum value cannot be named in the transaction that
 * adds it, which is why the checks on `bans` compare the scope as text.
 */
const MIGRATIONS = join(__dirname, "../../src/database/migrations");
const ROLLBACKS = join(__dirname, "../../src/database/rollbacks");
const TARGET = "0082_permanent_ban_decisions";

const statementsOf = (file: string): string[] =>
  readFileSync(file, "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

describe("0082_permanent_ban_decisions migration (e2e)", () => {
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
  const scopes = async (): Promise<string[]> =>
    (
      await client.query(
        "select enumlabel from pg_enum where enumtypid = 'ban_scope'::regtype order by enumsortorder"
      )
    ).rows.map((r: { enumlabel: string }) => r.enumlabel);
  const requestColumns = async (): Promise<string[]> =>
    (
      await client.query(
        "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'ban_permanent_requests' order by column_name"
      )
    ).rows.map((r: { column_name: string }) => r.column_name);
  const banShape = async (): Promise<string[]> =>
    (
      await client.query(
        `select conname as name from pg_constraint where conrelid = 'bans'::regclass and contype = 'c'
         union all
         select indexname from pg_indexes where schemaname = 'public' and tablename = 'bans'
         order by name`
      )
    ).rows.map((r: { name: string }) => r.name);

  const ids = {
    user: "c1940000-0000-4000-8000-000000000001",
    other: "c1940000-0000-4000-8000-000000000005",
    kosk: "c1940000-0000-4000-8000-000000000002",
    course: "c1940000-0000-4000-8000-000000000003",
    madrasah: "c1940000-0000-4000-8000-000000000004",
  };
  const insertBan = async (
    scope: string,
    extra: Record<string, string>,
    user = ids.user
  ): Promise<string> => {
    const columns = Object.keys(extra);
    const { rows } = await client.query(
      `insert into bans (user_id, scope, reason, banned_by, banned_role, banned_tier${columns.map((c) => `, ${c}`).join("")}) values ($1, $2, 'r', $1, 'X', 2${columns.map((_, i) => `, $${i + 3}`).join("")}) returning id`,
      [user, scope, ...Object.values(extra)]
    );
    return (rows[0] as { id: string }).id;
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

  it("keeps the bans and requests that exist, accepts a platform ban, refuses a mixed-up row, and the rollback restores 0080's shape", async () => {
    expect(await scopes()).toEqual(["COURSE", "KOSK", "MADRASAH"]);
    const columnsBefore = await requestColumns();
    const shapeBefore = await banShape();
    const courseBan = await insertBan("COURSE", {
      kosk_id: ids.kosk,
      course_id: ids.course,
    });
    await insertBan("MADRASAH", { madrasah_id: ids.madrasah });
    await client.query(
      "insert into ban_permanent_requests (ban_id, reason, requested_by) values ($1, 'neden', $2)",
      [courseBan, ids.user]
    );

    await runInOneTransaction(join(MIGRATIONS, `${TARGET}.sql`));

    expect(await scopes()).toEqual(["COURSE", "KOSK", "MADRASAH", "PLATFORM"]);
    // A request that existed reads as waiting.
    const { rows: waiting } = await client.query(
      "select status, decided_by, decided_at, decision_note, platform_ban_id from ban_permanent_requests"
    );
    expect(waiting).toEqual([
      {
        status: "PENDING",
        decided_by: null,
        decided_at: null,
        decision_note: null,
        platform_ban_id: null,
      },
    ]);

    // A platform ban names no köşk and no medrese; one open per person.
    const platformBan = await insertBan("PLATFORM", {});
    await expect(insertBan("PLATFORM", {})).rejects.toThrow(
      /bans_open_platform_uq/
    );
    await expect(
      insertBan("PLATFORM", { kosk_id: ids.kosk }, ids.other)
    ).rejects.toThrow(/bans_madrasah_scope_columns/);
    await expect(
      insertBan("PLATFORM", { madrasah_id: ids.madrasah }, ids.other)
    ).rejects.toThrow(/bans_madrasah_scope_columns/);

    // A decision is whole or absent, and its status is one of the three.
    await expect(
      client.query("update ban_permanent_requests set status = 'APPROVED'")
    ).rejects.toThrow(/ban_permanent_requests_decision_complete/);
    await expect(
      client.query(
        "update ban_permanent_requests set status = 'MAYBE', decided_by = $1, decided_at = now()",
        [ids.other]
      )
    ).rejects.toThrow(/ban_permanent_requests_status_known/);
    await client.query(
      "update ban_permanent_requests set status = 'APPROVED', decided_by = $1, decided_at = now(), platform_ban_id = $2",
      [ids.other, platformBan]
    );

    await runInOneTransaction(join(ROLLBACKS, `${TARGET}.down.sql`));

    expect(await scopes()).toEqual(["COURSE", "KOSK", "MADRASAH"]);
    expect(await requestColumns()).toEqual(columnsBefore);
    expect(await banShape()).toEqual(shapeBefore);
    // The platform ban is gone; the lower bans and the request stay.
    const { rows: restored } = await client.query(
      "select scope from bans order by scope"
    );
    expect(restored).toEqual([{ scope: "COURSE" }, { scope: "MADRASAH" }]);
    const { rows: requests } = await client.query(
      "select ban_id, reason from ban_permanent_requests"
    );
    expect(requests).toEqual([{ ban_id: courseBan, reason: "neden" }]);

    // And forward again: the rollback leaves exactly the state 0082 expects.
    await runInOneTransaction(join(MIGRATIONS, `${TARGET}.sql`));
    expect(await scopes()).toEqual(["COURSE", "KOSK", "MADRASAH", "PLATFORM"]);
  });
});
