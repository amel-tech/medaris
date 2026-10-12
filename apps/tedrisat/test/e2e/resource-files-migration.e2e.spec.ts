import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { useDatabaseForThisFile } from "../helpers/test-app.helper";

/**
 * MDRS-287: migration 0058 lets a resource be a file in Medaris storage. The
 * course's and the celse's resources get the file's columns (key, name, type,
 * size), a celse resource's link becomes optional, and a CHECK keeps each row
 * a link or a file and never both (a course resource may still be a bare
 * name, as before). `storage_deletions` is new. Rows written before 0058 keep
 * working unchanged, and its rollback leaves exactly the state 0058 expects.
 * The schema is built file by file so that rows exist BEFORE 0058 runs.
 */
const MIGRATIONS = join(__dirname, "../../src/database/migrations");
const ROLLBACKS = join(__dirname, "../../src/database/rollbacks");
const TARGET = "0058_resource_files";

const statementsOf = (file: string): string[] =>
  readFileSync(file, "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

const ids = {
  kosk: "c2870000-0000-4000-8000-000000000001",
  course: "c2870000-0000-4000-8000-000000000002",
  week: "c2870000-0000-4000-8000-000000000003",
  lesson: "c2870000-0000-4000-8000-000000000004",
};

describe("0058_resource_files migration (e2e)", () => {
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
    ).rows.map((r: { column_name: string }) => r.column_name);
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
    await client.query(
      `insert into course_resources (course_id, name, url) values
        ($1, 'Bağlantı', 'https://example.org/a'), ($1, 'Yalnız ad', null)`,
      [ids.course]
    );
    await client.query(
      "insert into lesson_resources (lesson_id, name, url) values ($1, 'Drive', 'https://drive.google.com/x')",
      [ids.lesson]
    );
  });

  afterAll(async () => {
    await client?.end();
  });

  it("keeps every existing resource as it was, and adds storage_deletions", async () => {
    const courseColumns = await columnsOf("course_resources");
    const lessonColumns = await columnsOf("lesson_resources");
    await run(join(MIGRATIONS, `${TARGET}.sql`));

    const { rows: course } = await client.query(
      "select name, url, storage_key, file_name, content_type, size_bytes from course_resources order by name"
    );
    expect(course).toEqual([
      {
        name: "Bağlantı",
        url: "https://example.org/a",
        storage_key: null,
        file_name: null,
        content_type: null,
        size_bytes: null,
      },
      {
        name: "Yalnız ad",
        url: null,
        storage_key: null,
        file_name: null,
        content_type: null,
        size_bytes: null,
      },
    ]);
    const { rows: lesson } = await client.query(
      "select name, url, storage_key from lesson_resources"
    );
    expect(lesson).toEqual([
      { name: "Drive", url: "https://drive.google.com/x", storage_key: null },
    ]);
    expect(await columnsOf("storage_deletions")).toEqual([
      "attempts",
      "created_at",
      "due_at",
      "last_error",
      "reason",
      "storage_key",
    ]);

    // The rollback, then forward again: the same columns as before and after.
    await client.query("begin");
    await run(join(ROLLBACKS, `${TARGET}.down.sql`));
    await client.query("commit");
    expect(await columnsOf("course_resources")).toEqual(courseColumns);
    expect(await columnsOf("lesson_resources")).toEqual(lessonColumns);
    expect(await columnsOf("storage_deletions")).toEqual([]);
    await run(join(MIGRATIONS, `${TARGET}.sql`));
  });

  it("holds each resource to a link or a file, never both and never half a file", async () => {
    await client.query("begin");
    const file = ["k/1", "a.pdf", "application/pdf", 10];
    expect(
      await refused(
        "insert into lesson_resources (lesson_id, name, url, storage_key, file_name, content_type, size_bytes) values ($1, 'x', null, $2, $3, $4, $5)",
        [ids.lesson, ...file]
      )
    ).toBe("accepted");
    expect(
      await refused(
        "insert into lesson_resources (lesson_id, name, url) values ($1, 'x', null)",
        [ids.lesson]
      )
    ).toBe("lesson_resources_link_or_file");
    expect(
      await refused(
        "insert into lesson_resources (lesson_id, name, url, storage_key, file_name, content_type, size_bytes) values ($1, 'x', 'https://e.org', $2, $3, $4, $5)",
        [ids.lesson, ...file]
      )
    ).toBe("lesson_resources_link_or_file");
    expect(
      await refused(
        "insert into lesson_resources (lesson_id, name, url, storage_key) values ($1, 'x', null, 'k/2')",
        [ids.lesson]
      )
    ).toBe("lesson_resources_link_or_file");
    expect(
      await refused(
        "insert into course_resources (course_id, name, url, storage_key, file_name, content_type, size_bytes) values ($1, 'x', null, $2, $3, $4, $5)",
        [ids.course, ...file]
      )
    ).toBe("accepted");
    expect(
      await refused(
        "insert into course_resources (course_id, name, url, storage_key, file_name, content_type, size_bytes) values ($1, 'x', 'https://e.org', $2, $3, $4, $5)",
        [ids.course, ...file]
      )
    ).toBe("course_resources_link_or_file");
    expect(
      await refused(
        "insert into course_resources (course_id, name, storage_key, file_name) values ($1, 'x', 'k/3', 'a.pdf')",
        [ids.course]
      )
    ).toBe("course_resources_link_or_file");
    // One object, one row.
    await client.query(
      "insert into course_resources (course_id, name, storage_key, file_name, content_type, size_bytes) values ($1, 'y', 'k/4', 'a.pdf', 'application/pdf', 1)",
      [ids.course]
    );
    expect(
      await refused(
        "insert into course_resources (course_id, name, storage_key, file_name, content_type, size_bytes) values ($1, 'z', 'k/4', 'a.pdf', 'application/pdf', 1)",
        [ids.course]
      )
    ).toBe("course_resources_storage_key_uq");
    await client.query("rollback");
  });
});
