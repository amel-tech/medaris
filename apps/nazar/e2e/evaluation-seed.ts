import { randomUUID } from "node:crypto";
import pg from "pg";

/**
 * What the Değerlendirme spec (MDRS-248) puts in tedrisat's database, under
 * random ids, and takes out again: a published course with its müderris and a
 * ders nazırı seated, a talebe enrolled, a celse whose homework is recited to
 * the müderris (`kind` MEMORIZE) and one handed in as files, and a second
 * course of the same köşk the müderris does not teach. Direct SQL, as the
 * other seeds.
 */
export interface EvaluationFixture {
  courseId: string;
  otherCourseId: string;
  courseTitle: string;
  recited: { lessonId: string; title: string };
  files: { lessonId: string; title: string };
  /** The talebe's mark on the recited homework, or null for none. */
  markOf: () => Promise<{ status: string; note: string | null } | null>;
  /** Takes every mark off again. */
  clear: () => Promise<void>;
  remove: () => Promise<void>;
}

export async function seedEvaluation(roles: {
  muderris: string;
  dersNazir: string;
  talebe: string;
}): Promise<EvaluationFixture> {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) throw new Error("E2E_DATABASE_URL is not set.");
  const client = new pg.Client({ connectionString: url });
  await client.connect();

  const tail = randomUUID().slice(0, 8);
  const owner = randomUUID();
  const koskId = randomUUID();
  const courseId = randomUUID();
  const otherCourseId = randomUUID();
  const weekId = randomUUID();
  const courseTitle = `E2E Emsile ezber ${tail}`;
  const recited = { lessonId: randomUUID(), title: "Emsile, birinci bab" };
  const files = { lessonId: randomUUID(), title: "Bina, birinci bab" };
  const homework = { recited: randomUUID(), files: randomUUID() };

  try {
    await client.query("begin");
    await client.query(
      "insert into kosks(id, owner_id, name) values ($1, $2, $3)",
      [koskId, owner, `E2E Nûruosmaniye ${tail}`]
    );
    await client.query(
      `insert into courses(id, kosk_id, author_id, title, status) values
       ($1, $3, $4, $5, 'PUBLISHED'), ($2, $3, $4, $6, 'PUBLISHED')`,
      [courseId, otherCourseId, koskId, owner, courseTitle, `${courseTitle} B`]
    );
    await client.query(
      "insert into course_weeks(id, course_id, week_number, title) values ($1, $2, 1, 'Emsile')",
      [weekId, courseId]
    );
    await client.query(
      `insert into lessons(id, week_id, title, type, order_index, scheduled_at) values
       ($1, $3, $4, 'LIVE', 0, now() - interval '3 days'),
       ($2, $3, $5, 'LIVE', 1, now() - interval '1 day')`,
      [recited.lessonId, files.lessonId, weekId, recited.title, files.title]
    );
    await client.query(
      `insert into lesson_assignments(id, lesson_id, description, kind) values
       ($1, $3, 'Birinci babı ezberleyin.', 'MEMORIZE'),
       ($2, $4, 'Çekimleri yazın.', 'FILE')`,
      [homework.recited, homework.files, recited.lessonId, files.lessonId]
    );
    await client.query(
      "insert into role_assignments(user_id, role, scope_type, scope_id, is_imam, granted_by) values ($1, 'MUDERRIS', 'course', $2, true, $3)",
      [roles.muderris, courseId, owner]
    );
    await client.query(
      "insert into role_assignments(user_id, role, scope_type, scope_id, granted_by) values ($1, 'DERS_NAZIR', 'course', $2, $3)",
      [roles.dersNazir, courseId, roles.muderris]
    );
    await client.query(
      "insert into enrollments(user_id, course_id, status) values ($1, $2, 'ENROLLED')",
      [roles.talebe, courseId]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    await client.end();
    throw error;
  }

  return {
    courseId,
    otherCourseId,
    courseTitle,
    recited,
    files,
    markOf: async () =>
      (
        await client.query(
          "select status, note from assignment_evaluations where assignment_id = $1 and user_id = $2",
          [homework.recited, roles.talebe]
        )
      ).rows[0] ?? null,
    clear: async () => {
      await client.query(
        "delete from assignment_evaluations where assignment_id = any($1)",
        [Object.values(homework)]
      );
    },
    remove: async () => {
      try {
        await client.query("begin");
        await client.query(
          "delete from assignment_evaluations where assignment_id = any($1)",
          [Object.values(homework)]
        );
        await client.query(
          "delete from lesson_assignments where id = any($1)",
          [Object.values(homework)]
        );
        await client.query(
          "delete from role_assignments where scope_id = any($1)",
          [[courseId, otherCourseId]]
        );
        await client.query(
          "delete from enrollments where course_id = any($1)",
          [[courseId, otherCourseId]]
        );
        await client.query("delete from lessons where week_id = $1", [weekId]);
        await client.query("delete from course_weeks where id = $1", [weekId]);
        await client.query("delete from courses where id = any($1)", [
          [courseId, otherCourseId],
        ]);
        await client.query("delete from kosks where id = $1", [koskId]);
        await client.query("commit");
      } finally {
        await client.end();
      }
    },
  };
}
