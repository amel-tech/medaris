import { randomUUID } from "node:crypto";
import pg from "pg";

/**
 * What the course specs put in tedrisat's database (MDRS-176), under random ids
 * and a per-run tail in every name, and take out again: one köşk run by the
 * köşk nazımı, the e2e müderris' account as a user (a müderris row links only
 * an account that has signed in), and one course of the köşk with two weeks and
 * five sessions (a past one, a planned one with a link, a planned one with
 * none, one cancelled and one far ahead). Direct SQL: the API only writes what
 * the screens ask, and nothing seeds a session that began a while ago.
 */
export interface CourseFixture {
  tail: string;
  kosk: { id: string; name: string };
  course: { id: string; title: string };
  /** a course the form opens, found by its title */
  courseByTitle: (title: string) => Promise<{
    id: string;
    status: string;
    isClosed: boolean;
    requiresApproval: boolean;
    archived: boolean;
    timeZone: string;
    coverLabel: string | null;
  } | null>;
  lessonsOf: (courseId: string) => Promise<
    {
      id: string;
      title: string;
      scheduledAt: Date | null;
      meetingUrl: string | null;
      cancelledAt: Date | null;
      archived: boolean;
      weekNumber: number;
    }[]
  >;
  muderrisOf: (
    courseId: string
  ) => Promise<{ userId: string; isImam: boolean }[]>;
  audits: (action: string) => Promise<number>;
  lessonByTitle: (title: string) => Promise<string>;
  remove: () => Promise<void>;
}

