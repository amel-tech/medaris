import { randomUUID } from "node:crypto";
import pg from "pg";
import type { NazarFixture } from "./seed";

/**
 * What the specs of Talebeler, Yasaklamalar, Pano and Medrese dışı ders talebi
 * add to `seedPortal`'s medrese (MDRS-187), under random ids, and take out
 * again: 48 talebe in its two courses, one of whom has finished a course; bans
 * of every kademe the page tells apart; names and dates for the Pano's
 * applications and sessions. Direct SQL: the API only writes what the screens
 * ask, and nothing seeds a talebe, a ban of another person's kademe or a
 * session in the next seven days for a test.
 *
 * Each `remove` takes out what its seed made and what the screens wrote
 * through it (bans, requests, audit rows); `seedPortal`'s own `remove`, which
 * the spec calls last, takes out the medrese, its courses and its roles.
 */
export interface Person {
  id: string;
  name: string;
  email: string;
}

async function connect(): Promise<pg.Client> {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) throw new Error("E2E_DATABASE_URL is not set.");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  return client;
}

/** Removes the bans of the given people, of the medrese and of its courses, with what hangs on them. */
async function removeBans(
  client: pg.Client,
  base: NazarFixture,
  users: string[]
): Promise<void> {
  const courses = [base.first.id, base.second.id];
  const { rows } = await client.query(
    "select id from bans where user_id = any($1) or madrasah_id = $2 or course_id = any($3)",
    [users, base.madrasah.id, courses]
  );
  const ids = rows.map((row) => row.id as string);
  await client.query(
    "delete from ban_permanent_requests where ban_id = any($1)",
    [ids]
  );
  await client.query("delete from audit_log where entity_id = any($1)", [ids]);
  await client.query("delete from bans where id = any($1)", [ids]);
}

// ---- Talebeler (nazir/10) ----------------------------------------------------------

export interface BanRow {
  id: string;
  userId: string;
  scope: string;
  courseId: string | null;
  madrasahId: string | null;
  reason: string;
  bannedRole: string;
  liftedAt: Date | null;
  liftReason: string | null;
  extendedFromCourseId: string | null;
}

const BAN_COLUMNS = `id, user_id, scope, course_id, madrasah_id, reason, banned_role,
  lifted_at, lift_reason, extended_from_course_id`;

const banOf = (row: Record<string, unknown>): BanRow => ({
  id: row.id as string,
  userId: row.user_id as string,
  scope: row.scope as string,
  courseId: (row.course_id as string | null) ?? null,
  madrasahId: (row.madrasah_id as string | null) ?? null,
  reason: row.reason as string,
  bannedRole: row.banned_role as string,
  liftedAt: (row.lifted_at as Date | null) ?? null,
  liftReason: (row.lift_reason as string | null) ?? null,
  extendedFromCourseId: (row.extended_from_course_id as string | null) ?? null,
});

export interface StudentsFixture {
  tail: string;
  total: number;
  /** the names, newest enrolment first, as the list shows them */
  names: string[];
  /** the newest talebe: attends the first course and has finished the second */
  finisher: { id: string; name: string };
  /** the bans of the talebe, which a spec's "Yasakla" wrote */
  bansOf: (userId: string) => Promise<BanRow[]>;
  remove: () => Promise<void>;
}

/**
 * 48 talebe, each with a seat in one of the two courses (the newest in both: an
 * ongoing seat in the first and a completed one in the second), the newest
 * first enrolment first. Their names are on the enrolment, as a talebe's are until
 * their account is read.
 */
