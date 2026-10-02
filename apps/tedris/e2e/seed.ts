import { randomUUID } from "node:crypto";
import pg from "pg";

/**
 * What a spec puts in tedrisat's database, under random ids, and takes out
 * again. Direct SQL on purpose: there is no endpoint that creates a medrese
 * for a test, and a SYSTEM_ADMIN token would need a Keycloak login.
 */
export interface MadrasahFixture {
  madrasahId: string;
  headMuderrisName: string;
  kosks: { id: string; name: string }[];
  courses: { id: string; title: string; koskName: string }[];
  /** A köşk in no list, with a course of the medrese in it. */
  unlistedCourseTitle: string;
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

/**
 * Gives one signed-in talebe an ENROLLED place in the first course and a
 * PENDING one in the second, so the page's two badges can be read in a
 * browser. Returns what to remove. `userId` is the Keycloak `sub`.
 */
export async function seedEnrollments(
  fixture: MadrasahFixture,
  userId: string
): Promise<() => Promise<void>> {
  const client = new pg.Client({ connectionString: databaseUrl() });
  await client.connect();
  const [enrolled, pending] = fixture.courses;
  try {
    await client.query(
      "insert into enrollments(user_id, course_id, status) values ($1, $2, 'ENROLLED'), ($1, $3, 'PENDING')",
      [userId, enrolled.id, pending.id]
    );
  } catch (error) {
    await client.end();
    throw error;
  }
  return async () => {
    try {
      await client.query(
        "delete from enrollments where user_id = $1 and course_id = any($2)",
        [userId, [enrolled.id, pending.id]]
      );
    } finally {
      await client.end();
    }
  };
}

export async function seedMadrasah(): Promise<MadrasahFixture> {
  const client = new pg.Client({ connectionString: databaseUrl() });
  await client.connect();
  const id = () => randomUUID();
  const admin = id();
  const head = id();
  const madrasahId = id();
  const koskA = { id: id(), name: "Nûruosmaniye Köşkü" };
  const koskB = { id: id(), name: "Fatih Köşkü" };
  const koskUnlisted = id();
  const courseA = {
    id: id(),
    title: "Bina ve İzhar Şerhi",
    koskName: koskA.name,
  };
  const courseB = {
    id: id(),
    title: "İsâgûcî ile mantığa giriş",
    koskName: koskB.name,
  };
  const hidden = { id: id(), title: "Gizli köşkteki ders" };
  const weeks = [id(), id()];
  const tail = madrasahId.slice(0, 8);

  try {
    await client.query("begin");
    await client.query(
      "insert into users(id, given_name, family_name) values ($1, 'Mehmet Emin', 'Işıkoğlu')",
      [head]
    );
    await client.query(
      "insert into madrasahs(id, handle, name, description, created_by) values ($1, $2, 'Süleymaniye Medresesi', 'Klasik medrese müfredatını çevrim içi sürdürür.', $3)",
      [madrasahId, `e2e-${tail}`, admin]
    );
    for (const k of [koskA, koskB]) {
      await client.query(
        "insert into kosks(id, owner_id, name) values ($1, $2, $3)",
        [k.id, admin, k.name]
      );
    }
    await client.query(
      "insert into kosks(id, owner_id, name, is_private) values ($1, $2, 'Gizli Köşk', true)",
      [koskUnlisted, admin]
    );
    const insertCourse = (
      cid: string,
      kid: string,
      title: string,
      cat: string
    ) =>
      client.query(
        "insert into courses(id, kosk_id, madrasah_id, author_id, title, category, status) values ($1, $2, $3, $4, $5, $6, 'PUBLISHED')",
        [cid, kid, madrasahId, admin, title, cat]
      );
    await insertCourse(courseA.id, koskA.id, courseA.title, "الصرف");
    await insertCourse(courseB.id, koskB.id, courseB.title, "المنطق");
    await insertCourse(hidden.id, koskUnlisted, hidden.title, "x");
    for (const [i, c] of [courseA, courseB].entries()) {
      await client.query(
        "insert into course_weeks(id, course_id, week_number, title) values ($1, $2, 1, 'Giriş')",
        [weeks[i], c.id]
      );
      await client.query(
        "insert into lessons(week_id, title, type, scheduled_at, meeting_url) values ($1, 'Celse 1', 'LIVE', now() + interval '3 days', 'https://meet.example/e2e-secret')",
        [weeks[i]]
      );
      await client.query(
        "insert into course_muderris(course_id, user_id, name) values ($1, $2, 'Mehmet Emin Işıkoğlu')",
        [c.id, head]
      );
      await client.query(
        "insert into role_assignments(user_id, role, scope_type, scope_id, is_imam, granted_by) values ($1, 'MUDERRIS', 'course', $2, true, $3)",
        [head, c.id, admin]
      );
    }
    await client.query(
      "insert into role_assignments(user_id, role, scope_type, scope_id, granted_by) values ($1, 'MEDRESE_BASMUDERRIS', 'madrasah', $2, $3)",
      [head, madrasahId, admin]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    await client.end();
    throw error;
  }

  const courseIds = [courseA.id, courseB.id, hidden.id];
  return {
    madrasahId,
    headMuderrisName: "Mehmet Emin Işıkoğlu",
    kosks: [koskA, koskB],
    courses: [courseA, courseB],
    unlistedCourseTitle: hidden.title,
    remove: async () => {
      try {
        await client.query("begin");
        await client.query(
          "delete from role_assignments where scope_id = any($1)",
          [[madrasahId, ...courseIds]]
        );
        await client.query("delete from lessons where week_id = any($1)", [
          weeks,
        ]);
        await client.query("delete from course_weeks where id = any($1)", [
          weeks,
        ]);
        await client.query(
          "delete from course_muderris where course_id = any($1)",
          [courseIds]
        );
        await client.query("delete from courses where id = any($1)", [
          courseIds,
        ]);
        await client.query("delete from kosks where id = any($1)", [
          [koskA.id, koskB.id, koskUnlisted],
        ]);
        await client.query("delete from madrasahs where id = $1", [madrasahId]);
        await client.query("delete from users where id = $1", [head]);
        await client.query("commit");
      } finally {
        await client.end();
      }
    },
  };
}
