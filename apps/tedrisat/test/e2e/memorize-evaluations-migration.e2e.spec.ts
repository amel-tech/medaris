import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { useDatabaseForThisFile } from "../helpers/test-app.helper";

/**
 * MDRS-248, migration 0069: how a homework is handed in (`lesson_assignments.kind`)
 * and the course team's marks on a memorisation homework
 * (`assignment_evaluations`).
 *
 * No Nest app here. The schema is built by applying the migration files one by
 * one, so that homework set BEFORE 0069 exists when it runs: each becomes a
 * FILE homework, as it was. The migration is found by its tag in the journal,
 * not by its place in it, because the journal has gaps.
 */
const MIGRATIONS = join(__dirname, "../../src/database/migrations");
const ROLLBACKS = join(__dirname, "../../src/database/rollbacks");
const TARGET = "0069_memorize_evaluations";

const statementsOf = (file: string): string[] =>
  readFileSync(file, "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

describe("0069_memorize_evaluations migration (e2e)", () => {
  let client: Client;

  const run = async (file: string) => {
    for (const statement of statementsOf(file)) {
      await client.query(statement);
    }
  };

  const tableExists = async () =>
    (
      await client.query(
        "select 1 from information_schema.tables where table_name = 'assignment_evaluations'"
      )
    ).rowCount === 1;

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

  it("makes every homework there a FILE homework, holds one mark per talebe per homework, keeps a homework with marks, and the rollback undoes it", async () => {
    const koskOwner = "f2480000-0000-4000-8000-000000000001";
    const talebe = "f2480000-0000-4000-8000-000000000002";
    const { rows: kosks } = await client.query(
      "insert into kosks (owner_id, name) values ($1, 'Köşk') returning id",
      [koskOwner]
    );
    const { rows: courses } = await client.query(
      "insert into courses (kosk_id, author_id, title) values ($1, $2, 'Ders') returning id",
      [kosks[0].id, koskOwner]
    );
    const { rows: weeks } = await client.query(
      "insert into course_weeks (course_id, week_number, title, order_index) values ($1, 1, 'Hafta', 0) returning id",
      [courses[0].id]
    );
    const { rows: sessions } = await client.query(
      "insert into lessons (week_id, title, type, order_index) values ($1, 'Celse', 'LIVE', 0) returning id",
      [weeks[0].id]
    );
    const { rows: homework } = await client.query(
      "insert into lesson_assignments (lesson_id, description) values ($1, 'Çekin.') returning id",
      [sessions[0].id]
    );
    expect(await tableExists()).toBe(false);

    await run(join(MIGRATIONS, `${TARGET}.sql`));

    expect(await tableExists()).toBe(true);
    expect(
      (await client.query("select kind from lesson_assignments")).rows
    ).toEqual([{ kind: "FILE" }]);

    await client.query(
      "update lesson_assignments set kind = 'MEMORIZE' where id = $1",
      [homework[0].id]
    );
    await client.query(
      "insert into assignment_evaluations (assignment_id, user_id, status, evaluated_by) values ($1, $2, 'FULL', $3)",
      [homework[0].id, talebe, koskOwner]
    );
    // One mark per talebe per homework.
    await expect(
      client.query(
        "insert into assignment_evaluations (assignment_id, user_id, status, evaluated_by) values ($1, $2, 'ABSENT', $3)",
        [homework[0].id, talebe, koskOwner]
      )
    ).rejects.toThrow(/assignment_evaluations_assignment_user_uq/);
    // A status it does not know.
    await expect(
      client.query(
        "insert into assignment_evaluations (assignment_id, user_id, status, evaluated_by) values ($1, $3, 'PENDING', $2)",
        [homework[0].id, koskOwner, koskOwner]
      )
    ).rejects.toThrow(/evaluation_status/);
    // A homework with marks is not deleted from under them.
    await expect(
      client.query("delete from lesson_assignments where id = $1", [
        homework[0].id,
      ])
    ).rejects.toThrow(
      /assignment_evaluations_assignment_id_lesson_assignments_id_fk/
    );

    await run(join(ROLLBACKS, `${TARGET}.down.sql`));
    expect(await tableExists()).toBe(false);
    expect(
      (await client.query("select count(*)::int as n from lesson_assignments"))
        .rows
    ).toEqual([{ n: 1 }]);

    // And forward again: the rollback leaves exactly the state 0069 expects.
    await run(join(MIGRATIONS, `${TARGET}.sql`));
    expect(await tableExists()).toBe(true);
  });
});
