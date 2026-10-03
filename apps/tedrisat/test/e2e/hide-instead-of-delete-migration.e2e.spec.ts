import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { useDatabaseForThisFile } from "../helpers/test-app.helper";

/**
 * MDRS-124 acceptance: "the migration is reversible and changes no existing
 * row".
 *
 * No Nest app here. The schema is built by applying the migration files one
 * by one, so that a köşk → course → week → lesson chain with an enrollment,
 * a müderris and a resource exists BEFORE 0018 runs — the case the app's
 * boot-time migrator can never show.
 */
const MIGRATIONS = join(__dirname, "../../src/database/migrations");
const ROLLBACKS = join(__dirname, "../../src/database/rollbacks");
const TARGET = "0018_hide_instead_of_delete";

/** The six foreign keys 0018 moves from CASCADE to RESTRICT. */
const FOREIGN_KEYS = [
  "course_muderris_course_id_courses_id_fk",
  "course_resources_course_id_courses_id_fk",
  "course_weeks_course_id_courses_id_fk",
  "courses_kosk_id_kosks_id_fk",
  "enrollments_course_id_courses_id_fk",
  "lessons_week_id_course_weeks_id_fk",
];

/** Every table whose rows must come through untouched. */
const TABLES = [
  "kosks",
  "courses",
  "course_weeks",
  "lessons",
  "course_muderris",
  "course_resources",
  "enrollments",
];

interface JournalEntry {
  tag: string;
}

const statementsOf = (file: string): string[] =>
  readFileSync(file, "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

describe("0018_hide_instead_of_delete migration (e2e)", () => {
  let client: Client;

  const run = async (file: string) => {
    for (const statement of statementsOf(file)) {
      await client.query(statement);
    }
  };

  const regclass = async (name: string): Promise<string | null> =>
    (await client.query("select to_regclass($1) as r", [name])).rows[0].r;

  /** `confdeltype` per constraint: `c` cascade, `r` restrict. */
  const deleteRules = async (): Promise<Record<string, string>> => {
    const { rows } = await client.query(
      "select conname, confdeltype from pg_constraint where conname = any($1) order by conname",
      [FOREIGN_KEYS]
    );
    return Object.fromEntries(
      rows.map((r: { conname: string; confdeltype: string }) => [
        r.conname,
        r.confdeltype,
      ])
    );
  };

  /** Every row of every table, without the columns 0018 adds. */
  const snapshot = async () => {
    const out: Record<string, unknown[]> = {};
    for (const table of TABLES) {
      const { rows } = await client.query(
        `select * from ${table} order by 1, 2`
      );
      out[table] = rows.map(
        ({
          archived_at: _at,
          archived_by: _by,
          ...rest
        }: Record<string, unknown>) => rest
      );
    }
    return out;
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

  it("changes no row, moves the six foreign keys to RESTRICT, and the rollback restores CASCADE", async () => {
    const owner = "e0000000-0000-4000-8000-000000000001";
    const talebe = "e0000000-0000-4000-8000-000000000002";
    const {
      rows: [kosk],
    } = await client.query(
      "insert into kosks (owner_id, name) values ($1, 'Eski Köşk') returning id",
      [owner]
    );
    const {
      rows: [course],
    } = await client.query(
      "insert into courses (kosk_id, author_id, title) values ($1, $2, 'Eski Kurs') returning id",
      [kosk.id, owner]
    );
    const {
      rows: [week],
    } = await client.query(
      "insert into course_weeks (course_id, week_number, title) values ($1, 1, 'Giriş') returning id",
      [course.id]
    );
    await client.query(
      "insert into lessons (week_id, title, type) values ($1, 'Ders', 'VIDEO')",
      [week.id]
    );
    await client.query(
      "insert into course_muderris (course_id, name) values ($1, 'Müderris')",
      [course.id]
    );
    await client.query(
      "insert into course_resources (course_id, name) values ($1, 'Metin')",
      [course.id]
    );
    await client.query(
      "insert into enrollments (user_id, course_id) values ($1, $2)",
      [talebe, course.id]
    );

    const before = await snapshot();
    const rulesBefore = await deleteRules();
    expect(Object.values(rulesBefore)).toEqual(Array(6).fill("c"));

    await run(join(MIGRATIONS, `${TARGET}.sql`));

    expect(await snapshot()).toEqual(before);
    const {
      rows: [migrated],
    } = await client.query(
      "select archived_at, archived_by from courses where id = $1",
      [course.id]
    );
    expect(migrated).toEqual({ archived_at: null, archived_by: null });
    expect(Object.values(await deleteRules())).toEqual(Array(6).fill("r"));
    expect(await regclass("audit_log")).toBe("audit_log");

    await run(join(ROLLBACKS, `${TARGET}.down.sql`));

    expect(await snapshot()).toEqual(before);
    expect(await deleteRules()).toEqual(rulesBefore);
    expect(await regclass("audit_log")).toBeNull();
    const { rows: columns } = await client.query(
      "select column_name from information_schema.columns where table_name = 'courses' and column_name like 'archived_%'"
    );
    expect(columns).toEqual([]);

    // And forward again: the rollback leaves exactly the state 0018 expects.
    await run(join(MIGRATIONS, `${TARGET}.sql`));
    expect(Object.values(await deleteRules())).toEqual(Array(6).fill("r"));
  });
});
