import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { useDatabaseForThisFile } from "../helpers/test-app.helper";

/**
 * MDRS-135, migration 0048: `archived_level` on the six tables something can be
 * hidden in, the level (platform, köşk, medrese or course) the hider acted at,
 * so that a restore can be refused to a lower level.
 *
 * No Nest app. The schema is built by applying the migration files one by one,
 * so that rows hidden BEFORE 0048 exist when it runs: they keep every column
 * and read the new one as null, which counts as the lowest level that could
 * have hidden them.
 */
const MIGRATIONS = join(__dirname, "../../src/database/migrations");
const ROLLBACKS = join(__dirname, "../../src/database/rollbacks");
const TARGET = "0048_mdrs_135_archived_level";
const TABLES = [
  "course_weeks",
  "courses",
  "lessons",
  "decks",
  "kosks",
  "madrasahs",
] as const;

const statementsOf = (file: string): string[] =>
  readFileSync(file, "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

describe("0048_mdrs_135_archived_level migration (e2e)", () => {
  let client: Client;

  const run = async (file: string) => {
    for (const statement of statementsOf(file)) {
      await client.query(statement);
    }
  };

  const columns = async () =>
    (
      await client.query(
        "select table_name, is_nullable, udt_name from information_schema.columns where column_name = 'archived_level' order by table_name"
      )
    ).rows;

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
    expect(target).toBe(tags.length - 1);
    for (const tag of tags.slice(0, target)) {
      await run(join(MIGRATIONS, `${tag}.sql`));
    }
  });

  afterAll(async () => {
    await client?.end();
  });

  it("adds a nullable scope_type column to the six tables, leaves a hidden köşk as it was, and the rollback removes them", async () => {
    const owner = "f2000000-0000-4000-8000-000000000001";
    await client.query(
      "insert into kosks (owner_id, name, archived_at, archived_by) values ($1, 'Eski köşk', now(), $1)",
      [owner]
    );
    expect(await columns()).toEqual([]);

    await run(join(MIGRATIONS, `${TARGET}.sql`));

    expect(await columns()).toEqual(
      [...TABLES].sort().map((table_name) => ({
        table_name,
        is_nullable: "YES",
        udt_name: "scope_type",
      }))
    );
    const { rows } = await client.query(
      "select name, archived_by, archived_level from kosks"
    );
    expect(rows).toEqual([
      { name: "Eski köşk", archived_by: owner, archived_level: null },
    ]);
    // The column takes the four levels and nothing else.
    await client.query("update kosks set archived_level = 'kosk'");
    await expect(
      client.query("update kosks set archived_level = 'galaxy'")
    ).rejects.toThrow();

    await run(join(ROLLBACKS, `${TARGET}.down.sql`));
    expect(await columns()).toEqual([]);
    expect((await client.query("select name from kosks")).rows).toEqual([
      { name: "Eski köşk" },
    ]);

    // And forward again: the rollback leaves exactly the state 0048 expects.
    await run(join(MIGRATIONS, `${TARGET}.sql`));
    expect(await columns()).toHaveLength(TABLES.length);
  });
});
