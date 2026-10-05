import { randomUUID } from "node:crypto";
import pg from "pg";

/**
 * What the archive specs put in tedrisat's database (MDRS-173), under random
 * ids, and take out again: a köşk the signed-in nazım manages with one hidden
 * course, one hidden week and one hidden session (the last two under a live
 * course), plus another köşk with a hidden course that must never show.
 * Direct SQL: hiding a week or a session has no endpoint a test can call.
 */
export interface ArchiveFixture {
  koskId: string;
  koskName: string;
  course: { id: string; title: string };
  week: { id: string; title: string };
  session: { id: string; title: string };
  foreignCourse: { id: string; title: string };
  /** whether the row is back (its \`archived_at\` is null) */
  isShown: (
    table: "courses" | "course_weeks" | "lessons",
    id: string
  ) => Promise<boolean>;
  exists: (table: "courses", id: string) => Promise<boolean>;
  remove: () => Promise<void>;
}

export async function seedArchive(subs: {
  nazim: string;
}): Promise<ArchiveFixture> {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) throw new Error("E2E_DATABASE_URL is not set.");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const tail = randomUUID().slice(0, 8);
  const koskId = randomUUID();
  const otherKoskId = randomUUID();
  const koskName = `E2E Arşiv Köşkü ${tail}`;
  const course = { id: randomUUID(), title: `Maksûd okumaları ${tail}` };
  const liveCourseId = randomUUID();
  const weekId = randomUUID();
  const liveWeekId = randomUUID();
  const week = { id: weekId, title: `Hafta 11: Tasrîf tekrarı ${tail}` };
  const session = { id: randomUUID(), title: `Mehmûz fiiller ${tail}` };
  const foreignCourse = {
    id: randomUUID(),
    title: `Başka köşkün gizli dersi ${tail}`,
  };
  try {
    await client.query("begin");
    // Every hide here is the köşk nazımı's, so each records the köşk as its level
    // (`archived_level`, MDRS-135): a row without one counts as the lowest level
    // that could have hidden it, which is not who hid these.
    await client.query(
      "insert into kosks(id, owner_id, name) values ($1, $2, $3), ($4, $2, $5)",
      [koskId, subs.nazim, koskName, otherKoskId, `E2E Öteki Köşk ${tail}`]
    );
    await client.query(
      "insert into role_assignments(user_id, role, scope_type, scope_id, granted_by) values ($1, 'KOSK_NAZIM', 'kosk', $2, $1)",
      [subs.nazim, koskId]
    );
    await client.query(
      "insert into courses(id, kosk_id, author_id, title, status, archived_at, archived_by, archived_level) values ($1, $2, $3, $4, 'PUBLISHED', now() - interval '2 hours', $3, 'kosk')",
      [course.id, koskId, subs.nazim, course.title]
    );
    await client.query(
      "insert into course_weeks(course_id, week_number, title) values ($1, 1, 'Giriş'), ($1, 2, 'Tarif')",
      [course.id]
    );
    await client.query(
      "insert into courses(id, kosk_id, author_id, title, status) values ($1, $2, $3, 'Emsile ve Bina', 'PUBLISHED')",
      [liveCourseId, koskId, subs.nazim]
    );
    await client.query(
      "insert into course_weeks(id, course_id, week_number, title, archived_at, archived_by, archived_level) values ($1, $2, 11, $3, now() - interval '3 hours', $4, 'kosk')",
      [week.id, liveCourseId, week.title, subs.nazim]
    );
    await client.query(
      "insert into course_weeks(id, course_id, week_number, title) values ($1, $2, 5, 'Hafta 5')",
      [liveWeekId, liveCourseId]
    );
    await client.query(
      "insert into lessons(id, week_id, title, type, scheduled_at, archived_at, archived_by, archived_level) values ($1, $2, $3, 'LIVE', now() + interval '2 days', now() - interval '1 hour', $4, 'kosk')",
      [session.id, liveWeekId, session.title, subs.nazim]
    );
    await client.query(
      "insert into courses(id, kosk_id, author_id, title, status, archived_at, archived_by, archived_level) values ($1, $2, $3, $4, 'PUBLISHED', now(), $3, 'kosk')",
      [foreignCourse.id, otherKoskId, subs.nazim, foreignCourse.title]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    await client.end();
    throw error;
  }
  const kosks = [koskId, otherKoskId];
  return {
    koskId,
    koskName,
    course,
    week,
    session,
    foreignCourse,
    isShown: async (table, id) => {
      const { rows } = await client.query(
        `select archived_at is null as shown from ${table} where id = $1`,
        [id]
      );
      return rows[0]?.shown === true;
    },
    exists: async (_table, id) => {
      const { rowCount } = await client.query(
        "select 1 from courses where id = $1",
        [id]
      );
      return (rowCount ?? 0) > 0;
    },
    remove: async () => {
      try {
        await client.query("begin");
        await client.query(
          "delete from role_assignments where scope_id = any($1)",
          [kosks]
        );
        await client.query(
          "delete from lessons where week_id in (select w.id from course_weeks w join courses c on c.id = w.course_id where c.kosk_id = any($1))",
          [kosks]
        );
        await client.query(
          "delete from course_weeks where course_id in (select id from courses where kosk_id = any($1))",
          [kosks]
        );
        await client.query("delete from courses where kosk_id = any($1)", [
          kosks,
        ]);
        await client.query("delete from kosks where id = any($1)", [kosks]);
        await client.query("commit");
      } finally {
        await client.end();
      }
    },
  };
}
