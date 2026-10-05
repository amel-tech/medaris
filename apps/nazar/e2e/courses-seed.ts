import { randomUUID } from "node:crypto";
import pg from "pg";
import type { NazarFixture } from "./seed";

/**
 * What the course specs add to `seedPortal`'s medrese (MDRS-186), under random
 * ids, and take out again: the köşk both of its courses are in, given an ilim
 * alanı, and a second köşk; a hosting right for each, and the köşks the list
 * must not offer (one that gave no right, one that is hidden); the müderris
 * lists (the first course has two accounts, the draft a müderris with no
 * account) and talebe on three of the courses; a draft opened today and a
 * hidden course. Direct SQL: the API only writes what the screens ask, and
 * nothing seeds a talebe or a hosting right for a test.
 *
 * What the screens write comes back through `muderrisOf`, `courseRow` and
 * `created`, and `remove` also takes out the courses a spec opened through
 * the screen.
 */
export interface Person {
  id: string;
  name: string;
  email: string;
}

export interface CourseRow {
  status: string;
  requiresApproval: boolean;
  closed: boolean;
  archivedAt: Date | null;
  madrasahId: string | null;
  koskId: string;
}

export interface CoursesFixture {
  tail: string;
  kosk: { id: string; name: string; field: string };
  fatih: { id: string; name: string; field: string };
  /** gave the medrese no hosting right */
  noRight: { id: string; name: string };
  /** holds a hosting right but is hidden */
  hiddenKosk: { id: string; name: string };
  /** the first course's second müderris: an account the users table knows */
  second: Person;
  /** a DRAFT in the first köşk, opened today; its müderris has no account */
  draft: { id: string; title: string };
  /** a published course in the second köşk, with nobody enrolled */
  other: { id: string; title: string };
  hidden: { id: string; title: string };
  /** the enrolled talebe of the first course */
  enrolled: number;
  /** the müderris accounts of a course now (not revoked), in no order */
  muderrisOf: (
    courseId: string
  ) => Promise<Array<{ userId: string; isImam: boolean }>>;
  /** the names on the course's list, in the order they are shown */
  namesOf: (courseId: string) => Promise<string[]>;
  courseRow: (courseId: string) => Promise<CourseRow | null>;
  /** the courses the medrese holds besides the seeded ones: what a spec opened */
  created: () => Promise<Array<{ id: string; title: string } & CourseRow>>;
  /** the medrese's policies, as "Medrese ayarları" saves them */
  setPolicies: (policies: {
    closedCourseRequired?: boolean;
    alwaysApproval?: boolean;
  }) => Promise<void>;
  /** the köşk withdraws its hosting right from the medrese */
  revokeHosting: (koskId: string) => Promise<void>;
  /** the audit rows of an action on a course */
  audits: (action: string, courseId: string) => Promise<number>;
  remove: () => Promise<void>;
}

const rowOf = (row: Record<string, unknown>): CourseRow => ({
  status: row.status as string,
  requiresApproval: row.requires_approval as boolean,
  closed: row.is_closed as boolean,
  archivedAt: (row.archived_at as Date | null) ?? null,
  madrasahId: (row.madrasah_id as string | null) ?? null,
  koskId: row.kosk_id as string,
});

const COLUMNS =
  "status, requires_approval, is_closed, archived_at, madrasah_id, kosk_id";

