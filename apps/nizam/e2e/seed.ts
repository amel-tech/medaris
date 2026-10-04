import { randomUUID } from "node:crypto";
import pg from "pg";

/**
 * What the nizam specs put in tedrisat's database (MDRS-169), under random
 * ids, and take out again: a medrese and a köşk, a published course with
 * talebe and a draft one, and the roles that tie the signed-in müderris to
 * them. Direct SQL: there is no endpoint that does this for a test.
 */
export interface NizamFixture {
  madrasahName: string;
  koskName: string;
  published: { id: string; title: string };
  draft: { id: string; title: string };
  enrolled: number;
  /**
   * The seats the müderris already holds outside this fixture (the shared test
   * seed gives the account one): each is one more row on the page.
   */
  standing: number;
  remove: () => Promise<void>;
}

export async function seedMuderris(subs: {
  granter: string;
  muderris: string;
}): Promise<NizamFixture> {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) throw new Error("E2E_DATABASE_URL is not set.");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const tail = randomUUID().slice(0, 8);
  const madrasahId = randomUUID();
  const koskId = randomUUID();
  const madrasahName = `E2E Süleymaniye ${tail}`;
  const koskName = `E2E Nûruosmaniye ${tail}`;
  const published = { id: randomUUID(), title: `Bina ve İzhar Şerhi ${tail}` };
  const draft = { id: randomUUID(), title: `Maksûd şerhi ${tail}` };
  const students = [randomUUID(), randomUUID(), randomUUID()];
  try {
    await client.query("begin");
    await client.query(
      "insert into kosks(id, owner_id, name) values ($1, $2, $3)",
      [koskId, subs.granter, koskName]
    );
    await client.query(
      "insert into madrasahs(id, handle, name, created_by) values ($1, $2, $3, $4)",
      [madrasahId, `e2e-${tail}`, madrasahName, subs.granter]
    );
    for (const [c, status] of [
      [published, "PUBLISHED"],
      [draft, "DRAFT"],
    ] as const) {
      await client.query(
        "insert into courses(id, kosk_id, madrasah_id, author_id, title, status) values ($1, $2, $3, $4, $5, $6)",
        [c.id, koskId, madrasahId, subs.granter, c.title, status]
      );
      await client.query(
        "insert into role_assignments(user_id, role, scope_type, scope_id, granted_by, is_imam) values ($1, 'MUDERRIS', 'course', $2, $3, true)",
        [subs.muderris, c.id, subs.granter]
      );
    }
    for (const student of students) {
      await client.query(
        "insert into enrollments(user_id, course_id, status) values ($1, $2, 'ENROLLED')",
        [student, published.id]
      );
    }
    await client.query(
      "insert into role_assignments(user_id, role, scope_type, scope_id, granted_by) values ($1, 'MEDRESE_BASMUDERRIS', 'madrasah', $2, $3)",
      [subs.muderris, madrasahId, subs.granter]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    await client.end();
    throw error;
  }
  const {
    rows: [held],
  } = await client.query(
    `select count(*)::int as n from role_assignments
      where user_id = $1 and revoked_at is null
        and (expires_at is null or expires_at > now())
        and role in ('MUDERRIS', 'MEDRESE_BASMUDERRIS', 'MEDRESE_NAZIR', 'DERS_NAZIR')
        and scope_id <> all($2)`,
    [subs.muderris, [published.id, draft.id, madrasahId]]
  );
  return {
    madrasahName,
    koskName,
    published,
    draft,
    enrolled: students.length,
    standing: held.n,
    remove: async () => {
      const courseIds = [published.id, draft.id];
      try {
        await client.query("begin");
        await client.query(
          "delete from role_assignments where scope_id = any($1)",
          [[madrasahId, ...courseIds]]
        );
        await client.query(
          "delete from enrollments where course_id = any($1)",
          [courseIds]
        );
        await client.query("delete from courses where id = any($1)", [
          courseIds,
        ]);
        await client.query("delete from madrasahs where id = $1", [madrasahId]);
        await client.query("delete from kosks where id = $1", [koskId]);
        await client.query("commit");
      } finally {
        await client.end();
      }
    },
  };
}
