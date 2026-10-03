import { randomUUID } from "node:crypto";
import pg from "pg";

/**
 * What the ban specs put in tedrisat's database (MDRS-177), under random ids,
 * and take out again: a köşk the signed-in nazım manages with one course the
 * müderris teaches, three enrolled talebe, and two open bans placed straight
 * in SQL — one by the müderris (a nazım may lift it) and one by a Medaris
 * nazımı (only Medaris administration may).
 */
export interface BanFixture {
  koskId: string;
  koskName: string;
  course: { id: string; title: string };
  /** enrolled, not barred: the one the spec bars through the window */
  talebe: { id: string; name: string; email: string };
  /** barred by the müderris */
  byMuderris: { id: string; name: string; banId: string; reason: string };
  /** barred by a Medaris nazımı */
  byPlatform: { id: string; name: string; banId: string };
  ban: (id: string) => Promise<{
    lifted: boolean;
    liftedBy: string | null;
    liftReason: string | null;
    scope: string;
    reason: string;
    bannedBy: string;
  } | null>;
  /** every ban in the köşk, newest first */
  koskBans: () => Promise<
    {
      id: string;
      userId: string;
      scope: string;
      reason: string;
      lifted: boolean;
      extendedFromCourseId: string | null;
      bannedRole: string;
    }[]
  >;
  /** `count` more open course bans by the müderris, for the paging spec */
  addBans: (count: number) => Promise<void>;
  /** the audit actions written for the köşk's bans, oldest first */
  auditActions: () => Promise<string[]>;
  remove: () => Promise<void>;
}

