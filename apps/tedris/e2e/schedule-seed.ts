import { randomUUID } from "node:crypto";
import pg from "pg";

/**
 * What the Programım specs put in tedrisat's database (MDRS-163), under random
 * ids, and take out again. Direct SQL for the same reason as `seed.ts`: no
 * endpoint cancels a session. Times are "N days from today at HH:MM in
 * Istanbul", so each day group is the same whenever the spec runs.
 *
 * Window one is today and the six days after it; window two the next seven.
 */
export interface ScheduleFixture {
  courseIds: { a: string; b: string; pending: string; other: string };
  titles: {
    /** day 2, 21:00, no link */
    a1: string;
    /** day 3, 20:00, cancelled */
    a2: string;
    /** day 4, 21:00, Zoom (make-up of a2) */
    a3: string;
    /** day 3, 21:00, Zoom */
    b1: string;
    /** day 9, 21:00: window two */
    b2: string;
    /** a PENDING course's session, day 2 */
    pending: string;
    /** a course the talebe is not in, day 2 */
    other: string;
  };
  ids: { a1: string; a2: string; a3: string; b1: string; b2: string };
  courseTitles: { a: string; b: string };
  meetingUrl: string;
  enroll: (
    userId: string,
    which: "a" | "b" | "pending"
  ) => Promise<() => Promise<void>>;
  remove: () => Promise<void>;
}

const databaseUrl = () => {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) {
    throw new Error(
      "E2E_DATABASE_URL is not set: point it at the database tedrisat uses."
    );
  }
  return url;
};

export async function seedSchedule(): Promise<ScheduleFixture> {
  const client = new pg.Client({ connectionString: databaseUrl() });
  await client.connect();
  const id = () => randomUUID();
  const owner = id();
  const koskId = id();
  const course = { a: id(), b: id(), pending: id(), other: id() };
  const weeks = { a: id(), b: id(), pending: id(), other: id() };
  const tag = randomUUID().slice(0, 6);
  const courseTitles = {
    a: `Emsile ve Bina ${tag}`,
    b: `Siyer okumaları ${tag}`,
  };
  const meetingUrl = "https://zoom.us/j/246813579";
  const ids = { a1: id(), a2: id(), a3: id(), b1: id(), b2: id() };
  const pendingId = id();
  const otherId = id();
  const titles = {
    a1: `Mehmûz fiiller ${tag}`,
    a2: `Hafta sonu müzakeresi ${tag}`,
    a3: `Hafta sonu müzakeresi (telafi) ${tag}`,
    b1: `Hicret: Mekke’den Medine’ye ${tag}`,
    b2: `Akabe biatları ${tag}`,
    pending: `Bekleyen dersin celsesi ${tag}`,
    other: `Kayıtsız dersin celsesi ${tag}`,
  };

  // `day` days from today (Istanbul) at `hour`:00 Istanbul, as a timestamptz.
  const at = (day: number, hour: number) =>
    `((date_trunc('day', now() at time zone 'Europe/Istanbul') + interval '${day} days ${hour} hours') at time zone 'Europe/Istanbul')`;

  const lesson = (
    lessonId: string,
    weekId: string,
    title: string,
    order: number,
    when: string,
    minutes: number,
    url: string | null
  ) =>
    client.query(
      `insert into lessons(id, week_id, title, type, order_index, duration_minutes, scheduled_at, meeting_url)
       values ($1, $2, $3, 'LIVE', $4, $5, ${when}, $6)`,
      [lessonId, weekId, title, order, minutes, url]
    );

  try {
    await client.query("begin");
    await client.query(
      "insert into kosks(id, owner_id, name) values ($1, $2, 'Nûruosmaniye Köşkü')",
      [koskId, owner]
    );
    const insertCourse = (
      cid: string,
      title: string,
      week: string,
      n: number
    ) =>
      client
        .query(
          "insert into courses(id, kosk_id, author_id, title, status) values ($1, $2, $3, $4, 'PUBLISHED')",
          [cid, koskId, owner, title]
        )
        .then(() =>
          client.query(
            "insert into course_weeks(id, course_id, week_number, title, order_index) values ($1, $2, $3, 'Hafta', 0)",
            [week, cid, n]
          )
        );
    await insertCourse(course.a, courseTitles.a, weeks.a, 5);
    await insertCourse(course.b, courseTitles.b, weeks.b, 4);
    await insertCourse(course.pending, `Bekleyen ${tag}`, weeks.pending, 1);
    await insertCourse(course.other, `Kayıtsız ${tag}`, weeks.other, 1);
    await lesson(ids.a1, weeks.a, titles.a1, 0, at(2, 21), 60, null);
    await lesson(ids.a2, weeks.a, titles.a2, 1, at(3, 20), 45, null);
    await lesson(ids.a3, weeks.a, titles.a3, 2, at(4, 21), 45, meetingUrl);
    await client.query(
      "update lessons set cancelled_at = now(), replacement_lesson_id = $2 where id = $1",
      [ids.a2, ids.a3]
    );
    await lesson(ids.b1, weeks.b, titles.b1, 0, at(3, 21), 60, meetingUrl);
    await lesson(ids.b2, weeks.b, titles.b2, 1, at(9, 21), 60, null);
    await lesson(
      pendingId,
      weeks.pending,
      titles.pending,
      0,
      at(2, 22),
      60,
      null
    );
    await lesson(otherId, weeks.other, titles.other, 0, at(2, 22), 60, null);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    await client.end();
    throw error;
  }

  return {
    courseIds: course,
    titles,
    ids,
    courseTitles,
    meetingUrl,
    enroll: async (userId, which) => {
      const status = which === "pending" ? "PENDING" : "ENROLLED";
      await client.query(
        "insert into enrollments(user_id, course_id, status) values ($1, $2, $3)",
        [userId, course[which], status]
      );
      return async () => {
        await client.query(
          "delete from enrollments where user_id = $1 and course_id = $2",
          [userId, course[which]]
        );
      };
    },
    remove: async () => {
      try {
        await client.query("begin");
        const all = Object.values(course);
        await client.query(
          "delete from enrollments where course_id = any($1)",
          [all]
        );
        await client.query(
          "update lessons set replacement_lesson_id = null where week_id = any($1)",
          [Object.values(weeks)]
        );
        await client.query("delete from lessons where week_id = any($1)", [
          Object.values(weeks),
        ]);
        await client.query(
          "delete from course_weeks where course_id = any($1)",
          [all]
        );
        await client.query("delete from courses where id = any($1)", [all]);
        await client.query("delete from kosks where id = $1", [koskId]);
        await client.query("commit");
      } finally {
        await client.end();
      }
    },
  };
}
