import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { useDatabaseForThisFile } from "../helpers/test-app.helper";

/**
 * MDRS-126: every köşk that exists when 0021 runs keeps the manager it had —
 * its `owner_id` becomes its first `kosk_managers` row — and no köşk row
 * changes.
 *
 * No Nest app here. The schema is built by applying the migration files one
 * by one, so that köşks exist BEFORE 0021 runs — the case the app's boot-time
 * migrator can never show.
 */
const MIGRATIONS = join(__dirname, "../../src/database/migrations");
const ROLLBACKS = join(__dirname, "../../src/database/rollbacks");
const TARGET = "0021_kosk_managers";

interface JournalEntry {
  tag: string;
}

const statementsOf = (file: string): string[] =>
  readFileSync(file, "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

describe("0021_kosk_managers migration (e2e)", () => {
  let client: Client;

  const run = async (file: string) => {
    for (const statement of statementsOf(file)) {
      await client.query(statement);
    }
  };

  const regclass = async (name: string): Promise<string | null> =>
    (await client.query("select to_regclass($1) as r", [name])).rows[0].r;

  const kosksSnapshot = async () =>
    (await client.query("select * from kosks order by id")).rows;

  const managers = async () =>
    (
      await client.query(
        "select kosk_id, user_id, added_by from kosk_managers order by kosk_id, user_id"
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

  it("makes each köşk's owner its manager, changes no köşk, and reverses", async () => {
    const ownerA = "e1000000-0000-4000-8000-000000000001";
    const ownerB = "e1000000-0000-4000-8000-000000000002";
    const inserted = (
      await client.query(
        "insert into kosks (owner_id, name) values ($1, 'Birinci Köşk'), ($1, 'İkinci Köşk'), ($2, 'Üçüncü Köşk') returning id, owner_id",
        [ownerA, ownerB]
      )
    ).rows as { id: string; owner_id: string }[];

    const before = await kosksSnapshot();
    expect(await regclass("kosk_managers")).toBeNull();

    await run(join(MIGRATIONS, `${TARGET}.sql`));

    expect(await kosksSnapshot()).toEqual(before);
    const expected = inserted
      .map((k) => ({
        kosk_id: k.id,
        user_id: k.owner_id,
        added_by: k.owner_id,
      }))
      .sort((a, b) => (a.kosk_id < b.kosk_id ? -1 : 1));
    expect(await managers()).toEqual(expected);

    await run(join(ROLLBACKS, `${TARGET}.down.sql`));

    expect(await regclass("kosk_managers")).toBeNull();
    expect(await kosksSnapshot()).toEqual(before);

    // And forward again: the rollback leaves exactly the state 0021 expects,
    // and the reseed gives the same managers.
    await run(join(MIGRATIONS, `${TARGET}.sql`));
    expect(await managers()).toEqual(expected);
  });
});