export async function seedCourses(subs: {
  nazim: string;
  chief: string;
  muderris: string;
}): Promise<CourseFixture> {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) throw new Error("E2E_DATABASE_URL is not set.");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const tail = randomUUID().slice(0, 8);
  const kosk = { id: randomUUID(), name: `E2E Nûruosmaniye Köşkü ${tail}` };
  const course = { id: randomUUID(), title: `Emsile ve Bina ${tail}` };
  const day = (n: number, hour: number) => {
    const d = new Date(Date.now() + n * 86_400_000);
    d.setUTCHours(hour, 0, 0, 0);
    return d.toISOString();
  };

  try {
    await client.query("begin");
    await client.query(
      `insert into users(id, given_name, family_name, email) values
        ($1, 'E2E', 'Müderris', 'e2e-muderris@example.test'),
        ($2, 'E2E', 'Köşk Nazımı', 'e2e-kosk-nazim@example.test')
       on conflict (id) do nothing`,
      [subs.muderris, subs.nazim]
    );
    await client.query(
      "insert into kosks(id, owner_id, name, handle, field, level, cover_hue) values ($1, $2, $3, $4, 'Arapça dil ilimleri', 'BEGINNER', 250)",
      [kosk.id, subs.chief, kosk.name, `e2e-courses-${tail}`]
    );
    await client.query(
      "insert into role_assignments(user_id, role, scope_type, scope_id, granted_by) values ($1, 'KOSK_NAZIM', 'kosk', $2, $3)",
      [subs.nazim, kosk.id, subs.chief]
    );
    await client.query(
      `insert into courses(id, kosk_id, author_id, title, status, requires_approval, cover_hue)
       values ($1, $2, $3, $4, 'PUBLISHED', true, 20)`,
      [course.id, kosk.id, subs.nazim, course.title]
    );
    await client.query(
      "insert into course_muderris(course_id, user_id, name, order_index) values ($1, $2, 'E2E Köşk Nazımı', 0)",
      [course.id, subs.nazim]
    );
    await client.query(
      "insert into role_assignments(user_id, role, scope_type, scope_id, granted_by, is_imam) values ($1, 'MUDERRIS', 'course', $2, $3, true)",
      [subs.nazim, course.id, subs.chief]
    );
    const [w1, w2] = (
      await client.query(
        `insert into course_weeks(course_id, week_number, title, order_index) values
          ($1, 4, 'Mezîd fiiller', 0), ($1, 5, 'Mehmûz fiiller', 1) returning id`,
        [course.id]
      )
    ).rows.map((r) => r.id as string);
    await client.query(
      `insert into lessons(week_id, title, type, duration_minutes, scheduled_at, meeting_url, cancelled_at, order_index) values
        ($1, 'Geçmiş celse', 'LIVE', 60, $3, 'https://zoom.us/j/1', null, 0),
        ($2, 'Bağlantılı celse', 'LIVE', 60, $4, 'https://zoom.us/j/86357204418', null, 0),
        ($2, 'Bağlantısız celse', 'LIVE', 45, $5, null, null, 1),
        ($2, 'İptal edilen celse', 'LIVE', 45, $6, null, now(), 2),
        ($2, 'Uzak celse', 'LIVE', 60, $7, null, null, 3)`,
      [w1, w2, day(-8, 18), day(2, 18), day(3, 18), day(4, 17), day(9, 18)]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    await client.end();
    throw error;
  }

  const coursesOfKosk = async () =>
    (
      await client.query("select id from courses where kosk_id = $1", [kosk.id])
    ).rows.map((r) => r.id as string);

  return {
    tail,
    kosk,
    course,
    courseByTitle: async (title) => {
      const { rows } = await client.query(
        `select id, status, is_closed, requires_approval, archived_at, time_zone, cover_label
           from courses where kosk_id = $1 and title = $2`,
        [kosk.id, title]
      );
      const r = rows[0];
      return r
        ? {
            id: r.id,
            status: r.status,
            isClosed: r.is_closed,
            requiresApproval: r.requires_approval,
            archived: r.archived_at !== null,
            timeZone: r.time_zone,
            coverLabel: r.cover_label,
          }
        : null;
    },
    lessonsOf: async (courseId) => {
      const { rows } = await client.query(
        `select l.id, l.title, l.scheduled_at, l.meeting_url, l.cancelled_at,
                l.archived_at, w.week_number
           from lessons l join course_weeks w on w.id = l.week_id
          where w.course_id = $1 order by l.scheduled_at`,
        [courseId]
      );
      return rows.map((r) => ({
        id: r.id,
        title: r.title,
        scheduledAt: r.scheduled_at,
        meetingUrl: r.meeting_url,
        cancelledAt: r.cancelled_at,
        archived: r.archived_at !== null,
        weekNumber: r.week_number,
      }));
    },
    muderrisOf: async (courseId) => {
      const { rows } = await client.query(
        `select user_id, is_imam from role_assignments
          where scope_id = $1 and role = 'MUDERRIS' and revoked_at is null
          order by user_id`,
        [courseId]
      );
      return rows.map((r) => ({ userId: r.user_id, isImam: r.is_imam }));
    },
    audits: async (action) => {
      const ids = await coursesOfKosk();
      const { rows } = await client.query(
        `select count(*) as n from audit_log
          where action = $1
            and (entity_id = any($2::uuid[]) or details->>'courseId' = any($3::text[]))`,
        [action, ids, ids]
      );
      return Number(rows[0].n);
    },
    lessonByTitle: async (title) => {
      const { rows } = await client.query(
        `select l.id from lessons l join course_weeks w on w.id = l.week_id
          join courses c on c.id = w.course_id where c.kosk_id = $1 and l.title = $2`,
        [kosk.id, title]
      );
      return rows[0]?.id as string;
    },
    remove: async () => {
      try {
        const ids = await coursesOfKosk();
        await client.query("begin");
        await client.query(
          `delete from audit_log where entity_id = any($1::uuid[]) or entity_id = $2
             or (entity = 'lesson' and details->>'courseId' = any($3::text[]))`,
          [ids, kosk.id, ids]
        );
        await client.query(
          "delete from role_assignments where scope_id = any($1::uuid[]) or scope_id = $2",
          [ids, kosk.id]
        );
        await client.query(
          "delete from lessons where week_id in (select id from course_weeks where course_id = any($1::uuid[]))",
          [ids]
        );
        await client.query(
          "delete from course_weeks where course_id = any($1::uuid[])",
          [ids]
        );
        await client.query(
          "delete from course_muderris where course_id = any($1::uuid[])",
          [ids]
        );
        await client.query("delete from courses where kosk_id = $1", [kosk.id]);
        await client.query("delete from kosks where id = $1", [kosk.id]);
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        await client.end();
      }
    },
  };
}
