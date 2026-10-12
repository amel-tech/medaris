import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { useDatabaseForThisFile } from "../helpers/test-app.helper";

/**
 * MDRS-290: migration 0059 adds `lesson_submissions` (one per talebe per
 * celse) and `submission_files`, both RESTRICT under the lesson like every
 * table under a course. It only creates tables, so every row written before it
 * keeps working; its rollback takes both off again and leaves exactly the
 * state 0059 expects. The schema is built file by file so that rows exist
 * BEFORE 0059 runs.
 */
const MIGRATIONS = join(__dirname, "../../src/database/migrations");
const ROLLBACKS = join(__dirname, "../../src/database/rollbacks");
const TARGET = "0059_lesson_submissions";

const statementsOf = (file: string): string[] =>
  readFileSync(file, "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

const ids = {
  kosk: "c2900000-0000-4000-8000-000000000001",
  course: "c2900000-0000-4000-8000-000000000002",
  week: "c2900000-0000-4000-8000-000000000003",
  lesson: "c2900000-0000-4000-8000-000000000004",
  talebe: "c2900000-0000-4000-8000-000000000005",
};

describe("0059_lesson_submissions migration (e2e)", () => {
  let client: Client;

  const run = async (file: string) => {
    for (const statement of statementsOf(file)) {
      await client.query(statement);
    }
  };
  const tables = async (): Promise<string[]> =>
    (
      await client.query(
        "select table_name from information_schema.tables where table_schema = 'public' and table_name in ('lesson_submissions', 'submission_files') order by table_name"
      )
    ).rows.map((r: { table_name: string }) => r.table_name);
  const refused = async (sql: string, params: unknown[]): Promise<string> => {
    await client.query("savepoint attempt");
    try {
      await client.query(sql, params);
      return "accepted";
    } catch (error) {
      return (error as { constraint?: string }).constraint ?? String(error);
    } finally {
      await client.query("rollback to savepoint attempt");
    }
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
    await client.query(
      "insert into kosks (id, owner_id, name, handle) values ($1, $1, 'Köşk', '@k')",
      [ids.kosk]
    );
    await client.query(
      "insert into courses (id, kosk_id, author_id, title) values ($1, $2, $2, 'Ders')",
      [ids.course, ids.kosk]
    );
    await client.query(
      "insert into course_weeks (id, course_id, week_number, title) values ($1, $2, 1, 'Hafta 1')",
      [ids.week, ids.course]
    );
    await client.query(
      "insert into lessons (id, week_id, title, type) values ($1, $2, 'Celse', 'LIVE')",
      [ids.lesson, ids.week]
    );
  });

  afterAll(async () => {
    await client?.end();
  });

  it("adds the two tables beside the rows already there, and rolls back cleanly", async () => {
    expect(await tables()).toEqual([]);
    await run(join(MIGRATIONS, `${TARGET}.sql`));
    expect(await tables()).toEqual(["lesson_submissions", "submission_files"]);
    const { rows } = await client.query("select id from lessons");
    expect(rows).toEqual([{ id: ids.lesson }]);

    await client.query("begin");
    await run(join(ROLLBACKS, `${TARGET}.down.sql`));
    await client.query("commit");
    expect(await tables()).toEqual([]);
    await run(join(MIGRATIONS, `${TARGET}.sql`));
    expect(await tables()).toEqual(["lesson_submissions", "submission_files"]);
  });

  it("holds one homework per talebe per celse, one row per object, and keeps a celse from going while it has homework", async () => {
    await client.query("begin");
    const {
      rows: [submission],
    } = await client.query(
      "insert into lesson_submissions (lesson_id, user_id, note) values ($1, $2, 'not') returning id",
      [ids.lesson, ids.talebe]
    );
    expect(
      await refused(
        "insert into lesson_submissions (lesson_id, user_id) values ($1, $2)",
        [ids.lesson, ids.talebe]
      )
    ).toBe("lesson_submissions_lesson_user_uq");
    await client.query(
      "insert into submission_files (submission_id, storage_key, file_name, content_type, size_bytes) values ($1, 'k/1', 'a.pdf', 'application/pdf', 10)",
      [submission.id]
    );
    expect(
      await refused(
        "insert into submission_files (submission_id, storage_key, file_name, content_type, size_bytes) values ($1, 'k/1', 'b.pdf', 'application/pdf', 10)",
        [submission.id]
      )
    ).toBe("submission_files_storage_key_uq");
    expect(
      await refused("delete from lessons where id = $1", [ids.lesson])
    ).toBe("lesson_submissions_lesson_id_lessons_id_fk");
    expect(
      await refused("delete from lesson_submissions where id = $1", [
        submission.id,
      ])
    ).toBe("submission_files_submission_id_lesson_submissions_id_fk");
    await client.query("rollback");
  });
});
