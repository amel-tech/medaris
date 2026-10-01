import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { useDatabaseForThisFile } from "../helpers/test-app.helper";

/**
 * MDRS-110 acceptance: "every existing lesson has a correct duration_minutes
 * after the migration".
 *
 * No Nest app here. The schema is built by applying the migration files one
 * by one, so that lessons carrying every shape of free-text duration exist
 * BEFORE 0019 runs — the case the app's boot-time migrator can never show.
 */
const MIGRATIONS = join(__dirname, "../../src/database/migrations");
const ROLLBACKS = join(__dirname, "../../src/database/rollbacks");
const TARGET = "0019_lesson_duration_minutes_course_time_zone";

/** Free text as it may sit in `lessons.duration`, and what 0019 makes of it. */
const CASES: [string | null, number | null][] = [
  // What nizam writes, and has always written.
  ["60 dk", 60],
  ["45 dk", 45],
  ["90dk", 90],
  ["  30 dk  ", 30],
  // Hand-written variants of the same thing.
  ["28 DK", 28],
  ["20 dk.", 20],
  ["15 dakika", 15],
  ["40 min", 40],
  ["75 minutes", 75],
  ["120", 120],
  ["1440 dk", 1440],
  // Not a length in minutes: left NULL rather than guessed.
  ["10 soru", null],
  ["1 saat", null],
  ["1,5 saat", null],
  ["yaklaşık 60 dk", null],
  ["123456 dk", null],
  // Outside the 1-1440 the API accepts.
  ["0 dk", null],
  ["2000 dk", null],
  ["", null],
  [null, null],
];

interface JournalEntry {
  tag: string;
}

const statementsOf = (file: string): string[] =>
  readFileSync(file, "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

describe("0019_lesson_duration_minutes_course_time_zone migration (e2e)", () => {
  let client: Client;

  const run = async (file: string) => {
    for (const statement of statementsOf(file)) {
      await client.query(statement);
    }
  };

  const columnsOf = async (table: string, column: string) =>
    (
      await client.query(
        "select column_name from information_schema.columns where table_name = $1 and column_name = $2",
        [table, column]
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

  it("backfills duration_minutes from the text, gives every course Europe/Istanbul, and the rollback removes both", async () => {
    const owner = "f0000000-0000-4000-8000-000000000001";
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
    for (const [i, [duration]] of CASES.entries()) {
      await client.query(
        "insert into lessons (week_id, title, type, duration, order_index) values ($1, $2, 'LIVE', $3, $4)",
        [week.id, `Ders ${i}`, duration, i]
      );
    }

    await run(join(MIGRATIONS, `${TARGET}.sql`));

    const { rows } = await client.query(
      "select duration, duration_minutes from lessons order by order_index"
    );
    expect(
      rows.map((r: { duration: string | null; duration_minutes: unknown }) => [
        r.duration,
        r.duration_minutes,
      ])
    ).toEqual(CASES);

    const {
      rows: [migrated],
    } = await client.query("select time_zone from courses where id = $1", [
      course.id,
    ]);
    expect(migrated).toEqual({ time_zone: "Europe/Istanbul" });

    await run(join(ROLLBACKS, `${TARGET}.down.sql`));

    expect(await columnsOf("lessons", "duration_minutes")).toEqual([]);
    expect(await columnsOf("courses", "time_zone")).toEqual([]);
    // The old text was never touched, so the rollback loses nothing written
    // before 0019.
    const { rows: texts } = await client.query(
      "select duration from lessons order by order_index"
    );
    expect(texts.map((r: { duration: string | null }) => r.duration)).toEqual(
      CASES.map(([duration]) => duration)
    );

    // And forward again: the rollback leaves exactly the state 0019 expects.
    await run(join(MIGRATIONS, `${TARGET}.sql`));
    expect(await columnsOf("lessons", "duration_minutes")).toHaveLength(1);
  });
});
