import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { useDatabaseForThisFile } from "../helpers/test-app.helper";

/**
 * MDRS-283: migration 0055 adds the in-person mark to `courses` (not null,
 * false) and to `lessons` (null: follow the course), leaving every course and
 * every session that exists before it not in person, and its rollback takes
 * both columns off again. Like `session-cancellation-migration.e2e.spec.ts`,
 * the schema is built file by file so that rows can exist BEFORE 0055 runs.
 */
const MIGRATIONS = join(__dirname, "../../src/database/migrations");
const ROLLBACKS = join(__dirname, "../../src/database/rollbacks");
const TARGET = "0055_in_person";

const statementsOf = (file: string): string[] =>
  readFileSync(file, "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

describe("0055_in_person migration (e2e)", () => {
  let client: Client;

  const run = async (file: string) => {
    for (const statement of statementsOf(file)) {
      await client.query(statement);
    }
  };

  const columnsOf = async (table: string): Promise<string[]> =>
    (
      await client.query(
        "select column_name from information_schema.columns where table_name = $1 order by column_name",
        [table]
      )
    ).rows
      .map((r: { column_name: string }) => r.column_name)
      .sort();

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

  it("leaves every existing course and session not in person, and the rollback removes the columns cleanly", async () => {
    const courseColumns = await columnsOf("courses");
    const lessonColumns = await columnsOf("lessons");
    const ids = {
      kosk: "c2830000-0000-4000-8000-000000000001",
      course: "c2830000-0000-4000-8000-000000000002",
      week: "c2830000-0000-4000-8000-000000000003",
    };
    await client.query(
      "insert into kosks (id, owner_id, name, handle) values ($1, $2, 'Köşk', '@k')",
      [ids.kosk, ids.kosk]
    );
    const {
      rows: [courseBefore],
    } = await client.query(
      "insert into courses (id, kosk_id, author_id, title) values ($1, $2, $2, 'Ders') returning *",
      [ids.course, ids.kosk]
    );
    await client.query(
      "insert into course_weeks (id, course_id, week_number, title) values ($1, $2, 1, 'Hafta 1')",
      [ids.week, ids.course]
    );
    const {
      rows: [lessonBefore],
    } = await client.query(
      "insert into lessons (week_id, title, type, meeting_url) values ($1, 'Celse', 'LIVE', 'https://zoom.us/j/1') returning *",
      [ids.week]
    );

    await run(join(MIGRATIONS, `${TARGET}.sql`));

    const {
      rows: [courseAfter],
    } = await client.query("select * from courses where id = $1", [ids.course]);
    const {
      rows: [lessonAfter],
    } = await client.query("select * from lessons where id = $1", [
      lessonBefore.id,
    ]);
    expect(courseAfter.in_person).toBe(false);
    expect(lessonAfter.in_person).toBeNull();
    delete courseAfter.in_person;
    delete lessonAfter.in_person;
    expect(courseAfter).toEqual(courseBefore);
    expect(lessonAfter).toEqual(lessonBefore);

    // A course is never left undecided; a session may be.
    await expect(
      client.query("update courses set in_person = null where id = $1", [
        ids.course,
      ])
    ).rejects.toThrow(/null value/);
    await client.query("update lessons set in_person = true where id = $1", [
      lessonBefore.id,
    ]);

    await run(join(ROLLBACKS, `${TARGET}.down.sql`));
    expect(await columnsOf("courses")).toEqual(courseColumns);
    expect(await columnsOf("lessons")).toEqual(lessonColumns);

    // And forward again: the rollback leaves exactly the state 0055 expects.
    await run(join(MIGRATIONS, `${TARGET}.sql`));
    expect(await columnsOf("courses")).toEqual(
      [...courseColumns, "in_person"].sort()
    );
    expect(await columnsOf("lessons")).toEqual(
      [...lessonColumns, "in_person"].sort()
    );
  });
});
