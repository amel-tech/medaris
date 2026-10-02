import { randomUUID } from "node:crypto";
import pg from "pg";

/**
 * What the nazır specs put in tedrisat's database (MDRS-183), under random
 * ids, and take out again: a medrese with two published courses, applications
 * waiting on both, a session with no meeting link, and the roles that tie the
 * signed-in accounts to them. Direct SQL: there is no endpoint that does this
 * for a test.
 *
 * Two applications wait on the first course and one on the second, so the
 * medrese's Dersler badge is 2 (courses holding an application), and the first
 * course's menu reads Celseler 1 (bağlantısı eksik) and Talebeler 2
 * (bekleyen başvuru).
 */
export interface NazirFixture {
  madrasah: { id: string; name: string };
  /** the köşk both courses are in */
  koskId: string;
  first: { id: string; title: string; koskName: string };
  second: { id: string; title: string };
  /** the numbers the menu badges should show */
  expected: {
    coursesWithApplications: number;
    firstApplications: number;
    firstMissingLinks: number;
  };
  remove: () => Promise<void>;
}

export interface NazirRoles {
  /** MEDRESE_BASMUDERRIS of the medrese, MUDERRIS (imam) of both courses */
  basmuderris: string;
  /** MEDRESE_NAZIR of the medrese */
  medreseNazir?: string;
  /** DERS_NAZIR of the first course */
  dersNazir?: string;
}

export async function seedPortal(roles: NazirRoles): Promise<NazirFixture> {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) throw new Error("E2E_DATABASE_URL is not set.");
  const client = new pg.Client({ connectionString: url });
  await client.connect();

  const tail = randomUUID().slice(0, 8);
  const madrasah = {
    id: randomUUID(),
    name: `E2E Süleymaniye ${tail}`,
  };
  const koskId = randomUUID();
  const koskName = `E2E Nûruosmaniye ${tail}`;
  const first = {
    id: randomUUID(),
    title: `E2E Bina ve İzhar Şerhi ${tail}`,
    koskName,
  };
  const second = {
    id: randomUUID(),
    title: `E2E İsâgûcî ile mantığa giriş ${tail}`,
  };
  const weekIds = [randomUUID(), randomUUID()];
  const applicants = [randomUUID(), randomUUID(), randomUUID()];
  const granter = roles.basmuderris;
  const inAWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  try {
    await client.query("begin");
    await client.query(
      "insert into kosks(id, owner_id, name) values ($1, $2, $3)",
      [koskId, granter, koskName]
    );
    await client.query(
      "insert into madrasahs(id, handle, name, created_by) values ($1, $2, $3, $4)",
      [madrasah.id, `e2e-${tail}`, madrasah.name, granter]
    );
    for (const course of [first, second]) {
      await client.query(
        "insert into courses(id, kosk_id, madrasah_id, author_id, title, status) values ($1, $2, $3, $4, $5, 'PUBLISHED')",
        [course.id, koskId, madrasah.id, granter, course.title]
      );
      await client.query(
        "insert into role_assignments(user_id, role, scope_type, scope_id, granted_by, is_imam) values ($1, 'MUDERRIS', 'course', $2, $3, true)",
        [roles.basmuderris, course.id, granter]
      );
    }
    await client.query(
      "insert into role_assignments(user_id, role, scope_type, scope_id, granted_by) values ($1, 'MEDRESE_BASMUDERRIS', 'madrasah', $2, $3)",
      [roles.basmuderris, madrasah.id, granter]
    );
    if (roles.medreseNazir) {
      await client.query(
        "insert into role_assignments(user_id, role, scope_type, scope_id, granted_by) values ($1, 'MEDRESE_NAZIR', 'madrasah', $2, $3)",
        [roles.medreseNazir, madrasah.id, granter]
      );
    }
    if (roles.dersNazir) {
      await client.query(
        "insert into role_assignments(user_id, role, scope_type, scope_id, granted_by) values ($1, 'DERS_NAZIR', 'course', $2, $3)",
        [roles.dersNazir, first.id, granter]
      );
    }

    // Applications: two on the first course, one on the second.
    for (const [user, course] of [
      [applicants[0], first.id],
      [applicants[1], first.id],
      [applicants[2], second.id],
    ] as const) {
      await client.query(
        "insert into enrollments(user_id, course_id, status) values ($1, $2, 'PENDING')",
        [user, course]
      );
    }

    // Two sessions ahead on the first course, only one with a meeting link.
    await client.query(
      "insert into course_weeks(id, course_id, week_number, title) values ($1, $2, 1, 'Hafta 1')",
      [weekIds[0], first.id]
    );
    await client.query(
      "insert into lessons(week_id, title, type, scheduled_at, meeting_url) values ($1, 'Celse 1', 'LIVE', $2, null), ($1, 'Celse 2', 'LIVE', $3, 'https://meet.example.test/e2e')",
      [weekIds[0], inAWeek, new Date(inAWeek.getTime() + 60 * 60 * 1000)]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    await client.end();
    throw error;
  }

  return {
    madrasah,
    koskId,
    first,
    second,
    expected: {
      coursesWithApplications: 2,
      firstApplications: 2,
      firstMissingLinks: 1,
    },
    remove: async () => {
      const courseIds = [first.id, second.id];
      try {
        await client.query("begin");
        await client.query(
          "delete from role_assignments where scope_id = any($1)",
          [[madrasah.id, ...courseIds]]
        );
        await client.query(
          "delete from enrollments where course_id = any($1)",
          [courseIds]
        );
        await client.query("delete from lessons where week_id = any($1)", [
          weekIds,
        ]);
        await client.query("delete from course_weeks where id = any($1)", [
          weekIds,
        ]);
        await client.query("delete from courses where id = any($1)", [
          courseIds,
        ]);
        await client.query("delete from madrasahs where id = $1", [
          madrasah.id,
        ]);
        await client.query("delete from kosks where id = $1", [koskId]);
        await client.query("commit");
      } finally {
        await client.end();
      }
    },
  };
}
