import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { useDatabaseForThisFile } from "../helpers/test-app.helper";

/**
 * MDRS-122: from 0022 on a new köşk is listed (`is_private` defaults to
 * false), and no köşk that exists when 0022 runs changes — the owner decides
 * about those one by one. The rollback puts the old default back and touches
 * no row either.
 *
 * No Nest app here: the schema is built by applying the migration files one by
 * one, so that köşks exist BEFORE 0022 runs.
 */
const MIGRATIONS = join(__dirname, "../../src/database/migrations");
const ROLLBACKS = join(__dirname, "../../src/database/rollbacks");
const TARGET = "0022_kosk_listed_by_default";

interface JournalEntry {
  tag: string;
}

const statementsOf = (file: string): string[] =>
  readFileSync(file, "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

describe("0022_kosk_listed_by_default migration (e2e)", () => {
  let client: Client;
  const owner = "e2000000-0000-4000-8000-000000000001";

  const run = async (file: string) => {
    for (const statement of statementsOf(file)) {
      await client.query(statement);
    }
  };

  const kosksSnapshot = async () =>
    (await client.query("select * from kosks order by id")).rows;

  const insertWithDefault = async (name: string): Promise<boolean> =>
    (
      await client.query(
        "insert into kosks (owner_id, name) values ($1, $2) returning is_private",
        [owner, name]
      )
    ).rows[0].is_private;

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

  it("lists new köşks, leaves every existing one as it was, and reverses", async () => {
    // Before 0022: the old default made every köşk private unless asked.
    expect(await insertWithDefault("Eski Varsayılan")).toBe(true);
    await client.query(
      "insert into kosks (owner_id, name, is_private) values ($1, 'Açık Köşk', false)",
      [owner]
    );
    const before = await kosksSnapshot();

    await run(join(MIGRATIONS, `${TARGET}.sql`));

    // No UPDATE: the existing rows, `is_private = true` included, are intact.
    expect(await kosksSnapshot()).toEqual(before);
    expect(await insertWithDefault("Yeni Köşk")).toBe(false);

    const afterForward = await kosksSnapshot();
    await run(join(ROLLBACKS, `${TARGET}.down.sql`));

    expect(await kosksSnapshot()).toEqual(afterForward);
    expect(await insertWithDefault("Geri Alındıktan Sonra")).toBe(true);

    // And forward again from the rolled-back state.
    await run(join(MIGRATIONS, `${TARGET}.sql`));
    expect(await insertWithDefault("Yeniden İleri")).toBe(false);
  });
});
