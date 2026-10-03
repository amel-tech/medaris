import { randomUUID } from "node:crypto";
import pg from "pg";

/**
 * What the köşk-view specs put in tedrisat's database (MDRS-175), under random
 * ids and a per-run tail in every name, and take out again: one köşk the way
 * nizam/20 and nizam/23 draw it — a nazım, a medrese with a hosting right, a
 * course of the köşk's own with its müderrisler, an application waiting, two
 * talebe and three sessions (one with no link, one planned, one cancelled), a
 * course the medrese opened, a draft and a hidden one. Direct SQL: the API only
 * writes what the screens ask, and nothing seeds a course hidden last week.
 */
export interface KoskViewFixture {
  tail: string;
  kosk: { id: string; name: string };
  madrasah: { id: string; name: string };
  own: { id: string; title: string };
  hosted: { id: string; title: string };
  draft: { id: string; title: string };
  hidden: { id: string; title: string };
  pendingName: string;
  /** the köşk's courses by status, over the database: the tabs' numbers */
  counts: () => Promise<{
    all: number;
    published: number;
    draft: number;
    hidden: number;
  }>;
  koskRow: () => Promise<{ hidden: boolean; passive: boolean }>;
  courseHidden: (id: string) => Promise<boolean>;
  enrolled: (courseId: string) => Promise<number>;
  nazims: () => Promise<string[]>;
  hostingHeld: () => Promise<number>;
  audits: (action: string) => Promise<number>;
  remove: () => Promise<void>;
}

