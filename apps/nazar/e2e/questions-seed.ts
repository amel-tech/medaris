import { randomUUID } from "node:crypto";
import pg from "pg";

/**
 * What the Sorular spec (MDRS-150) puts in tedrisat's database, under random
 * ids, and takes out again: a published course with its müderris and ders
 * nazırı seated, a talebe enrolled, and two of the talebe's questions on its
 * sessions, one waiting and one the müderris has answered. Direct SQL: a
 * question is asked in tedris, which this app cannot sign in to.
 */
export interface QuestionsFixture {
  courseId: string;
  courseTitle: string;
  waiting: { id: string; body: string; session: string };
  answered: { id: string; body: string; answer: string; session: string };
  /** Gives the ders nazırı `question.answer` in the course; returns what takes it back. */
  grantAnswer: () => Promise<() => Promise<void>>;
  /** Takes the müderris off with nobody seated after them, so the course is passive (MDRS-136); returns what seats them again. */
  makePassive: () => Promise<() => Promise<void>>;
  questionOf: (
    id: string
  ) => Promise<{ answer: string | null; answered_by: string | null }>;
  /** Takes the answer off the waiting question again. */
  reopen: () => Promise<void>;
  remove: () => Promise<void>;
}

export async function seedQuestions(roles: {
  muderris: string;
  dersNazir: string;
  talebe: string;
}): Promise<QuestionsFixture> {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) throw new Error("E2E_DATABASE_URL is not set.");
  const client = new pg.Client({ connectionString: url });
  await client.connect();

  const tail = randomUUID().slice(0, 8);
  const owner = randomUUID();
  const koskId = randomUUID();
  const courseId = randomUUID();
  const weekId = randomUUID();
  const lessons = { first: randomUUID(), second: randomUUID() };
  const courseTitle = `E2E Bina sorular ${tail}`;
  const waiting = {
    id: randomUUID(),
    body: "Fe‘ale bâbında mâzînin aynü’l-fiili neden fethalıdır?",
    session: "Mâzî fiilin çekimi",
  };
  const answered = {
    id: randomUUID(),
    body: "Muzâride hurûf-i mudâraa kaç tanedir?",
    answer: "Dört tanedir: eyn harfleri.",
    session: "Muzâri fiilin çekimi",
  };

  try {
    await client.query("begin");
    await client.query(
      "insert into kosks(id, owner_id, name) values ($1, $2, $3)",
      [koskId, owner, `E2E Nûruosmaniye ${tail}`]
    );
    await client.query(
      "insert into courses(id, kosk_id, author_id, title, status) values ($1, $2, $3, $4, 'PUBLISHED')",
      [courseId, koskId, owner, courseTitle]
    );
    await client.query(
      "insert into course_weeks(id, course_id, week_number, title) values ($1, $2, 1, 'Mâzî ve muzâri')",
      [weekId, courseId]
    );
    await client.query(
      `insert into lessons(id, week_id, title, type, order_index, scheduled_at) values
       ($1, $3, $4, 'LIVE', 0, now() - interval '6 days'),
       ($2, $3, $5, 'LIVE', 1, now() - interval '3 days')`,
      [lessons.first, lessons.second, weekId, waiting.session, answered.session]
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
    await client.query(
      `insert into lesson_questions(id, lesson_id, author_id, body, created_at) values ($1, $2, $3, $4, now() - interval '2 days')`,
      [waiting.id, lessons.first, roles.talebe, waiting.body]
    );
    await client.query(
      `insert into lesson_questions(id, lesson_id, author_id, body, answer, answered_by, answered_at, created_at)
       values ($1, $2, $3, $4, $5, $6, now() - interval '1 day', now() - interval '3 days')`,
      [
        answered.id,
        lessons.second,
        roles.talebe,
        answered.body,
        answered.answer,
        roles.muderris,
      ]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    await client.end();
    throw error;
  }

  return {
    courseId,
    courseTitle,
    waiting,
    answered,
    grantAnswer: async () => {
      const {
        rows: [grant],
      } = await client.query(
        "insert into permission_grants(user_id, scope_type, scope_id, permission, granted_by, authority_scope_type) values ($1, 'course', $2, 'question.answer', $3, 'course') returning id",
        [roles.dersNazir, courseId, roles.muderris]
      );
      return async () => {
        await client.query("delete from permission_grants where id = $1", [
          grant.id,
        ]);
      };
    },
    makePassive: async () => {
      await client.query(
        "update role_assignments set revoked_at = now(), revoked_by = $3 where user_id = $1 and scope_id = $2 and role = 'MUDERRIS'",
        [roles.muderris, courseId, owner]
      );
      return async () => {
        await client.query(
          "update role_assignments set revoked_at = null, revoked_by = null where user_id = $1 and scope_id = $2 and role = 'MUDERRIS'",
          [roles.muderris, courseId]
        );
      };
    },
    questionOf: async (id) =>
      (
        await client.query(
          "select answer, answered_by from lesson_questions where id = $1",
          [id]
        )
      ).rows[0],
    reopen: async () => {
      await client.query(
        "update lesson_questions set answer = null, answered_by = null, answered_at = null where id = $1",
        [waiting.id]
      );
    },
    remove: async () => {
      try {
        await client.query("begin");
        await client.query(
          "delete from lesson_questions where lesson_id = any($1)",
          [Object.values(lessons)]
        );
        await client.query(
          "delete from permission_grants where scope_id = $1",
          [courseId]
        );
        await client.query("delete from role_assignments where scope_id = $1", [
          courseId,
        ]);
        await client.query("delete from enrollments where course_id = $1", [
          courseId,
        ]);
        await client.query("delete from lessons where week_id = $1", [weekId]);
        await client.query("delete from course_weeks where id = $1", [weekId]);
        await client.query("delete from courses where id = $1", [courseId]);
        await client.query("delete from kosks where id = $1", [koskId]);
        await client.query("commit");
      } finally {
        await client.end();
      }
    },
  };
}
