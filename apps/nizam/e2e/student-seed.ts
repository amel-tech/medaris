import { randomUUID } from "node:crypto";
import pg from "pg";

/**
 * What the Talebeler spec puts in tedrisat's database (MDRS-178, nizam/58),
 * under random ids, and takes out again: a köşk the signed-in nazım manages
 * with one course, eight enrolled talebe (progress 10 to 80) and one who has
 * completed it.
 */
export interface StudentFixture {
  koskId: string;
  koskName: string;
  course: { id: string; title: string };
  /** enrolled, in the order of their names; `progress` is what the table must show */
  enrolled: {
    id: string;
    name: string;
    email: string;
    progress: number;
  }[];
  completed: { id: string; name: string };
  enrollment: (
    userId: string
  ) => Promise<{ status: string; progress: number } | null>;
  /** the audit rows of `enrollment.remove` for this course */
  removals: () => Promise<{ userId: string; reason: string; actor: string }[]>;
  remove: () => Promise<void>;
}

export async function seedStudents(subs: {
  nazim: string;
  muderris: string;
}): Promise<StudentFixture> {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) throw new Error("E2E_DATABASE_URL is not set.");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const tail = randomUUID().slice(0, 8);
  const koskId = randomUUID();
  const koskName = `E2E Talebe Köşkü ${tail}`;
  const course = { id: randomUUID(), title: `Emsile ve Bina ${tail}` };
  const names = [
    "Abdullah",
    "Bilal",
    "Cemal",
    "Davud",
    "Enes",
    "Furkan",
    "Gülsüm",
    "Hamza",
  ];
  const enrolled = names.map((given, i) => ({
    id: randomUUID(),
    name: `${given} Yurtsever`,
    email: `${given.toLowerCase()}.${tail}@example.test`,
    progress: (i + 1) * 10,
  }));
  const completed = { id: randomUUID(), name: `Zeynep Yurtsever` };
  try {
    await client.query("begin");
    for (const p of [
      ...enrolled,
      {
        id: completed.id,
        name: completed.name,
        email: `zeynep.${tail}@example.test`,
      },
    ]) {
      const [given, ...family] = p.name.split(" ");
      await client.query(
        "insert into users(id, given_name, family_name, email) values ($1, $2, $3, $4) on conflict (id) do nothing",
        [p.id, given, family.join(" "), p.email]
      );
    }
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
    for (const p of enrolled) {
      await client.query(
        "insert into enrollments(user_id, course_id, status, progress, student_name, student_email) values ($1, $2, 'ENROLLED', $3, $4, $5)",
        [p.id, course.id, p.progress, p.name, p.email]
      );
    }
    await client.query(
      "insert into enrollments(user_id, course_id, status, progress, student_name, student_email) values ($1, $2, 'COMPLETED', 100, $3, $4)",
      [completed.id, course.id, completed.name, `zeynep.${tail}@example.test`]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    await client.end();
    throw error;
  }
  const people = [...enrolled.map((p) => p.id), completed.id];
  return {
    koskId,
    koskName,
    course,
    enrolled,
    completed,
    enrollment: async (userId) => {
      const { rows } = await client.query(
        "select status, progress from enrollments where user_id = $1 and course_id = $2",
        [userId, course.id]
      );
      return rows[0] ?? null;
    },
    removals: async () => {
      const { rows } = await client.query(
        "select details->>'userId' as user_id, details->>'reason' as reason, actor_id from audit_log where action = 'enrollment.remove' and entity_id = $1 order by created_at",
        [course.id]
      );
      return rows.map((r) => ({
        userId: r.user_id,
        reason: r.reason,
        actor: r.actor_id,
      }));
    },
    remove: async () => {
      try {
        await client.query("begin");
        await client.query(
          "delete from role_assignments where scope_id = any($1)",
          [[koskId, course.id]]
        );
        await client.query("delete from enrollments where course_id = $1", [
          course.id,
        ]);
        await client.query("delete from courses where id = $1", [course.id]);
        await client.query("delete from kosks where id = $1", [koskId]);
        await client.query("delete from audit_log where entity_id = $1", [
          course.id,
        ]);
        await client.query("delete from users where id = any($1)", [people]);
        await client.query("commit");
      } finally {
        await client.end();
      }
    },
  };
}
