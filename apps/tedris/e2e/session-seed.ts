import { randomUUID } from "node:crypto";
import pg from "pg";

/**
 * What the session-page specs put in tedrisat's database (MDRS-158), under
 * random ids, and take out again. Direct SQL for the same reason as
 * `seed.ts`: there is no endpoint that cancels a session, and the times have
 * to be relative to now ("8 dakika sonra") so each spec seeds its own clock.
 */
export interface SessionFixture {
  courseId: string;
  koskName: string;
  courseTitle: string;
  imamName: string;
  sessions: {
    /** Starts in 8 minutes: inside the join window. */
    upcoming: { id: string; title: string };
    /** Starts in 12 minutes: the join is not open yet. */
    far: { id: string; title: string };
    /** Starts in 30 minutes with no meeting link. */
    noLink: { id: string; title: string };
    /** Hafta 4, over. */
    past: { id: string; title: string };
    /** Cancelled, with `replacement` as its make-up. */
    cancelled: { id: string; title: string };
    replacement: { id: string; title: string };
    /** A VIDEO lesson: not a session. */
    video: { id: string; title: string };
  };
  meetingUrl: string;
  /** Enrolls `userId` (a Keycloak `sub`); returns what to remove. */
  enroll: (
    userId: string,
    status: "ENROLLED" | "PENDING"
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

export async function seedSession(): Promise<SessionFixture> {
  const client = new pg.Client({ connectionString: databaseUrl() });
  await client.connect();
  const id = () => randomUUID();
  const owner = id();
  const imam = id();
  const koskId = id();
  const courseId = id();
  const weeks = { w4: id(), w5: id(), w6: id() };
  const koskName = "Nûruosmaniye Köşkü";
  const courseTitle = "Emsile ve Bina";
  const imamName = "Abdülhamit Karaosmanoğlu";
  const meetingUrl = "https://zoom.us/j/987654321";
  const s = {
    upcoming: { id: id(), title: "Mehmûz fiiller: kara’e ve emr-i hâzır" },
    far: { id: id(), title: "Muzâaf fiiller: tarif" },
    noLink: { id: id(), title: "Muzâaf fiiller: çekim" },
    past: { id: id(), title: "Hafta sonu müzakeresi" },
    cancelled: { id: id(), title: "Hafta sonu müzakeresi (iptal)" },
    replacement: { id: id(), title: "Hafta sonu müzakeresi (telafi)" },
    video: { id: id(), title: "Şerh videosu" },
  };

  const insertLesson = (
    lessonId: string,
    weekId: string,
    title: string,
    order: number,
    when: string,
    minutes: number,
    extra: { url?: string | null; agenda?: unknown; type?: string } = {}
  ) =>
    client.query(
      `insert into lessons(id, week_id, title, type, order_index, duration_minutes, scheduled_at, meeting_url, agenda, kaynak)
       values ($1, $2, $3, $4, $5, $6, ${when}, $7, $8, 'Bina, s. 20–24')`,
      [
        lessonId,
        weekId,
        title,
        extra.type ?? "LIVE",
        order,
        minutes,
        extra.url === undefined ? meetingUrl : extra.url,
        extra.agenda ? JSON.stringify(extra.agenda) : null,
      ]
    );

  try {
    await client.query("begin");
    await client.query(
      "insert into kosks(id, owner_id, name) values ($1, $2, $3)",
      [koskId, owner, koskName]
    );
    await client.query(
      "insert into courses(id, kosk_id, author_id, title, status) values ($1, $2, $3, $4, 'PUBLISHED')",
      [courseId, koskId, owner, courseTitle]
    );
    await client.query(
      "insert into course_weeks(id, course_id, week_number, title, order_index) values ($1, $4, 4, 'Mezîd fiiller', 0), ($2, $4, 5, 'Mehmûz fiiller', 1), ($3, $4, 6, 'Muzâaf fiiller', 2)",
      [weeks.w4, weeks.w5, weeks.w6, courseId]
    );
    await insertLesson(
      s.past.id,
      weeks.w4,
      s.past.title,
      0,
      "now() - interval '7 days'",
      45
    );
    await insertLesson(
      s.upcoming.id,
      weeks.w5,
      s.upcoming.title,
      0,
      "now() + interval '8 minutes'",
      60,
      {
        agenda: [
          { time: "21:00", title: "Selâm ve geçen haftanın tekrarı" },
          { time: "21:25", title: "قرأ fiilinin mâzî ve muzâri çekimi" },
        ],
      }
    );
    await insertLesson(
      s.cancelled.id,
      weeks.w5,
      s.cancelled.title,
      1,
      "now() + interval '1 day'",
      45,
      {
        agenda: [{ time: "20:00", title: "Cumartesi celsesinin özeti" }],
      }
    );
    await insertLesson(
      s.replacement.id,
      weeks.w5,
      s.replacement.title,
      2,
      "now() + interval '3 days'",
      45
    );
    await client.query(
      "update lessons set cancelled_at = now(), cancel_reason = 'Müderris hasta', replacement_lesson_id = $2 where id = $1",
      [s.cancelled.id, s.replacement.id]
    );
    await insertLesson(
      s.far.id,
      weeks.w6,
      s.far.title,
      0,
      "now() + interval '12 minutes'",
      45
    );
    await insertLesson(
      s.noLink.id,
      weeks.w6,
      s.noLink.title,
      1,
      "now() + interval '30 minutes'",
      45,
      { url: null }
    );
    await client.query(
      "insert into lessons(id, week_id, title, type, order_index, duration_minutes) values ($1, $2, $3, 'VIDEO', 2, 20)",
      [s.video.id, weeks.w6, s.video.title]
    );
    await client.query(
      "insert into users(id, given_name, family_name) values ($1, 'Abdülhamit', 'Karaosmanoğlu')",
      [imam]
    );
    await client.query(
      "insert into course_muderris(course_id, user_id, name) values ($1, $2, $3)",
      [courseId, imam, imamName]
    );
    await client.query(
      "insert into role_assignments(user_id, role, scope_type, scope_id, is_imam, granted_by) values ($1, 'MUDERRIS', 'course', $2, true, $3)",
      [imam, courseId, owner]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    await client.end();
    throw error;
  }

  return {
    courseId,
    koskName,
    courseTitle,
    imamName,
    sessions: s,
    meetingUrl,
    enroll: async (userId, status) => {
      await client.query(
        "insert into enrollments(user_id, course_id, status) values ($1, $2, $3)",
        [userId, courseId, status]
      );
      return async () => {
        await client.query(
          "delete from enrollments where user_id = $1 and course_id = $2",
          [userId, courseId]
        );
      };
    },
    remove: async () => {
      try {
        await client.query("begin");
        await client.query("delete from role_assignments where scope_id = $1", [
          courseId,
        ]);
        await client.query("delete from enrollments where course_id = $1", [
          courseId,
        ]);
        await client.query(
          "update lessons set replacement_lesson_id = null where week_id = any($1)",
          [Object.values(weeks)]
        );
        await client.query("delete from lessons where week_id = any($1)", [
          Object.values(weeks),
        ]);
        await client.query("delete from course_weeks where course_id = $1", [
          courseId,
        ]);
        await client.query("delete from course_muderris where course_id = $1", [
          courseId,
        ]);
        await client.query("delete from courses where id = $1", [courseId]);
        await client.query("delete from kosks where id = $1", [koskId]);
        await client.query("delete from users where id = $1", [imam]);
        await client.query("commit");
      } finally {
        await client.end();
      }
    },
  };
}
