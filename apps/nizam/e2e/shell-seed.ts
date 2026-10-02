import { randomUUID } from "node:crypto";
import pg from "pg";

/**
 * What the shell and applications specs put in tedrisat's database
 * (MDRS-168), under random ids, and take out again: a köşk the signed-in
 * nazım manages with two courses that ask for approval and five waiting
 * applications (three on the first course, two on the second), and a second
 * köşk the nazım has nothing to do with. Direct SQL: there is no endpoint that
 * makes a talebe's application wait for a test.
 */
export interface ShellFixture {
  koskId: string;
  koskName: string;
  /** a köşk of someone else: its Başvurular is not this nazım's */
  otherKoskId: string;
  courses: { id: string; title: string }[];
  /** the waiting applications, newest first */
  applicants: {
    id: string;
    name: string;
    email: string;
    courseId: string;
    courseTitle: string;
  }[];
  status: (
    userId: string,
    courseId: string
  ) => Promise<"PENDING" | "ENROLLED" | "COMPLETED" | null>;
  remove: () => Promise<void>;
}

export async function seedShell(subs: {
  nazim: string;
}): Promise<ShellFixture> {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) throw new Error("E2E_DATABASE_URL is not set.");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const tail = randomUUID().slice(0, 8);
  const koskId = randomUUID();
  const otherKoskId = randomUUID();
  const koskName = `E2E Başvuru Köşkü ${tail}`;
  const courses = [
    { id: randomUUID(), title: `Bina ve İzhar Şerhi ${tail}` },
    { id: randomUUID(), title: `Avâmil ve Tasrîf ${tail}` },
  ];
  const [first, second] = courses as [
    { id: string; title: string },
    { id: string; title: string },
  ];
  const given = [
    ["Rümeysa Nur", "Karaca", first, "10 minutes"],
    ["Muhammed Said", "Özdemiroğlu", second, "5 hours"],
    ["Sümeyye Nur", "Ekincioğlu", first, "20 hours"],
    ["Ömer Faruk", "Demirkaya", first, "26 hours"],
    ["Hatice Kübra", "Yıldırımoğlu", second, "74 hours"],
  ] as const;
  const applicants = given.map(([g, f, course]) => {
    const id = randomUUID();
    return {
      id,
      name: `${g} ${f}`,
      email: `${id.slice(0, 8)}.${tail}@example.test`,
      courseId: course.id,
      courseTitle: course.title,
    };
  });
  try {
    await client.query("begin");
    await client.query(
      "insert into kosks(id, owner_id, name) values ($1, $2, $3), ($4, $5, $6)",
      [
        koskId,
        subs.nazim,
        koskName,
        otherKoskId,
        randomUUID(),
        `E2E Başka Köşk ${tail}`,
      ]
    );
    await client.query(
      "insert into role_assignments(user_id, role, scope_type, scope_id, granted_by) values ($1, 'KOSK_NAZIM', 'kosk', $2, $1)",
      [subs.nazim, koskId]
    );
    for (const c of courses) {
      await client.query(
        "insert into courses(id, kosk_id, author_id, title, status, requires_approval) values ($1, $2, $3, $4, 'PUBLISHED', true)",
        [c.id, koskId, subs.nazim, c.title]
      );
    }
    for (const [i, a] of applicants.entries()) {
      const [g, f, , ago] = given[i] as (typeof given)[number];
      await client.query(
        "insert into users(id, given_name, family_name, email) values ($1, $2, $3, $4) on conflict (id) do nothing",
        [a.id, g, f, a.email]
      );
      await client.query(
        `insert into enrollments(user_id, course_id, status, student_name, student_email, created_at)
         values ($1, $2, 'PENDING', $3, $4, now() - $5::interval)`,
        [a.id, a.courseId, a.name, a.email, ago]
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    await client.end();
    throw error;
  }
  return {
    koskId,
    koskName,
    otherKoskId,
    courses,
    applicants,
    status: async (userId, courseId) => {
      const { rows } = await client.query(
        "select status from enrollments where user_id = $1 and course_id = $2",
        [userId, courseId]
      );
      return rows[0]?.status ?? null;
    },
    remove: async () => {
      const courseIds = courses.map((c) => c.id);
      try {
        await client.query("begin");
        await client.query(
          "delete from enrollments where course_id = any($1)",
          [courseIds]
        );
        await client.query(
          "delete from role_assignments where scope_id = any($1)",
          [[koskId, ...courseIds]]
        );
        await client.query("delete from courses where id = any($1)", [
          courseIds,
        ]);
        await client.query("delete from users where id = any($1)", [
          applicants.map((a) => a.id),
        ]);
        await client.query("delete from kosks where id = any($1)", [
          [koskId, otherKoskId],
        ]);
        await client.query("commit");
      } finally {
        await client.end();
      }
    },
  };
}
