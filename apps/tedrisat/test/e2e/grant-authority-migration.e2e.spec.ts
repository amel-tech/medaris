import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { useDatabaseForThisFile } from "../helpers/test-app.helper";

/**
 * MDRS-135, migration 0047: `permission_grants.authority_scope_type`, the level
 * of the authority a grant was made under, which lets a grant from above a
 * policy's level bypass that policy.
 *
 * No Nest app here. The schema is built by applying the migration files one by
 * one, so that grants made BEFORE 0047 exist when it runs: they must keep every
 * column they had and read the new one as null, which the engine takes to mean
 * "made at its own scope".
 */
const MIGRATIONS = join(__dirname, "../../src/database/migrations");
const ROLLBACKS = join(__dirname, "../../src/database/rollbacks");
const TARGET = "0047_mdrs_135_grant_authority";

const statementsOf = (file: string): string[] =>
  readFileSync(file, "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

describe("0047_mdrs_135_grant_authority migration (e2e)", () => {
  let client: Client;

  const run = async (file: string) => {
    for (const statement of statementsOf(file)) {
      await client.query(statement);
    }
  };

  const columns = async () =>
    (
      await client.query(
        "select column_name, is_nullable, data_type, udt_name from information_schema.columns where table_name = 'permission_grants' and column_name = 'authority_scope_type'"
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
    // 0047 is in the journal, and exactly the ones before it are applied first
    // (later migrations have their own specs).
    expect(target).toBeGreaterThan(0);
    for (const tag of tags.slice(0, target)) {
      await run(join(MIGRATIONS, `${tag}.sql`));
    }
  });

  afterAll(async () => {
    await client?.end();
  });

  it("adds a nullable scope_type column, leaves held grants as they were, and the rollback removes it", async () => {
    const user = "f1000000-0000-4000-8000-000000000001";
    const giver = "f1000000-0000-4000-8000-000000000002";
    await client.query(
      "insert into permission_grants (user_id, scope_type, scope_id, permission, granted_by) values ($1, 'platform', null, 'platform.kosk_edit', $2)",
      [user, giver]
    );
    expect(await columns()).toEqual([]);

    await run(join(MIGRATIONS, `${TARGET}.sql`));

    expect(await columns()).toEqual([
      {
        column_name: "authority_scope_type",
        is_nullable: "YES",
        data_type: "USER-DEFINED",
        udt_name: "scope_type",
      },
    ]);
    const { rows } = await client.query(
      "select permission, granted_by, authority_scope_type from permission_grants"
    );
    expect(rows).toEqual([
      {
        permission: "platform.kosk_edit",
        granted_by: giver,
        authority_scope_type: null,
      },
    ]);
    // The column takes the four levels and nothing else.
    await client.query(
      "update permission_grants set authority_scope_type = 'kosk'"
    );
    await expect(
      client.query(
        "update permission_grants set authority_scope_type = 'galaxy'"
      )
    ).rejects.toThrow();

    await run(join(ROLLBACKS, `${TARGET}.down.sql`));
    expect(await columns()).toEqual([]);
    expect(
      (await client.query("select permission from permission_grants")).rows
    ).toEqual([{ permission: "platform.kosk_edit" }]);

    // And forward again: the rollback leaves exactly the state 0047 expects.
    await run(join(MIGRATIONS, `${TARGET}.sql`));
    expect(await columns()).toHaveLength(1);
  });
});
