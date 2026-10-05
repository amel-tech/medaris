import { randomUUID } from "node:crypto";
import pg from "pg";

/**
 * What the account-page spec puts in tedrisat's database (MDRS-169): one köşk
 * with three courses, and role_assignments that tie the signed-in test
 * accounts to them. Random ids, direct SQL, removed again afterwards. The
 * accounts are real Keycloak users; only their Keycloak ids (`sub`) are needed
 * here, from E2E_<ROLE>_SUB.
 */
export interface AssignmentFixture {
  koskId: string;
  koskName: string;
  madrasahName: string;
  published: { id: string; title: string };
  draft: { id: string; title: string };
  hidden: { id: string; title: string };
  enrolledCount: number;
  /**
   * The köşk and course seats each account already holds outside this fixture
   * (the shared test seed gives them some): each is one more row on their
   * account page.
   */
  standing: { muderris: number; koskNazim: number };
  remove: () => Promise<void>;
}

export interface FixtureSubs {
  /** the Medaris nazım, who granted the köşk nazım role */
  granter: string;
  koskNazim: string;
  muderris: string;
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

export async function seedAssignments(
  subs: FixtureSubs
): Promise<AssignmentFixture> {
  const client = new pg.Client({ connectionString: databaseUrl() });
  await client.connect();
  const tail = randomUUID().slice(0, 8);
  const koskId = randomUUID();
  const madrasahId = randomUUID();
  const koskName = `E2E Nûruosmaniye ${tail}`;
  const madrasahName = `E2E Süleymaniye ${tail}`;
  const published = { id: randomUUID(), title: `Bina ve İzhar Şerhi ${tail}` };
  const draft = { id: randomUUID(), title: `Kâfiye’ye giriş ${tail}` };
  const hidden = { id: randomUUID(), title: `Maksûd okumaları ${tail}` };
  const students = [randomUUID(), randomUUID()];

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
    const insertCourse = (
      c: { id: string; title: string },
      status: string,
      withMadrasah: boolean,
      archived: boolean
    ) =>
      client.query(
        `insert into courses(id, kosk_id, madrasah_id, author_id, title, status, archived_at)
         values ($1, $2, $3, $4, $5, $6, ${archived ? "now()" : "null"})`,
        [
          c.id,
          koskId,
          withMadrasah ? madrasahId : null,
          subs.granter,
          c.title,
          status,
        ]
      );
    await insertCourse(published, "PUBLISHED", true, false);
    await insertCourse(draft, "DRAFT", false, false);
    await insertCourse(hidden, "PUBLISHED", false, true);
    for (const student of students) {
      await client.query(
        "insert into enrollments(user_id, course_id, status) values ($1, $2, 'ENROLLED')",
        [student, published.id]
      );
    }
    const assign = (
      user: string,
      role: string,
      scopeType: string,
      scopeId: string,
      grantedBy: string,
      imam = false
    ) =>
      client.query(
        "insert into role_assignments(user_id, role, scope_type, scope_id, granted_by, is_imam) values ($1, $2, $3, $4, $5, $6)",
        [user, role, scopeType, scopeId, grantedBy, imam]
      );
    await assign(subs.koskNazim, "KOSK_NAZIM", "kosk", koskId, subs.granter);
    await assign(
      subs.muderris,
      "MUDERRIS",
      "course",
      published.id,
      subs.koskNazim,
      true
    );
    await assign(
      subs.muderris,
      "MUDERRIS",
      "course",
      draft.id,
      subs.muderris,
      true
    );
    await assign(
      subs.muderris,
      "MUDERRIS",
      "course",
      hidden.id,
      subs.muderris,
      true
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    await client.end();
    throw error;
  }

  const held = async (user: string) =>
    (
      await client.query(
        `select count(*)::int as n from role_assignments
          where user_id = $1 and revoked_at is null
            and (expires_at is null or expires_at > now())
            and scope_id <> all($2)`,
        [user, [koskId, madrasahId, published.id, draft.id, hidden.id]]
      )
    ).rows[0].n as number;
  const standing = {
    muderris: await held(subs.muderris),
    koskNazim: await held(subs.koskNazim),
  };

  return {
    koskId,
    koskName,
    madrasahName,
    published,
    draft,
    hidden,
    enrolledCount: students.length,
    standing,
    remove: async () => {
      const courseIds = [published.id, draft.id, hidden.id];
      try {
        await client.query("begin");
        await client.query(
          "delete from role_assignments where scope_id = any($1)",
          [[koskId, madrasahId, ...courseIds]]
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
