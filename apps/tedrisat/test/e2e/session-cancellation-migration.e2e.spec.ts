import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { useDatabaseForThisFile } from "../helpers/test-app.helper";

/**
 * MDRS-158: migration 0027 adds the cancellation columns to `lessons` without
 * touching a lesson that exists before it, and its rollback takes them off
 * again. Like `madrasah-migration.e2e.spec.ts`, the schema is built file by
 * file so that a lesson can exist BEFORE 0027 runs.
 */
const MIGRATIONS = join(__dirname, "../../src/database/migrations");
const ROLLBACKS = join(__dirname, "../../src/database/rollbacks");
const TARGET = "0027_session_cancellation";
const ADDED = ["cancel_reason", "cancelled_at", "replacement_lesson_id"];

const statementsOf = (file: string): string[] =>
  readFileSync(file, "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

describe("0027_session_cancellation migration (e2e)", () => {
  let client: Client;

  const run = async (file: string) => {
    for (const statement of statementsOf(file)) {
      await client.query(statement);
    }
  };

  const lessonColumns = async (): Promise<string[]> =>
    (
      await client.query(
        "select column_name from information_schema.columns where table_name = 'lessons' order by column_name"
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

  it("leaves an existing lesson uncancelled, and the rollback removes the columns cleanly", async () => {
    const columnsBefore = await lessonColumns();
    const ids = {
      kosk: "c5800000-0000-4000-8000-000000000001",
      course: "c5800000-0000-4000-8000-000000000002",
      week: "c5800000-0000-4000-8000-000000000003",
    };
    await client.query(
      "insert into kosks (id, owner_id, name, handle) values ($1, $2, 'Köşk', '@k')",
      [ids.kosk, ids.kosk]
    );
    await client.query(
      "insert into courses (id, kosk_id, author_id, title) values ($1, $2, $2, 'Ders')",
      [ids.course, ids.kosk]
    );
    await client.query(
      "insert into course_weeks (id, course_id, week_number, title) values ($1, $2, 1, 'Hafta 1')",
      [ids.week, ids.course]
    );
    const {
      rows: [before],
    } = await client.query(
      "insert into lessons (week_id, title, type) values ($1, 'Celse', 'LIVE') returning *",
      [ids.week]
    );

    await run(join(MIGRATIONS, `${TARGET}.sql`));

    const {
      rows: [after],
    } = await client.query("select * from lessons where id = $1", [before.id]);
    expect(after.cancelled_at).toBeNull();
    expect(after.cancel_reason).toBeNull();
    expect(after.replacement_lesson_id).toBeNull();
    for (const column of ADDED) delete after[column];
    expect(after).toEqual(before);

    // A removed replacement leaves the cancellation standing, link cleared.
    const {
      rows: [makeup],
    } = await client.query(
      "insert into lessons (week_id, title, type) values ($1, 'Telafi', 'LIVE') returning id",
      [ids.week]
    );
    await client.query(
      "update lessons set cancelled_at = now(), replacement_lesson_id = $2 where id = $1",
      [before.id, makeup.id]
    );
    await client.query("delete from lessons where id = $1", [makeup.id]);
    const {
      rows: [cancelled],
    } = await client.query(
      "select cancelled_at, replacement_lesson_id from lessons where id = $1",
      [before.id]
    );
    expect(cancelled.cancelled_at).not.toBeNull();
    expect(cancelled.replacement_lesson_id).toBeNull();

    await run(join(ROLLBACKS, `${TARGET}.down.sql`));
    expect(await lessonColumns()).toEqual(columnsBefore);

    // And forward again: the rollback leaves exactly the state 0027 expects.
    await run(join(MIGRATIONS, `${TARGET}.sql`));
    expect(await lessonColumns()).toEqual([...columnsBefore, ...ADDED].sort());
  });
});
