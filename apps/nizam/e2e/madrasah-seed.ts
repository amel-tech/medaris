import { randomUUID } from "node:crypto";
import pg from "pg";
import { type HeldMedarisNazim, holdMedarisNazim } from "./medaris-nazim";

/**
 * What the Medreseler and Barındırma hakları specs put in tedrisat's
 * database (MDRS-170), under random ids, and take out again: three medreses
 * (active with a başmüderris, passive with none, hidden), a fourth with no
 * hosting right to give, a köşk the signed-in nazım manages — the active
 * medrese holds a right in it, with a published course of three talebe and a
 * draft one — and a köşk of someone else. Direct SQL: nothing but the API's
 * own writes makes a medrese passive or hidden, and there is no endpoint that
 * seeds courses and talebe for a test.
 */
export interface MadrasahFixture {
  tail: string;
  koskId: string;
  koskName: string;
  otherKoskId: string;
  active: { id: string; name: string; handle: string; head: string };
  passive: { id: string; name: string };
  hidden: { id: string; name: string; handle: string };
  spare: { id: string; name: string };
  courses: {
    published: { id: string; title: string };
    draft: { id: string; title: string };
  };
  grantedBy: string;
  /** the medreses' status counts as the database holds them */
  counts: () => Promise<{
    all: number;
    active: number;
    passive: number;
    hidden: number;
  }>;
  hostingHeld: (madrasahId: string) => Promise<boolean>;
  courseHidden: (courseId: string) => Promise<boolean>;
  madrasahByHandle: (
    handle: string
  ) => Promise<{ id: string; archived: boolean } | null>;
  headsOf: (madrasahId: string) => Promise<string[]>;
  lookupAudits: () => Promise<number>;
  audits: (action: string) => Promise<number>;
  /** a MEDARIS_NAZIM role for the account, taken out with the rest */
  makeMedarisNazim: (sub: string) => Promise<void>;
  remove: () => Promise<void>;
}