export async function seedCourses(
  base: NazarFixture,
  head: string
): Promise<CoursesFixture> {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) throw new Error("E2E_DATABASE_URL is not set.");
  const client = new pg.Client({ connectionString: url });
  await client.connect();

  const tail = randomUUID().slice(0, 8);
  const kosk = {
    id: base.koskId,
    name: base.first.koskName,
    field: "Arapça dil ilimleri",
  };
  const fatih = {
    id: randomUUID(),
    name: `E2E Fatih ${tail}`,
    field: "Fıkıh",
  };
  const noRight = { id: randomUUID(), name: `E2E Hak vermeyen ${tail}` };
  const hiddenKosk = { id: randomUUID(), name: `E2E Gizli köşk ${tail}` };
  const second: Person = {
    id: randomUUID(),
    name: `Abdülhamit Karaosmanoğlu ${tail}`,
    email: `karaosmanoglu.${tail}@example.test`,
  };
  const draft = { id: randomUUID(), title: `E2E Maksûd şerhi ${tail}` };
  const other = {
    id: randomUUID(),
    title: `E2E İsâgûcî ile mantığa giriş ${tail}`,
  };
  const hidden = { id: randomUUID(), title: `E2E Gizlenmiş ders ${tail}` };
  const enrolled = 3;
  const headName = `E2E Mehmet Emin Işıkoğlu ${tail}`;
  const seeded = [base.first.id, base.second.id, draft.id, other.id, hidden.id];

  try {
    await client.query("begin");
    await client.query("update kosks set field = $2 where id = $1", [
      kosk.id,
      kosk.field,
    ]);
    // the two seeded courses were opened a month ago, so that only the draft is "bugün açıldı"
    await client.query(
      "update courses set created_at = now() - interval '30 days' where id = any($1)",
      [[base.first.id, base.second.id]]
    );
    await client.query(
      `insert into kosks(id, owner_id, name, field, archived_at) values
        ($1, $5, $2, $3, null), ($4, $5, $6, null, null), ($7, $5, $8, null, now())`,
      [
        fatih.id,
        fatih.name,
        fatih.field,
        noRight.id,
        head,
        noRight.name,
        hiddenKosk.id,
        hiddenKosk.name,
      ]
    );
    await client.query(
      `insert into madrasah_kosk_hosting(madrasah_id, kosk_id, granted_by) values
        ($1, $2, $4), ($1, $3, $4), ($1, $5, $4)`,
      [base.madrasah.id, kosk.id, fatih.id, head, hiddenKosk.id]
    );
    await client.query(
      "insert into users(id, given_name, family_name, email) values ($1, $2, '', $3)",
      [second.id, second.name, second.email]
    );

    await client.query(
      `insert into courses(id, kosk_id, madrasah_id, author_id, title, status, created_at) values
        ($1, $2, $3, $4, $5, 'DRAFT', now()),
        ($6, $7, $3, $4, $8, 'PUBLISHED', now() - interval '12 days')`,
      [
        draft.id,
        kosk.id,
        base.madrasah.id,
        head,
        draft.title,
        other.id,
        fatih.id,
        other.title,
      ]
    );
    await client.query(
      `insert into courses(id, kosk_id, madrasah_id, author_id, title, status, archived_at, archived_by)
        values ($1, $2, $3, $4, $5, 'PUBLISHED', now(), $4)`,
      [hidden.id, kosk.id, base.madrasah.id, head, hidden.title]
    );
    // the müderris lists: two accounts on the first course, one on the others, a name alone on the draft
    await client.query(
      `insert into course_muderris(course_id, user_id, name, order_index) values
        ($1, $5, $6, 0), ($1, $7, $8, 1), ($2, $5, $6, 0), ($3, $5, $6, 0),
        ($4, null, 'E2E Konuk Müderris', 0)`,
      [
        base.first.id,
        base.second.id,
        other.id,
        draft.id,
        head,
        headName,
        second.id,
        second.name,
      ]
    );
    await client.query(
      "insert into role_assignments(user_id, role, scope_type, scope_id, granted_by, is_imam) values ($1, 'MUDERRIS', 'course', $2, $3, false)",
      [second.id, base.first.id, head]
    );
    await client.query(
      "insert into role_assignments(user_id, role, scope_type, scope_id, granted_by, is_imam) values ($1, 'MUDERRIS', 'course', $2, $1, true)",
      [head, other.id]
    );
    for (let n = 0; n < enrolled; n += 1) {
      await client.query(
        "insert into enrollments(user_id, course_id, status) values ($1, $2, 'ENROLLED')",
        [randomUUID(), base.first.id]
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    await client.end();
    throw error;
  }

  return {
    tail,
    kosk,
    fatih,
    noRight,
    hiddenKosk,
    second,
    draft,
    other,
    hidden,
    enrolled,
    muderrisOf: async (courseId) => {
      const { rows } = await client.query(
        `select user_id, is_imam from role_assignments
          where role = 'MUDERRIS' and scope_id = $1 and revoked_at is null`,
        [courseId]
      );
      return rows.map((row) => ({
        userId: row.user_id as string,
        isImam: row.is_imam as boolean,
      }));
    },
    namesOf: async (courseId) => {
      const { rows } = await client.query(
        "select name from course_muderris where course_id = $1 order by order_index, name",
        [courseId]
      );
      return rows.map((row) => row.name as string);
    },
    courseRow: async (courseId) => {
      const { rows } = await client.query(
        `select ${COLUMNS} from courses where id = $1`,
        [courseId]
      );
      return rows[0] ? rowOf(rows[0]) : null;
    },
    created: async () => {
      const { rows } = await client.query(
        `select id, title, ${COLUMNS} from courses
          where madrasah_id = $1 and id <> all($2) order by created_at`,
        [base.madrasah.id, seeded]
      );
      return rows.map((row) => ({
        id: row.id as string,
        title: row.title as string,
        ...rowOf(row),
      }));
    },
    setPolicies: async (policies) => {
      await client.query(
        `insert into madrasah_settings(madrasah_id, policy_closed_course_required, policy_always_approval, updated_by)
          values ($1, $2, $3, $4)
          on conflict (madrasah_id) do update set
            policy_closed_course_required = excluded.policy_closed_course_required,
            policy_always_approval = excluded.policy_always_approval`,
        [
          base.madrasah.id,
          policies.closedCourseRequired ?? false,
          policies.alwaysApproval ?? false,
          head,
        ]
      );
    },
    revokeHosting: async (koskId) => {
      await client.query(
        `update madrasah_kosk_hosting set revoked_at = now(), revoked_by = $3
          where madrasah_id = $1 and kosk_id = $2`,
        [base.madrasah.id, koskId, head]
      );
    },
    audits: async (action, courseId) => {
      const { rows } = await client.query(
        "select count(*)::int as n from audit_log where action = $1 and entity_id = $2",
        [action, courseId]
      );
      return rows[0].n as number;
    },
    remove: async () => {
      // `seedPortal`'s medrese outlives a spec, so what a spec did to its two courses is put back
      const own = [base.first.id, base.second.id];
      try {
        await client.query("begin");
        // every course of the medrese, so that what a spec opened goes too
        const { rows } = await client.query(
          "select id from courses where madrasah_id = $1",
          [base.madrasah.id]
        );
        const courseIds = rows.map((row) => row.id as string);
        await client.query("delete from audit_log where entity_id = any($1)", [
          courseIds,
        ]);
        await client.query(
          "delete from role_assignments where role = 'MUDERRIS' and scope_id = any($1)",
          [courseIds]
        );
        await client.query(
          "delete from course_muderris where course_id = any($1)",
          [courseIds]
        );
        await client.query(
          "delete from enrollments where course_id = $1 and status = 'ENROLLED'",
          [base.first.id]
        );
        await client.query(
          "delete from courses where id = any($1) and id <> all($2)",
          [courseIds, own]
        );
        await client.query(
          "update courses set archived_at = null, archived_by = null where id = any($1)",
          [own]
        );
        for (const id of own) {
          await client.query(
            "insert into role_assignments(user_id, role, scope_type, scope_id, granted_by, is_imam) values ($1, 'MUDERRIS', 'course', $2, $1, true)",
            [head, id]
          );
        }
        await client.query(
          "delete from madrasah_settings where madrasah_id = $1",
          [base.madrasah.id]
        );
        await client.query(
          "delete from madrasah_kosk_hosting where madrasah_id = $1",
          [base.madrasah.id]
        );
        await client.query("delete from users where id = $1", [second.id]);
        await client.query("delete from kosks where id = any($1)", [
          [fatih.id, noRight.id, hiddenKosk.id],
        ]);
        await client.query("commit");
      } finally {
        await client.end();
      }
    },
  };
}