export async function seedStudents(
  base: NazarFixture
): Promise<StudentsFixture> {
  const client = await connect();
  const tail = randomUUID().slice(0, 8);
  const total = 48;
  const people = Array.from({ length: total }, (_, i) => ({
    id: randomUUID(),
    name: `E2E Talebe ${String(i + 1).padStart(2, "0")} ${tail}`,
  }));

  try {
    await client.query("begin");
    for (const [i, person] of people.entries()) {
      const course = i % 2 === 0 ? base.first.id : base.second.id;
      await client.query(
        `insert into enrollments(user_id, course_id, student_name, student_email, status, created_at)
          values ($1, $2, $3, $4, 'ENROLLED', now() - ($5 || ' days')::interval)`,
        [
          person.id,
          course,
          person.name,
          `talebe.${i + 1}.${tail}@example.test`,
          // the list is newest first by FIRST enrolment, and the first talebe's
          // other seat (below) is three days old: every first seat is older
          String(i + 4),
        ]
      );
    }
    // the newest finished the second course two days ago
    await client.query(
      `insert into enrollments(user_id, course_id, student_name, student_email, status, completed_at, created_at)
        values ($1, $2, $3, $4, 'COMPLETED', now() - interval '2 days', now() - interval '3 days')`,
      [
        (people[0] as { id: string }).id,
        base.second.id,
        (people[0] as { name: string }).name,
        `talebe.1.${tail}@example.test`,
      ]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    await client.end();
    throw error;
  }

  const ids = people.map((person) => person.id);
  return {
    tail,
    total,
    names: people.map((person) => person.name),
    finisher: people[0] as { id: string; name: string },
    bansOf: async (userId) => {
      const { rows } = await client.query(
        `select ${BAN_COLUMNS} from bans where user_id = $1 order by created_at`,
        [userId]
      );
      return rows.map(banOf);
    },
    remove: async () => {
      try {
        await client.query("begin");
        await removeBans(client, base, ids);
        await client.query("delete from enrollments where user_id = any($1)", [
          ids,
        ]);
        await client.query("commit");
      } finally {
        await client.end();
      }
    },
  };
}

// ---- Yasaklamalar (nazir/11) -------------------------------------------------------

export interface BansFixture {
  tail: string;
  /** barred from the first course two hours ago by the başmüderris: recent, and every action is theirs */
  open: Person;
  /** barred from the second course by a Medaris nazımı: it can be widened, not lifted */
  medaris: Person;
  /** barred from the first course by the başmüderris and lifted an hour ago */
  lifted: Person;
  /** every ban of a person, oldest first: what a spec's decision wrote */
  bansOf: (userId: string) => Promise<BanRow[]>;
  /** the permanent requests of a person's bans */
  requestsOf: (userId: string) => Promise<number>;
  /** the people a spec added through "Yasakla" are cleaned by id */
  remove: (extra?: string[]) => Promise<void>;
}

export async function seedBans(
  base: NazarFixture,
  head: string
): Promise<BansFixture> {
  const client = await connect();
  const tail = randomUUID().slice(0, 8);
  const person = (name: string): Person => {
    const id = randomUUID();
    return {
      id,
      name: `${name} ${tail}`,
      email: `${id.slice(0, 8)}@example.test`,
    };
  };
  const open = person("E2E Tarık Ziya Yücetürk");
  const medaris = person("E2E Talha Nusret Bozdoğanlı");
  const lifted = person("E2E Eda Nur Kaplan");
  const nazim = person("E2E Hasan Basri Gündoğdu");
  const everyone = [open, medaris, lifted, nazim];

  try {
    await client.query("begin");
    for (const one of everyone) {
      await client.query(
        "insert into users(id, given_name, family_name, email) values ($1, $2, '', $3)",
        [one.id, one.name, one.email]
      );
    }
    await client.query(
      `insert into bans(user_id, kosk_id, course_id, scope, reason, banned_by, banned_role, banned_tier, created_at)
        values ($1, $2, $3, 'COURSE', $4, $5, 'MEDRESE_BASMUDERRIS', 2, now() - interval '2 hours'),
               ($6, $2, $7, 'COURSE', $8, $9, 'MEDARIS_NAZIM', 4, now() - interval '30 hours')`,
      [
        open.id,
        base.koskId,
        base.first.id,
        "E2E celselerde ders dışı reklam yaptı",
        head,
        medaris.id,
        base.second.id,
        "E2E hesabını başka birine kullandırdı",
        nazim.id,
      ]
    );
    await client.query(
      `insert into bans(user_id, kosk_id, course_id, scope, reason, banned_by, banned_role, banned_tier,
                        created_at, lifted_at, lifted_by, lift_reason)
        values ($1, $2, $3, 'COURSE', 'E2E eski yasak', $4, 'MEDRESE_BASMUDERRIS', 2,
                now() - interval '3 days', now() - interval '1 hour', $4, 'E2E süre doldu')`,
      [lifted.id, base.koskId, base.first.id, head]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    await client.end();
    throw error;
  }

  const ids = everyone.map((one) => one.id);
  return {
    tail,
    open,
    medaris,
    lifted,
    bansOf: async (userId) => {
      const { rows } = await client.query(
        `select ${BAN_COLUMNS} from bans where user_id = $1 order by created_at`,
        [userId]
      );
      return rows.map(banOf);
    },
    requestsOf: async (userId) => {
      const { rows } = await client.query(
        `select count(*)::int as n from ban_permanent_requests r
          join bans b on b.id = r.ban_id where b.user_id = $1`,
        [userId]
      );
      return rows[0].n as number;
    },
    remove: async (extra = []) => {
      try {
        await client.query("begin");
        await removeBans(client, base, [...ids, ...extra]);
        await client.query("delete from users where id = any($1)", [ids]);
        await client.query("commit");
      } finally {
        await client.end();
      }
    },
  };
}

// ---- Pano (nazir/01) ---------------------------------------------------------------

export interface Applicant {
  userId: string;
  courseId: string;
  name: string;
}

export interface PanoFixture {
  /** the three applications, newest first: the first course's, the second's, the first course's */
  applicants: Applicant[];
  /** a talebe's seat in a course, or null when it is gone */
  seatOf: (userId: string, courseId: string) => Promise<string | null>;
  remove: () => Promise<void>;
}

/**
 * Names and dates for what `seedPortal` made, so that the Pano reads as the
 * canvas does: the two applications of the first course and the one of the
 * second get names and days of their own, the first course's two sessions fall
 * on the next two days (the first has no link, the second a Zoom one), and the
 * köşk both courses are in hosts the medrese.
 */
export async function seedPano(
  base: NazarFixture,
  head: string
): Promise<PanoFixture> {
  const client = await connect();
  const tail = randomUUID().slice(0, 8);
  const courses = [base.first.id, base.second.id];

  try {
    await client.query("begin");
    // A decision of an earlier spec used up some of `seedPortal`'s applications,
    // so the three of the Pano are made anew: the first course's, the second's,
    // the first course's again.
    await client.query("delete from enrollments where course_id = any($1)", [
      courses,
    ]);
    const order = [base.first.id, base.second.id, base.first.id].map(
      (course_id) => ({ user_id: randomUUID(), course_id })
    );
    for (const row of order) {
      await client.query(
        "insert into enrollments(user_id, course_id, status) values ($1, $2, 'PENDING')",
        [row.user_id, row.course_id]
      );
    }
    const applicants: Applicant[] = [];
    for (const [i, row] of order.entries()) {
      const name = `E2E Başvuran ${i + 1} ${tail}`;
      await client.query(
        `update enrollments set student_name = $3, student_email = $4,
            created_at = now() - ($5 || ' days')::interval
          where user_id = $1 and course_id = $2`,
        [
          row.user_id,
          row.course_id,
          name,
          `basvuran.${i + 1}.${tail}@example.test`,
          String(i + 1),
        ]
      );
      applicants.push({
        userId: row.user_id as string,
        courseId: row.course_id as string,
        name,
      });
    }
    await client.query(
      `update lessons set scheduled_at = now() + interval '2 days', meeting_url = null
        where title = 'Celse 1' and week_id in (select id from course_weeks where course_id = $1)`,
      [base.first.id]
    );
    await client.query(
      `update lessons set scheduled_at = now() + interval '3 days', meeting_url = 'https://zoom.us/j/123456789'
        where title = 'Celse 2' and week_id in (select id from course_weeks where course_id = $1)`,
      [base.first.id]
    );
    await client.query(
      "insert into madrasah_kosk_hosting(madrasah_id, kosk_id, granted_by) values ($1, $2, $3)",
      [base.madrasah.id, base.koskId, head]
    );
    await client.query("commit");

    return {
      applicants,
      seatOf: async (userId, courseId) => {
        const result = await client.query(
          "select status from enrollments where user_id = $1 and course_id = $2",
          [userId, courseId]
        );
        return (result.rows[0]?.status as string | undefined) ?? null;
      },
      remove: async () => {
        try {
          await client.query(
            "delete from madrasah_kosk_hosting where madrasah_id = $1",
            [base.madrasah.id]
          );
        } finally {
          await client.end();
        }
      },
    };
  } catch (error) {
    await client.query("rollback");
    await client.end();
    throw error;
  }
}

// ---- Medrese dışı ders talebi (nazir/09) -------------------------------------------

export interface OffsiteRequest {
  madrasahId: string;
  koskId: string;
  title: string;
  reason: string;
  status: string;
  requestedBy: string;
}

export interface OffsiteFixture {
  /** the requests the medrese has sent, oldest first */
  requests: () => Promise<OffsiteRequest[]>;
  /** the courses of the medrese: a request makes none */
  courseCount: () => Promise<number>;
  remove: () => Promise<void>;
}

export async function seedOffsite(base: NazarFixture): Promise<OffsiteFixture> {
  const client = await connect();
  return {
    requests: async () => {
      const { rows } = await client.query(
        `select madrasah_id, kosk_id, title, reason, status, requested_by
          from offsite_course_requests where madrasah_id = $1 order by created_at`,
        [base.madrasah.id]
      );
      return rows.map((row) => ({
        madrasahId: row.madrasah_id as string,
        koskId: row.kosk_id as string,
        title: row.title as string,
        reason: row.reason as string,
        status: row.status as string,
        requestedBy: row.requested_by as string,
      }));
    },
    courseCount: async () => {
      const { rows } = await client.query(
        "select count(*)::int as n from courses where madrasah_id = $1",
        [base.madrasah.id]
      );
      return rows[0].n as number;
    },
    remove: async () => {
      try {
        await client.query(
          "delete from offsite_course_requests where madrasah_id = $1",
          [base.madrasah.id]
        );
      } finally {
        await client.end();
      }
    },
  };
}
