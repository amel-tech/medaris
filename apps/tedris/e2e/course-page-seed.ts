import { randomUUID } from "node:crypto";
import pg from "pg";

/**
 * What the course-page specs (MDRS-161) put in tedrisat's database, under
 * random ids, and take out again: a published course of a medrese with an
 * ended week holding the sample session, a current week with the next
 * session, one cancelled and its make-up, and two weeks that have not
 * begun; plus a draft. Direct SQL, for the same reasons as `session-seed.ts`:
 * times relative to now, and no endpoint that cancels a session.
 */
export interface CoursePageFixture {
  courseId: string;
  draftId: string;
  title: string;
  koskName: string;
  madrasahName: string;
  meetingUrl: string;
  /** What the sample session shows to anyone, and the closed one must not. */
  sample: { title: string; agendaStep: string; source: string };
  closed: { source: string; agendaStep: string };
  next: { title: string };
  cancelledTitle: string;
  /** Sets the caller's enrollment, replacing any; returns what removes it. */
  enroll: (
    userId: string,
    status: "ENROLLED" | "PENDING" | "REVOKED"
  ) => Promise<() => Promise<void>>;
  enrollmentOf: (
    userId: string
  ) => Promise<{ status: string; progress: number } | null>;
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

export async function seedCoursePage(): Promise<CoursePageFixture> {
  const client = new pg.Client({ connectionString: databaseUrl() });
  await client.connect();
  const id = () => randomUUID();
  const owner = id();
  const imam = id();
  const koskId = id();
  const courseId = id();
  const draftId = id();
  const madrasahId = id();
  const weeks = { w1: id(), w2: id(), w3: id(), w4: id(), d1: id() };
  const lessonIds = {
    sample: id(),
    closed: id(),
    next: id(),
    cancelled: id(),
    makeup: id(),
    future: id(),
    later: id(),
    draft: id(),
  };
  const title = "Bina ve İzhar Şerhi";
  const koskName = "Nûruosmaniye Köşkü";
  const madrasahName = "Süleymaniye Medresesi";
  const meetingUrl = "https://zoom.us/j/555000111";
  const sample = {
    title: "Bina’ya giriş: fiil, mastar ve bâb",
    agendaStep: "Tanışma ve dersin işleyişi",
    source: "Binâü’l-ef’âl, s. 1–6",
  };
  const closed = {
    source: "Gizli kaynak: s. 20–24",
    agendaStep: "Gizli celse adımı",
  };
  const next = { title: "Mastar kalıpları ve ism-i fâil" };
  const cancelledTitle = "Hafta sonu müzakeresi";

  try {
    await client.query("begin");
    await client.query(
      "insert into madrasahs(id, handle, name, created_by) values ($1, $2, $3, $4)",
      [madrasahId, `e2e-${madrasahId.slice(0, 8)}`, madrasahName, owner]
    );
    await client.query(
      "insert into kosks(id, owner_id, name) values ($1, $2, $3)",
      [koskId, owner, koskName]
    );
    await client.query(
      "insert into courses(id, kosk_id, author_id, title, status, madrasah_id, description, requires_approval) values ($1, $2, $3, $4, 'PUBLISHED', $5, $6, true)",
      [
        courseId,
        koskId,
        owner,
        title,
        madrasahId,
        "Bina, medreselerde Emsile’den sonra okunan sarf metnidir.",
      ]
    );
    await client.query(
      "insert into courses(id, kosk_id, author_id, title, status) values ($1, $2, $3, 'Taslak ders', 'DRAFT')",
      [draftId, koskId, owner]
    );
    await client.query(
      `insert into course_weeks(id, course_id, week_number, title, order_index) values
       ($1, $5, 1, 'Giriş ve fiilin bâbları', 0),
       ($2, $5, 2, 'Mastar ve müştaklar', 1),
       ($3, $5, 3, 'Sahih ve mehmûz fiiller', 2),
       ($4, $5, 4, 'Muzâaf fiiller', 3)`,
      [weeks.w1, weeks.w2, weeks.w3, weeks.w4, courseId]
    );
    await client.query(
      "insert into course_weeks(id, course_id, week_number, title, order_index) values ($1, $2, 1, 'Taslak hafta', 0)",
      [weeks.d1, draftId]
    );
    const lesson = (
      lessonId: string,
      weekId: string,
      lessonTitle: string,
      order: number,
      when: string,
      minutes: number,
      extra: {
        preview?: boolean;
        url?: string | null;
        kaynak?: string;
        agenda?: unknown;
      } = {}
    ) =>
      client.query(
        `insert into lessons(id, week_id, title, type, order_index, duration_minutes, scheduled_at, meeting_url, agenda, kaynak, is_preview)
         values ($1, $2, $3, 'LIVE', $4, $5, ${when}, $6, $7, $8, $9)`,
        [
          lessonId,
          weekId,
          lessonTitle,
          order,
          minutes,
          extra.url === undefined ? meetingUrl : extra.url,
          extra.agenda ? JSON.stringify(extra.agenda) : null,
          extra.kaynak ?? null,
          extra.preview ?? false,
        ]
      );
    await lesson(
      lessonIds.sample,
      weeks.w1,
      sample.title,
      0,
      "now() - interval '14 days'",
      60,
      {
        preview: true,
        kaynak: sample.source,
        agenda: [
          { time: "21:00", title: sample.agendaStep },
          { time: "21:10", title: "Mukaddime: fiil ve mastar" },
        ],
      }
    );
    await lesson(
      lessonIds.closed,
      weeks.w1,
      "Kapalı celse",
      1,
      "now() - interval '13 days'",
      60,
      {
        kaynak: closed.source,
        agenda: [{ time: "21:00", title: closed.agendaStep }],
      }
    );
    await lesson(
      lessonIds.next,
      weeks.w2,
      next.title,
      0,
      "now() + interval '2 days'",
      60,
      { url: null }
    );
    await lesson(
      lessonIds.cancelled,
      weeks.w2,
      cancelledTitle,
      1,
      "now() + interval '3 days'",
      45
    );
    await lesson(
      lessonIds.makeup,
      weeks.w2,
      `${cancelledTitle} (telafi)`,
      2,
      "now() + interval '4 days'",
      45
    );
    await client.query(
      "update lessons set cancelled_at = now(), cancel_reason = 'Müderris hasta', replacement_lesson_id = $2 where id = $1",
      [lessonIds.cancelled, lessonIds.makeup]
    );
    await lesson(
      lessonIds.future,
      weeks.w3,
      "Sahih fiiller",
      0,
      "now() + interval '9 days'",
      60
    );
    await lesson(
      lessonIds.later,
      weeks.w4,
      "Muzâaf tarifi",
      0,
      "now() + interval '16 days'",
      60
    );
    await lesson(
      lessonIds.draft,
      weeks.d1,
      "Taslak celse",
      0,
      "now() + interval '9 days'",
      60
    );
    await client.query(
      "insert into users(id, given_name, family_name) values ($1, 'Abdülhamit', 'Karaosmanoğlu')",
      [imam]
    );
    await client.query(
      "insert into course_muderris(course_id, user_id, name, title) values ($1, $2, 'Abdülhamit Karaosmanoğlu', 'İmam')",
      [courseId, imam]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    await client.end();
    throw error;
  }

  return {
    courseId,
    draftId,
    title,
    koskName,
    madrasahName,
    meetingUrl,
    sample,
    closed,
    next,
    cancelledTitle,
    enroll: async (userId, status) => {
      await client.query(
        "delete from enrollments where user_id = $1 and course_id = $2",
        [userId, courseId]
      );
      await client.query(
        "insert into enrollments(user_id, course_id, status, progress) values ($1, $2, $3, 40)",
        [userId, courseId, status]
      );
      return async () => {
        await client.query(
          "delete from enrollments where user_id = $1 and course_id = $2",
          [userId, courseId]
        );
      };
    },
    enrollmentOf: async (userId) => {
      const { rows } = await client.query(
        "select status, progress from enrollments where user_id = $1 and course_id = $2",
        [userId, courseId]
      );
      return rows[0] ?? null;
    },
    remove: async () => {
      try {
        await client.query("begin");
        await client.query(
          "delete from enrollments where course_id = any($1)",
          [[courseId, draftId]]
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
          [[courseId, draftId]]
        );
        await client.query("delete from course_muderris where course_id = $1", [
          courseId,
        ]);
        await client.query("delete from courses where id = any($1)", [
          [courseId, draftId],
        ]);
        await client.query("delete from kosks where id = $1", [koskId]);
        await client.query("delete from madrasahs where id = $1", [madrasahId]);
        await client.query("delete from users where id = $1", [imam]);
        await client.query("commit");
      } finally {
        await client.end();
      }
    },
  };
}
