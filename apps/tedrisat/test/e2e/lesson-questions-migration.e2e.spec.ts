import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { useDatabaseForThisFile } from "../helpers/test-app.helper";

/**
 * MDRS-150, migration 0052: `lesson_questions`, a talebe's questions to the
 * course staff with the answer they were given.
 *
 * No Nest app here. The schema is built by applying the migration files one by
 * one, so that sessions made BEFORE 0052 exist when it runs: the table is added
 * beside them and touches none of their rows. The migration is found by its tag
 * in the journal, not by its place in it, because the journal has gaps.
 */
const MIGRATIONS = join(__dirname, "../../src/database/migrations");
const ROLLBACKS = join(__dirname, "../../src/database/rollbacks");
const TARGET = "0052_lesson_questions";

const statementsOf = (file: string): string[] =>
  readFileSync(file, "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

describe("0052_lesson_questions migration (e2e)", () => {
  let client: Client;

  const run = async (file: string) => {
    for (const statement of statementsOf(file)) {
      await client.query(statement);
    }
  };

  const tableExists = async () =>
    (
      await client.query(
        "select 1 from information_schema.tables where table_name = 'lesson_questions'"
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
    // 0052 is in the journal, and exactly the ones before it are applied first
    // (later migrations have their own specs).
    expect(target).toBeGreaterThan(0);
    for (const tag of tags.slice(0, target)) {
      await run(join(MIGRATIONS, `${tag}.sql`));
    }
  });

  afterAll(async () => {
    await client?.end();
  });

  it("adds the table beside the sessions that exist, holds a question to a session and an answer to the person and the time that gave it, and the rollback drops it", async () => {
    const koskOwner = "f1520000-0000-4000-8000-000000000001";
    const talebe = "f1520000-0000-4000-8000-000000000002";
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
      "insert into lessons (week_id, title, type, order_index) values ($1, 'Celse', 'VIDEO', 0) returning id",
      [weeks[0].id]
    );
    expect(await tableExists()).toBe(false);

    await run(join(MIGRATIONS, `${TARGET}.sql`));

    expect(await tableExists()).toBe(true);
    expect(
      (await client.query("select count(*)::int as n from lessons")).rows
    ).toEqual([{ n: 1 }]);

    await client.query(
      "insert into lesson_questions (lesson_id, author_id, body) values ($1, $2, 'soru')",
      [sessions[0].id, talebe]
    );
    // A question belongs to a session that is there.
    await expect(
      client.query(
        "insert into lesson_questions (lesson_id, author_id, body) values ('00000000-0000-4000-8000-000000000000', $1, 'yetim')",
        [talebe]
      )
    ).rejects.toThrow(/lesson_questions_lesson_id_lessons_id_fk/);
    // An answer comes with who gave it and when, or not at all.
    await expect(
      client.query("update lesson_questions set answer = 'cevap'")
    ).rejects.toThrow(/lesson_questions_answer_complete/);
    await client.query(
      "update lesson_questions set answer = 'cevap', answered_by = $1, answered_at = now()",
      [koskOwner]
    );
    // A session with questions is not deleted from under them.
    await expect(
      client.query("delete from lessons where id = $1", [sessions[0].id])
    ).rejects.toThrow(/lesson_questions_lesson_id_lessons_id_fk/);

    await run(join(ROLLBACKS, `${TARGET}.down.sql`));
    expect(await tableExists()).toBe(false);
    expect(
      (await client.query("select count(*)::int as n from lessons")).rows
    ).toEqual([{ n: 1 }]);

    // And forward again: the rollback leaves exactly the state 0052 expects.
    await run(join(MIGRATIONS, `${TARGET}.sql`));
    expect(await tableExists()).toBe(true);
  });
});
