import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { useDatabaseForThisFile } from "../helpers/test-app.helper";

/**
 * MDRS-170: migration 0032 adds the hide stamps to `madrasahs` and the granter's
 * role to `madrasah_kosk_hosting` without touching a row that exists before it,
 * and its rollback takes them off again. Like the other migration specs, the
 * schema is built file by file so that rows can exist BEFORE 0032 runs.
 */
const MIGRATIONS = join(__dirname, "../../src/database/migrations");
const ROLLBACKS = join(__dirname, "../../src/database/rollbacks");
const TARGET = "0032_madrasah_archive_hosting_role";

const statementsOf = (file: string): string[] =>
  readFileSync(file, "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

describe("0032_madrasah_archive_hosting_role migration (e2e)", () => {
  let client: Client;

  const run = async (file: string) => {
    for (const statement of statementsOf(file)) {
      await client.query(statement);
    }
  };

  const columns = async (table: string): Promise<string[]> =>
    (
      await client.query(
        "select column_name from information_schema.columns where table_name = $1 order by column_name",
        [table]
      )
    ).rows.map((r: { column_name: string }) => r.column_name);

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

  it("leaves existing medreses shown and rights unlabelled, and the rollback removes the columns cleanly", async () => {
    const madrasahColumns = await columns("madrasahs");
    const hostingColumns = await columns("madrasah_kosk_hosting");
    const ids = {
      madrasah: "c1700000-0000-4000-8000-000000000001",
      kosk: "c1700000-0000-4000-8000-000000000002",
    };
    await client.query(
      "insert into madrasahs (id, handle, name, created_by) values ($1, 'vefa', 'Vefa', $1)",
      [ids.madrasah]
    );
    await client.query(
      "insert into kosks (id, owner_id, name, handle) values ($1, $1, 'Köşk', '@k')",
      [ids.kosk]
    );
    await client.query(
      "insert into madrasah_kosk_hosting (madrasah_id, kosk_id, granted_by) values ($1, $2, $2)",
      [ids.madrasah, ids.kosk]
    );
    const {
      rows: [before],
    } = await client.query("select * from madrasahs where id = $1", [
      ids.madrasah,
    ]);

    await run(join(MIGRATIONS, `${TARGET}.sql`));

    const {
      rows: [after],
    } = await client.query("select * from madrasahs where id = $1", [
      ids.madrasah,
    ]);
    expect(after.archived_at).toBeNull();
    expect(after.archived_by).toBeNull();
    delete after.archived_at;
    delete after.archived_by;
    expect(after).toEqual(before);
    const {
      rows: [right],
    } = await client.query("select granted_by_role from madrasah_kosk_hosting");
    expect(right.granted_by_role).toBeNull();

    await run(join(ROLLBACKS, `${TARGET}.down.sql`));
    expect(await columns("madrasahs")).toEqual(madrasahColumns);
    expect(await columns("madrasah_kosk_hosting")).toEqual(hostingColumns);

    // And forward again: the rollback leaves exactly the state 0032 expects.
    await run(join(MIGRATIONS, `${TARGET}.sql`));
    expect(await columns("madrasahs")).toEqual(
      [...madrasahColumns, "archived_at", "archived_by"].sort()
    );
    expect(await columns("madrasah_kosk_hosting")).toEqual(
      [...hostingColumns, "granted_by_role"].sort()
    );
  });
});