export async function seedBans(subs: {
  nazim: string;
  muderris: string;
}): Promise<BanFixture> {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) throw new Error("E2E_DATABASE_URL is not set.");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const tail = randomUUID().slice(0, 8);
  const koskId = randomUUID();
  const koskName = `E2E Yasak Köşkü ${tail}`;
  const course = { id: randomUUID(), title: `Emsile ve Bina ${tail}` };
  const make = (given: string) => ({
    id: randomUUID(),
    name: `${given} Demirkaya`,
  });
  const talebe = {
    ...make("Abdullah"),
    email: `abdullah.${tail}@example.test`,
  };
  const byMuderris = {
    ...make("Ömer"),
    banId: randomUUID(),
    reason: `Celselerde kırıcı mesajlar yazdı ${tail}.`,
  };
  const byPlatform = { ...make("Kâmil"), banId: randomUUID() };
  try {
    await client.query("begin");
    for (const [id, name] of [
      [talebe.id, talebe.name],
      [byMuderris.id, byMuderris.name],
      [byPlatform.id, byPlatform.name],
    ] as const) {
      const [given, ...family] = name.split(" ");
      await client.query(
        "insert into users(id, given_name, family_name, email) values ($1, $2, $3, $4) on conflict (id) do nothing",
        [id, given, family.join(" "), `${id.slice(0, 8)}.${tail}@example.test`]
      );
    }
    // The talebe's address is the one the window shows.
    await client.query("update users set email = $2 where id = $1", [
      talebe.id,
      talebe.email,
    ]);
    await client.query(
      "insert into kosks(id, owner_id, name) values ($1, $2, $3)",
      [koskId, subs.nazim, koskName]
    );
    await client.query(
      "insert into role_assignments(user_id, role, scope_type, scope_id, granted_by) values ($1, 'KOSK_NAZIM', 'kosk', $2, $1)",
      [subs.nazim, koskId]
    );
    await client.query(
      "insert into courses(id, kosk_id, author_id, title, status) values ($1, $2, $3, $4, 'PUBLISHED')",
      [course.id, koskId, subs.nazim, course.title]
    );
    await client.query(
      "insert into role_assignments(user_id, role, scope_type, scope_id, granted_by, is_imam) values ($1, 'MUDERRIS', 'course', $2, $3, true)",
      [subs.muderris, course.id, subs.nazim]
    );
    for (const [id, name, email] of [
      [talebe.id, talebe.name, talebe.email],
      [
        byMuderris.id,
        byMuderris.name,
        `${byMuderris.id.slice(0, 8)}.${tail}@example.test`,
      ],
      [
        byPlatform.id,
        byPlatform.name,
        `${byPlatform.id.slice(0, 8)}.${tail}@example.test`,
      ],
    ] as const) {
      await client.query(
        "insert into enrollments(user_id, course_id, status, student_name, student_email) values ($1, $2, 'ENROLLED', $3, $4)",
        [id, course.id, name, email]
      );
    }
    await client.query(
      "insert into bans(id, user_id, kosk_id, course_id, scope, reason, banned_by, banned_role, banned_tier, created_at) values ($1, $2, $3, $4, 'COURSE', $5, $6, 'MUDERRIS', 1, now() - interval '2 hours')",
      [
        byMuderris.banId,
        byMuderris.id,
        koskId,
        course.id,
        byMuderris.reason,
        subs.muderris,
      ]
    );
    await client.query(
      "insert into bans(id, user_id, kosk_id, course_id, scope, reason, banned_by, banned_role, banned_tier, created_at) values ($1, $2, $3, $4, 'COURSE', 'Ders kayıtlarını izinsiz yaydı.', $5, 'MEDARIS_NAZIM', 4, now() - interval '30 hours')",
      [byPlatform.banId, byPlatform.id, koskId, course.id, randomUUID()]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    await client.end();
    throw error;
  }
  const people = [talebe.id, byMuderris.id, byPlatform.id];
  return {
    koskId,
    koskName,
    course,
    talebe,
    byMuderris,
    byPlatform,
    ban: async (id) => {
      const { rows } = await client.query(
        "select lifted_at is not null as lifted, lifted_by, lift_reason, scope, reason, banned_by from bans where id = $1",
        [id]
      );
      const row = rows[0];
      return row
        ? {
            lifted: row.lifted,
            liftedBy: row.lifted_by,
            liftReason: row.lift_reason,
            scope: row.scope,
            reason: row.reason,
            bannedBy: row.banned_by,
          }
        : null;
    },
    koskBans: async () => {
      const { rows } = await client.query(
        "select id, user_id, scope, reason, lifted_at is not null as lifted, extended_from_course_id, banned_role from bans where kosk_id = $1 order by created_at desc",
        [koskId]
      );
      return rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        scope: r.scope,
        reason: r.reason,
        lifted: r.lifted,
        extendedFromCourseId: r.extended_from_course_id,
        bannedRole: r.banned_role,
      }));
    },
    addBans: async (count) => {
      for (let i = 0; i < count; i += 1) {
        const id = randomUUID();
        people.push(id);
        await client.query(
          "insert into users(id, given_name, family_name, email) values ($1, $2, 'Sayfalı', $3)",
          [
            id,
            `Kişi${String(i).padStart(2, "0")}`,
            `${id.slice(0, 8)}.${tail}@example.test`,
          ]
        );
        await client.query(
          "insert into bans(user_id, kosk_id, course_id, scope, reason, banned_by, banned_role, banned_tier, created_at) values ($1, $2, $3, 'COURSE', $4, $5, 'MUDERRIS', 1, now() - ($6 || ' minutes')::interval)",
          [
            id,
            koskId,
            course.id,
            `Sayfa denemesi ${i}`,
            subs.muderris,
            String(i + 1),
          ]
        );
      }
    },
    auditActions: async () => {
      const { rows } = await client.query(
        "select action from audit_log where entity = 'ban' and details->>'koskId' = $1 order by created_at",
        [koskId]
      );
      return rows.map((r) => r.action);
    },
    remove: async () => {
      try {
        await client.query("begin");
        await client.query("delete from bans where kosk_id = $1", [koskId]);
        await client.query(
          "delete from role_assignments where scope_id = any($1)",
          [[koskId, course.id]]
        );
        await client.query("delete from enrollments where course_id = $1", [
          course.id,
        ]);
        await client.query("delete from courses where id = $1", [course.id]);
        await client.query("delete from kosks where id = $1", [koskId]);
        await client.query(
          "delete from audit_log where entity = 'ban' and details->>'koskId' = $1",
          [koskId]
        );
        await client.query("delete from users where id = any($1)", [people]);
        await client.query("commit");
      } finally {
        await client.end();
      }
    },
  };
}
