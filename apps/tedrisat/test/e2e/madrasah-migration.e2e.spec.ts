import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { useDatabaseForThisFile } from "../helpers/test-app.helper";

/**
 * MDRS-106 acceptance: "the migration is reversible, and existing köşks are
 * untouched (`madrasah_id` is null)".
 *
 * No Nest app here. The schema is built by applying the migration files one
 * by one, so that a köşk can exist BEFORE 0017 runs — the case the app's
 * boot-time migrator can never show, because it always runs every migration
 * before any test writes a row.
 */
const MIGRATIONS = join(__dirname, "../../src/database/migrations");
const ROLLBACKS = join(__dirname, "../../src/database/rollbacks");
const TARGET = "0017_madrasahs";

interface JournalEntry {
  tag: string;
}

const statementsOf = (file: string): string[] =>
  readFileSync(file, "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

describe("0017_madrasahs migration (e2e)", () => {
  let client: Client;

  const run = async (file: string) => {
    for (const statement of statementsOf(file)) {
      await client.query(statement);
    }
  };

  const regclass = async (name: string): Promise<string | null> =>
    (await client.query("select to_regclass($1) as r", [name])).rows[0].r;

  const koskColumns = async (): Promise<string[]> =>
    (
      await client.query(
        "select column_name from information_schema.columns where table_name = 'kosks' order by column_name"
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
    ) as { entries: JournalEntry[] };
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

  it("adds the layer without touching an existing köşk, and the rollback removes it cleanly", async () => {
    const columnsBefore = await koskColumns();
    const {
      rows: [before],
    } = await client.query(
      "insert into kosks (owner_id, name, handle) values ($1, $2, $3) returning *",
      ["c0000000-0000-4000-8000-000000000001", "Eski Köşk", "@eski"]
    );

    await run(join(MIGRATIONS, `${TARGET}.sql`));

    const {
      rows: [after],
    } = await client.query("select * from kosks where id = $1", [before.id]);
    expect(after.madrasah_id).toBeNull();
    const { madrasah_id: _added, ...rest } = after;
    expect(rest).toEqual(before);
    expect(await regclass("madrasahs")).toBe("madrasahs");
    expect(await regclass("madrasah_nazirs")).toBe("madrasah_nazirs");

    await run(join(ROLLBACKS, `${TARGET}.down.sql`));

    expect(await regclass("madrasahs")).toBeNull();
    expect(await regclass("madrasah_nazirs")).toBeNull();
    expect(await koskColumns()).toEqual(columnsBefore);
    const {
      rows: [rolledBack],
    } = await client.query("select * from kosks where id = $1", [before.id]);
    expect(rolledBack).toEqual(before);

    // And forward again: the rollback leaves exactly the state 0017 expects.
    await run(join(MIGRATIONS, `${TARGET}.sql`));
    expect(await regclass("madrasahs")).toBe("madrasahs");
  });
});