export async function seedKoskView(subs: {
  nazim: string;
  chief: string;
}): Promise<KoskViewFixture> {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) throw new Error("E2E_DATABASE_URL is not set.");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const tail = randomUUID().slice(0, 8);
  const kosk = { id: randomUUID(), name: `E2E Nûruosmaniye Köşkü ${tail}` };
  const madrasah = { id: randomUUID(), name: `E2E Süleymaniye ${tail}` };
  const mk = (title: string) => ({
    id: randomUUID(),
    title: `${title} ${tail}`,
  });
  const own = mk("Emsile ve Bina");
  const hosted = mk("Bina ve İzhar Şerhi");
  const draft = mk("Maksûd şerhi");
  const hidden = mk("Maksûd okumaları");
  const imam = randomUUID();
  const second = randomUUID();
  const students = [randomUUID(), randomUUID(), randomUUID()];
  const pendingName = `Ömer Faruk ${tail}`;
  const day = (n: number, hour: number) => {
    const d = new Date(Date.now() + n * 86_400_000);
    d.setUTCHours(hour, 0, 0, 0);
    return d.toISOString();
  };

  try {
    await client.query("begin");
    await client.query(
      `insert into users(id, given_name, family_name, email) values
        ($1, 'Mehmet Emin', 'Işıkoğlu', $4),
        ($2, 'Ayşe Nur', 'Kılıçarslan', $5),
        ($3, 'Ömer Faruk', $6, $7)`,
      [
        imam,
        second,
        students[2],
        `imam.${tail}@example.test`,
        `ayse.${tail}@example.test`,
        tail,
        `omer.${tail}@example.test`,
      ]
    );
    await client.query(
      "insert into kosks(id, owner_id, name, handle, field, level, cover_hue) values ($1, $2, $3, $4, 'Arapça dil ilimleri', 'BEGINNER', 250)",
      [kosk.id, subs.chief, kosk.name, `e2e-nuruosmaniye-${tail}`]
    );
    await client.query(
      "insert into madrasahs(id, handle, name, created_by) values ($1, $2, $3, $4)",
      [madrasah.id, `e2e-sul-${tail}`, madrasah.name, subs.chief]
    );
    await client.query(
      "insert into madrasah_kosk_hosting(madrasah_id, kosk_id, granted_by, granted_by_role) values ($1, $2, $3, 'SYSTEM_ADMIN')",
      [madrasah.id, kosk.id, subs.chief]
    );
    await client.query(
      "insert into role_assignments(user_id, role, scope_type, scope_id, granted_by, created_at) values ($1, 'KOSK_NAZIM', 'kosk', $2, $3, '2026-08-25T09:00:00Z')",
      [subs.nazim, kosk.id, subs.chief]
    );
    for (const [c, status, madrasahId, archived, created] of [
      [own, "PUBLISHED", null, null, "2026-09-01T09:00:00Z"],
      [hosted, "PUBLISHED", madrasah.id, null, "2026-09-02T09:00:00Z"],
      [draft, "DRAFT", madrasah.id, null, "2026-09-03T09:00:00Z"],
      [
        hidden,
        "PUBLISHED",
        null,
        "2026-09-25T09:00:00Z",
        "2026-09-04T09:00:00Z",
      ],
    ] as const) {
      await client.query(
        `insert into courses(id, kosk_id, madrasah_id, author_id, title, status, archived_at, archived_by, created_at, requires_approval)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)`,
        [
          c.id,
          kosk.id,
          madrasahId,
          subs.nazim,
          c.title,
          status,
          archived,
          archived ? subs.nazim : null,
          created,
        ]
      );
    }
    await client.query(
      `insert into course_muderris(course_id, user_id, name, order_index) values
        ($1, $2, 'Mehmet Emin Işıkoğlu', 0), ($1, $3, 'Ayşe Nur Kılıçarslan', 1)`,
      [own.id, imam, second]
    );
    await client.query(
      `insert into role_assignments(user_id, role, scope_type, scope_id, granted_by, is_imam) values
        ($1, 'MUDERRIS', 'course', $3, $4, true), ($2, 'MUDERRIS', 'course', $3, $4, false)`,
      [imam, second, own.id, subs.nazim]
    );
    await client.query(
      `insert into enrollments(user_id, course_id, status, student_name) values
        ($1, $4, 'ENROLLED', 'Talebe Bir'), ($2, $4, 'ENROLLED', 'Talebe İki'),
        ($3, $4, 'PENDING', $5), ($1, $6, 'ENROLLED', 'Talebe Bir')`,
      [students[0], students[1], students[2], own.id, pendingName, hosted.id]
    );
    const [w1, w2] = (
      await client.query(
        `insert into course_weeks(course_id, week_number, title) values
          ($1, 1, 'Hafta 1'), ($1, 2, 'Hafta 2') returning id`,
        [own.id]
      )
    ).rows.map((r) => r.id as string);
    await client.query(
      `insert into lessons(week_id, title, type, duration_minutes, scheduled_at, meeting_url, cancelled_at) values
        ($1, 'Geçmiş celse', 'LIVE', 60, $3, 'https://zoom.us/j/1', null),
        ($2, 'Bağlantısız celse', 'LIVE', 60, $4, null, null),
        ($2, 'Planlı celse', 'LIVE', 45, $5, 'https://zoom.us/j/2', null),
        ($2, 'İptal edilen celse', 'LIVE', 45, $6, null, now())`,
      [w1, w2, day(-3, 18), day(2, 18), day(4, 18), day(3, 17)]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    await client.end();
    throw error;
  }

  return {
    tail,
    kosk,
    madrasah,
    own,
    hosted,
    draft,
    hidden,
    pendingName,
    counts: async () => {
      const { rows } = await client.query(
        `select count(*) as total,
                count(*) filter (where archived_at is null and status = 'PUBLISHED') as published,
                count(*) filter (where archived_at is null and status = 'DRAFT') as draft,
                count(*) filter (where archived_at is not null) as hidden
           from courses where kosk_id = $1`,
        [kosk.id]
      );
      const r = rows[0];
      return {
        all: Number(r.total),
        published: Number(r.published),
        draft: Number(r.draft),
        hidden: Number(r.hidden),
      };
    },
    koskRow: async () => {
      const { rows } = await client.query(
        "select archived_at, passive_since from kosks where id = $1",
        [kosk.id]
      );
      return {
        hidden: rows[0].archived_at !== null,
        passive: rows[0].passive_since !== null,
      };
    },
    courseHidden: async (id) => {
      const { rows } = await client.query(
        "select archived_at from courses where id = $1",
        [id]
      );
      return rows[0].archived_at !== null;
    },
    enrolled: async (courseId) => {
      const { rows } = await client.query(
        "select count(*) as n from enrollments where course_id = $1 and status = 'ENROLLED'",
        [courseId]
      );
      return Number(rows[0].n);
    },
    nazims: async () => {
      const { rows } = await client.query(
        "select user_id from role_assignments where scope_id = $1 and role = 'KOSK_NAZIM' and revoked_at is null",
        [kosk.id]
      );
      return rows.map((r) => r.user_id as string);
    },
    hostingHeld: async () => {
      const { rows } = await client.query(
        "select count(*) as n from madrasah_kosk_hosting where kosk_id = $1 and revoked_at is null",
        [kosk.id]
      );
      return Number(rows[0].n);
    },
    audits: async (action) => {
      const { rows } = await client.query(
        "select count(*) as n from audit_log where action = $1 and (entity_id = $2 or details::text like $3)",
        [action, kosk.id, `%${kosk.id}%`]
      );
      return Number(rows[0].n);
    },
    remove: async () => {
      try {
        await client.query("begin");
        const courseIds = [own.id, hosted.id, draft.id, hidden.id];
        await client.query(
          "delete from audit_log where entity_id = any($1) or details::text like $2",
          [[kosk.id, ...courseIds], `%${kosk.id}%`]
        );
        await client.query(
          "delete from role_assignments where scope_id = any($1)",
          [[kosk.id, ...courseIds]]
        );
        await client.query(
          "delete from lessons where week_id in (select id from course_weeks where course_id = any($1))",
          [courseIds]
        );
        await client.query(
          "delete from course_weeks where course_id = any($1)",
          [courseIds]
        );
        await client.query(
          "delete from enrollments where course_id = any($1)",
          [courseIds]
        );
        await client.query(
          "delete from course_muderris where course_id = any($1)",
          [courseIds]
        );
        await client.query("delete from courses where kosk_id = $1", [kosk.id]);
        await client.query(
          "delete from madrasah_kosk_hosting where kosk_id = $1",
          [kosk.id]
        );
        await client.query("delete from kosks where id = $1", [kosk.id]);
        await client.query("delete from madrasahs where id = $1", [
          madrasah.id,
        ]);
        await client.query("delete from users where id = any($1)", [
          [imam, second, students[2]],
        ]);
        await client.query("commit");
      } finally {
        await client.end();
      }
    },
  };
}
