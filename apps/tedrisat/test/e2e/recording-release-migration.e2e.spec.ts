import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { useDatabaseForThisFile } from "../helpers/test-app.helper";

/**
 * MDRS-288: migration 0057 adds the recording release time to `lessons`
 * (null: as soon as READY, how every recording behaved before it) and the
 * announcement mark to `lesson_recordings`. A recording READY before it
 * counts as announced, so a release time set on its session later never
 * tells its talebe a second time; one still PROCESSING or FAILED does not.
 * Its rollback takes both columns off again. Like `in-person-migration`, the
 * schema is built file by file so that rows exist BEFORE 0057 runs.
 */
const MIGRATIONS = join(__dirname, "../../src/database/migrations");
const ROLLBACKS = join(__dirname, "../../src/database/rollbacks");
const TARGET = "0057_recording_release";

const statementsOf = (file: string): string[] =>
  readFileSync(file, "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

describe("0057_recording_release migration (e2e)", () => {
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

  it("counts every READY recording announced and nothing else, opens every session as soon as READY, and rolls back cleanly", async () => {
    const recordingColumns = await columnsOf("lesson_recordings");
    const lessonColumns = await columnsOf("lessons");
    const ids = {
      kosk: "c2880000-0000-4000-8000-000000000001",
      course: "c2880000-0000-4000-8000-000000000002",
      week: "c2880000-0000-4000-8000-000000000003",
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
    const lessonIds: string[] = [];
    for (const title of ["Bir", "İki", "Üç"]) {
      const {
        rows: [lesson],
      } = await client.query(
        "insert into lessons (week_id, title, type) values ($1, $2, 'LIVE') returning id",
        [ids.week, title]
      );
      lessonIds.push(lesson.id);
    }
    const [ready, processing, failed] = lessonIds;
    await client.query(
      `insert into lesson_recordings (lesson_id, title, provider, url, status) values
        ($1, 'Hazır', 'YOUTUBE', 'https://www.youtube.com/watch?v=a', 'READY'),
        ($2, 'Hazırlanıyor', 'YOUTUBE', null, 'PROCESSING')`,
      [ready, processing]
    );
    await client.query(
      `insert into lesson_recordings (lesson_id, title, provider, url, status, bunny_video_id, upload_expires_at)
        values ($1, 'Yükleme', 'BUNNY', null, 'FAILED', 'b2880000-0000-4000-8000-000000000009', now())`,
      [failed]
    );

    await run(join(MIGRATIONS, `${TARGET}.sql`));

    const { rows: marks } = await client.query(
      "select lesson_id, notified_at from lesson_recordings"
    );
    const markOf = new Map(
      marks.map((r: { lesson_id: string; notified_at: Date | null }) => [
        r.lesson_id,
        r.notified_at,
      ])
    );
    expect(markOf.get(ready)).toBeInstanceOf(Date);
    expect(markOf.get(processing)).toBeNull();
    expect(markOf.get(failed)).toBeNull();
    const { rows: releases } = await client.query(
      "select recording_available_at from lessons"
    );
    expect(releases).toHaveLength(3);
    for (const row of releases) expect(row.recording_available_at).toBeNull();

    await run(join(ROLLBACKS, `${TARGET}.down.sql`));
    expect(await columnsOf("lesson_recordings")).toEqual(recordingColumns);
    expect(await columnsOf("lessons")).toEqual(lessonColumns);

    // And forward again: the rollback leaves exactly the state 0057 expects.
    await run(join(MIGRATIONS, `${TARGET}.sql`));
    expect(await columnsOf("lesson_recordings")).toEqual(
      [...recordingColumns, "notified_at"].sort()
    );
    expect(await columnsOf("lessons")).toEqual(
      [...lessonColumns, "recording_available_at"].sort()
    );
  });
});