export async function seedMadrasahs(subs: {
  nazim: string;
}): Promise<MadrasahFixture> {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) throw new Error("E2E_DATABASE_URL is not set.");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const tail = randomUUID().slice(0, 8);
  const startedAt = new Date();
  const ids = {
    active: randomUUID(),
    passive: randomUUID(),
    hidden: randomUUID(),
    spare: randomUUID(),
    kosk: randomUUID(),
    otherKosk: randomUUID(),
  };
  const people = {
    head: randomUUID(),
    hiddenHead: randomUUID(),
    imam: randomUUID(),
    granter: randomUUID(),
  };
  const names = {
    active: `E2E Süleymaniye ${tail}`,
    passive: `E2E Zeyrek ${tail}`,
    hidden: `E2E Vefa ${tail}`,
    spare: `E2E Fatih ${tail}`,
  };
  const koskName = `E2E Nûruosmaniye Köşkü ${tail}`;
  const courses = {
    published: { id: randomUUID(), title: `Bina ve İzhar Şerhi ${tail}` },
    draft: { id: randomUUID(), title: `Maksûd şerhi ${tail}` },
  };
  const students = [randomUUID(), randomUUID(), randomUUID()];
  const extraMadrasahIds: string[] = [];
  const medarisNazims: HeldMedarisNazim[] = [];

  try {
    await client.query("begin");
    await client.query(
      `insert into users(id, given_name, family_name, email) values
        ($1, 'Mehmet Emin', 'Işıkoğlu', $5), ($2, 'Mustafa Râsim', 'Erdemoğlu', $6),
        ($3, 'Ayşe Nur', 'Kılıçarslan', $7), ($4, 'Yusuf Ziya', 'Ertuğrul', $8)`,
      [
        people.head,
        people.hiddenHead,
        people.imam,
        people.granter,
        `${people.head.slice(0, 8)}.${tail}@example.test`,
        `${people.hiddenHead.slice(0, 8)}.${tail}@example.test`,
        `${people.imam.slice(0, 8)}.${tail}@example.test`,
        `${people.granter.slice(0, 8)}.${tail}@example.test`,
      ]
    );
    await client.query(
      `insert into madrasahs(id, handle, name, created_by, passive_since, passive_reason, archived_at, archived_by) values
        ($1, $5, $9, $13, null, null, null, null),
        ($2, $6, $10, $13, '2026-09-27T09:00:00Z', 'TERM_ENDED', null, null),
        ($3, $7, $11, $13, null, null, '2026-09-24T09:00:00Z', $13),
        ($4, $8, $12, $13, null, null, null, null)`,
      [
        ids.active,
        ids.passive,
        ids.hidden,
        ids.spare,
        `e2e-suleymaniye-${tail}`,
        `e2e-zeyrek-${tail}`,
        `e2e-vefa-${tail}`,
        `e2e-fatih-${tail}`,
        names.active,
        names.passive,
        names.hidden,
        names.spare,
        people.granter,
      ]
    );
    await client.query(
      `insert into role_assignments(user_id, role, scope_type, scope_id, granted_by) values
        ($1, 'MEDRESE_BASMUDERRIS', 'madrasah', $2, $5),
        ($3, 'MEDRESE_BASMUDERRIS', 'madrasah', $4, $5)`,
      [people.head, ids.active, people.hiddenHead, ids.hidden, people.granter]
    );
    await client.query(
      "insert into kosks(id, owner_id, name) values ($1, $2, $3), ($4, $5, $6)",
      [
        ids.kosk,
        subs.nazim,
        koskName,
        ids.otherKosk,
        randomUUID(),
        `E2E Başka Köşk ${tail}`,
      ]
    );
    await client.query(
      "insert into role_assignments(user_id, role, scope_type, scope_id, granted_by) values ($1, 'KOSK_NAZIM', 'kosk', $2, $1)",
      [subs.nazim, ids.kosk]
    );
    await client.query(
      `insert into madrasah_kosk_hosting(madrasah_id, kosk_id, granted_by, granted_by_role, created_at)
       values ($1, $2, $3, 'SYSTEM_ADMIN', '2026-09-01T09:00:00Z')`,
      [ids.active, ids.kosk, people.granter]
    );
    // The passive medrese holds a right of its own in the same köşk.
    await client.query(
      `insert into madrasah_kosk_hosting(madrasah_id, kosk_id, granted_by, granted_by_role)
       values ($1, $2, $3, 'KOSK_NAZIM')`,
      [ids.passive, ids.kosk, subs.nazim]
    );
    for (const [c, status] of [
      [courses.published, "PUBLISHED"],
      [courses.draft, "DRAFT"],
    ] as const) {
      await client.query(
        "insert into courses(id, kosk_id, madrasah_id, author_id, title, status) values ($1, $2, $3, $4, $5, $6)",
        [c.id, ids.kosk, ids.active, subs.nazim, c.title, status]
      );
    }
    await client.query(
      "insert into course_muderris(course_id, user_id, name) values ($1, $2, 'Ayşe Nur Kılıçarslan')",
      [courses.published.id, people.imam]
    );
    await client.query(
      "insert into role_assignments(user_id, role, scope_type, scope_id, granted_by, is_imam) values ($1, 'MUDERRIS', 'course', $2, $3, true)",
      [people.imam, courses.published.id, people.granter]
    );
    for (const student of students) {
      await client.query(
        "insert into enrollments(user_id, course_id, status) values ($1, $2, 'ENROLLED')",
        [student, courses.published.id]
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    await client.end();
    throw error;
  }

  const allMadrasahIds = () => [
    ids.active,
    ids.passive,
    ids.hidden,
    ids.spare,
    ...extraMadrasahIds,
  ];

  return {
    tail,
    koskId: ids.kosk,
    koskName,
    otherKoskId: ids.otherKosk,
    active: {
      id: ids.active,
      name: names.active,
      handle: `e2e-suleymaniye-${tail}`,
      head: people.head,
    },
    passive: { id: ids.passive, name: names.passive },
    hidden: {
      id: ids.hidden,
      name: names.hidden,
      handle: `e2e-vefa-${tail}`,
    },
    spare: { id: ids.spare, name: names.spare },
    courses,
    grantedBy: people.granter,
    counts: async () => {
      const { rows } = await client.query(
        `select count(*)::int as total,
                count(*) filter (where archived_at is null and passive_since is null)::int as active,
                count(*) filter (where archived_at is null and passive_since is not null)::int as passive,
                count(*) filter (where archived_at is not null)::int as hidden
           from madrasahs`
      );
      const r = rows[0];
      return {
        all: r.total,
        active: r.active,
        passive: r.passive,
        hidden: r.hidden,
      };
    },
    hostingHeld: async (madrasahId) => {
      const { rows } = await client.query(
        "select 1 from madrasah_kosk_hosting where madrasah_id = $1 and kosk_id = $2 and revoked_at is null",
        [madrasahId, ids.kosk]
      );
      return rows.length > 0;
    },
    courseHidden: async (courseId) => {
      const { rows } = await client.query(
        "select archived_at from courses where id = $1",
        [courseId]
      );
      return rows[0]?.archived_at != null;
    },
    madrasahByHandle: async (handle) => {
      const { rows } = await client.query(
        "select id, archived_at from madrasahs where handle = $1",
        [handle]
      );
      const row = rows[0];
      if (row && !extraMadrasahIds.includes(row.id)) {
        extraMadrasahIds.push(row.id);
      }
      return row ? { id: row.id, archived: row.archived_at !== null } : null;
    },
    headsOf: async (madrasahId) => {
      const { rows } = await client.query(
        `select user_id from role_assignments
          where scope_id = $1 and role = 'MEDRESE_BASMUDERRIS' and revoked_at is null
          order by created_at`,
        [madrasahId]
      );
      return rows.map((r) => r.user_id);
    },
    lookupAudits: async () => {
      const { rows } = await client.query(
        "select count(*)::int as n from audit_log where action = 'user.lookup' and created_at >= $1",
        [startedAt]
      );
      return rows[0].n;
    },
    audits: async (action) => {
      const { rows } = await client.query(
        "select count(*)::int as n from audit_log where action = $1 and created_at >= $2",
        [action, startedAt]
      );
      return rows[0].n;
    },
    makeMedarisNazim: async (sub) => {
      medarisNazims.push(await holdMedarisNazim(sub));
    },
    remove: async () => {
      const madrasahIds = allMadrasahIds();
      const courseIds = [courses.published.id, courses.draft.id];
      try {
        for (const held of medarisNazims.reverse()) await held.release();
        await client.query("begin");
        await client.query(
          "delete from enrollments where course_id = any($1)",
          [courseIds]
        );
        await client.query(
          "delete from course_muderris where course_id = any($1)",
          [courseIds]
        );
        await client.query(
          "delete from role_assignments where scope_id = any($1)",
          [[...madrasahIds, ids.kosk, ids.otherKosk, ...courseIds]]
        );
        await client.query("delete from courses where id = any($1)", [
          courseIds,
        ]);
        await client.query("delete from madrasahs where id = any($1)", [
          madrasahIds,
        ]);
        await client.query("delete from kosks where id = any($1)", [
          [ids.kosk, ids.otherKosk],
        ]);
        await client.query("delete from users where id = any($1)", [
          Object.values(people),
        ]);
        await client.query(
          `delete from audit_log where created_at >= $1
             and (action like 'madrasah.%' or action like 'hosting_right.%' or action = 'user.lookup')`,
          [startedAt]
        );
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
