import { randomUUID } from "node:crypto";
import pg from "pg";
import { type HeldMedarisNazim, holdMedarisNazim } from "./medaris-nazim";

/**
 * What the home-page specs put in tedrisat's database (MDRS-182, nizam/01, 02
 * and 05), under random ids and a per-run tail in every name, and take out
 * again: a köşk managed by the signed-in köşk nazımı with a published course
 * (two talebe, two waiting applications, five live sessions: one with a link
 * tomorrow, one without in two days, one over, one cancelled and one in a
 * month), two köşk applications and a deck request waiting, an open ban, and a
 * medrese whose başmüderris left. Direct SQL: no endpoint seeds a session in
 * the past or a ban of someone else.
 */
export interface DashboardFixture {
  tail: string;
  kosk: { id: string; name: string };
  otherKosk: { id: string; name: string };
  course: { id: string; title: string };
  lessons: { noLink: string; withLink: string };
  pending: { userId: string; name: string }[];
  applications: { name: string }[];
  deck: { title: string };
  passiveMadrasah: { id: string; name: string };
  ban: { name: string; reason: string };
  /** a MEDARIS_NAZIM role for the account holding exactly these platform permissions */
  makeMedarisNazim: (sub: string, codes: string[]) => Promise<void>;
  /** takes one platform permission away from the account */
  revokePermission: (sub: string, code: string) => Promise<void>;
  /** the numbers the pages must show, counted off the database */
  counts: () => Promise<{
    koskApplications: number;
    deckRequests: number;
    kosks: number;
    madrasahs: number;
    courses: number;
    students: number;
    passive: number;
    pendingIn: number;
    studentsIn: number;
    upcomingIn: number;
  }>;
  /** the passive medrese is given its başmüderris again */
  healPassive: () => Promise<void>;
  enrollmentOf: (userId: string) => Promise<string | null>;
  rejectAudits: (userId: string) => Promise<{ reason: string | null }[]>;
  remove: () => Promise<void>;
}

export async function seedDashboard(subs: {
  chief: string;
  koskNazim: string;
}): Promise<DashboardFixture> {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) throw new Error("E2E_DATABASE_URL is not set.");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const tail = randomUUID().slice(0, 8);
  const id = () => randomUUID();
  const koskId = id();
  const otherKoskId = id();
  const courseId = id();
  const weekId = id();
  const madrasahId = id();
  const goneHead = id();
  const koskName = `E2E Nûruosmaniye ${tail}`;
  const otherKoskName = `E2E Fatih ${tail}`;
  const course = { id: courseId, title: `Emsile ve Bina ${tail}` };
  const lessons = { noLink: id(), withLink: id() };
  const talebe = [id(), id()];
  const waiting = [
    { userId: id(), name: `Rümeysa ${tail}`, family: "Karaca" },
    { userId: id(), name: `Said ${tail}`, family: "Özdemiroğlu" },
  ];
  const pending = waiting.map(({ userId, name }) => ({ userId, name }));
  const applicant = id();
  const author = id();
  const bannedUser = id();
  const applications = [
    { id: id(), name: `E2E Davutpaşa ${tail}` },
    { id: id(), name: `E2E Kocamustafapaşa ${tail}` },
  ];
  const deck = { id: id(), title: `Mehmûz fiiller ${tail}` };
  const banId = id();
  const ban = { name: `Kerem ${tail}`, reason: `Celselerde hakaret ${tail}.` };
  const passiveMadrasah = { id: madrasahId, name: `E2E Zeyrek ${tail}` };
  const moduleHost = `${tail}.example.test`;
  const people: [string, string, string][] = [
    ...waiting.map((w): [string, string, string] => [
      w.userId,
      w.name,
      w.family,
    ]),
    [applicant, `Ömer ${tail}`, "Bilmenoğlu"],
    [author, `Zeynep ${tail}`, "Karahanlı"],
    [bannedUser, ban.name, "Yazıcı"],
    ...talebe.map((t, i): [string, string, string] => [
      t,
      `${i === 0 ? "Ali" : "Bahar"} ${tail}`,
      i === 0 ? "Yıldız" : "Kaya",
    ]),
  ];
  try {
    await client.query("begin");
    for (const [uid, given, family] of people) {
      await client.query(
        "insert into users(id, given_name, family_name, email) values ($1, $2, $3, $4) on conflict (id) do nothing",
        [uid, given, family, `${uid.slice(0, 8)}@${moduleHost}`]
      );
    }
    for (const [kid, name] of [
      [koskId, koskName],
      [otherKoskId, otherKoskName],
    ]) {
      await client.query(
        "insert into kosks(id, owner_id, name) values ($1, $2, $3)",
        [kid, subs.chief, name]
      );
    }
    await client.query(
      "insert into role_assignments(user_id, role, scope_type, scope_id, granted_by) values ($1, 'KOSK_NAZIM', 'kosk', $2, $3)",
      [subs.koskNazim, koskId, subs.chief]
    );
    await client.query(
      "insert into madrasahs(id, handle, name, created_by) values ($1, $2, $3, $4)",
      [madrasahId, `e2e-${tail}`, passiveMadrasah.name, subs.chief]
    );
    // the başmüderris's post ended yesterday: the medrese is passive
    await client.query(
      "insert into role_assignments(user_id, role, scope_type, scope_id, granted_by, revoked_at, revoked_by) values ($1, 'MEDRESE_BASMUDERRIS', 'madrasah', $2, $3, now() - interval '1 day', $3)",
      [goneHead, madrasahId, subs.chief]
    );
    await client.query(
      "insert into courses(id, kosk_id, madrasah_id, author_id, title, status) values ($1, $2, $3, $4, $5, 'PUBLISHED')",
      [courseId, koskId, madrasahId, subs.koskNazim, course.title]
    );
    await client.query(
      "insert into course_muderris(course_id, user_id, name) values ($1, $2, 'E2E Müderris')",
      [courseId, subs.koskNazim]
    );
    await client.query(
      "insert into role_assignments(user_id, role, scope_type, scope_id, granted_by, is_imam) values ($1, 'MUDERRIS', 'course', $2, $3, true)",
      [subs.koskNazim, courseId, subs.chief]
    );
    await client.query(
      "insert into course_weeks(id, course_id, week_number, title) values ($1, $2, 5, 'Mehmûz fiiller')",
      [weekId, courseId]
    );
    const live = (
      lid: string,
      when: string,
      url: string | null,
      cancelled = false
    ) =>
      client.query(
        `insert into lessons(id, week_id, title, type, scheduled_at, duration_minutes, meeting_url, cancelled_at)
         values ($1, $2, 'Celse', 'LIVE', now() + $3::interval, 60, $4, ${cancelled ? "now() - interval '1 hour'" : "null"})`,
        [lid, weekId, when, url]
      );
    await live(lessons.withLink, "1 day", "https://zoom.us/j/1234567890");
    await live(lessons.noLink, "2 days", null);
    await live(id(), "-2 days", "https://zoom.us/j/1");
    await live(id(), "3 days", "https://zoom.us/j/2", true);
    await live(id(), "30 days", "https://zoom.us/j/3");
    for (const t of talebe) {
      await client.query(
        "insert into enrollments(user_id, course_id, status) values ($1, $2, 'ENROLLED')",
        [t, courseId]
      );
    }
    for (const p of pending) {
      await client.query(
        "insert into enrollments(user_id, course_id, status, student_name) values ($1, $2, 'PENDING', $3)",
        [p.userId, courseId, p.name]
      );
    }
    for (const a of applications) {
      await client.query(
        "insert into kosk_applications(id, applicant_id, name, field, summary, reason, email) values ($1, $2, $3, 'AQEEDAH_KALAM', 's', 'r', $4)",
        [a.id, applicant, a.name, `ba@${moduleHost}`]
      );
    }
    await client.query(
      "insert into decks(id, author_id, title, publish_status, publish_requested_at) values ($1, $2, $3, 'PENDING', now() - interval '2 hours')",
      [deck.id, author, deck.title]
    );
    for (const n of [1, 2, 3]) {
      await client.query(
        "insert into flashcards(deck_id, author_id, type, content_front, content_back) values ($1, $2, 'VOCABULARY', $3, $4)",
        [deck.id, author, `ön ${n}`, `arka ${n}`]
      );
    }
    await client.query(
      "insert into bans(id, user_id, kosk_id, course_id, scope, reason, banned_by, banned_role, banned_tier) values ($1, $2, $3, $4, 'COURSE', $5, $6, 'KOSK_NAZIM', 2)",
      [banId, bannedUser, koskId, courseId, ban.reason, subs.koskNazim]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    await client.end();
    throw error;
  }

  const one = async (sql: string, params: unknown[] = []) =>
    Number((await client.query(sql, params)).rows[0]?.n ?? 0);

  const medarisNazims: HeldMedarisNazim[] = [];

  return {
    tail,
    kosk: { id: koskId, name: koskName },
    otherKosk: { id: otherKoskId, name: otherKoskName },
    course,
    lessons,
    pending,
    applications: applications.map((a) => ({ name: a.name })),
    deck: { title: deck.title },
    passiveMadrasah,
    ban,
    makeMedarisNazim: async (sub, codes) => {
      medarisNazims.push(
        await holdMedarisNazim(
          sub,
          codes.map((code) => ({ code })),
          subs.chief
        )
      );
    },
    revokePermission: async (sub, code) => {
      await client.query(
        "update permission_grants set revoked_at = now(), revoked_by = $3 where user_id = $1 and permission = $2",
        [sub, code, subs.chief]
      );
    },
    counts: async () => ({
      koskApplications: await one(
        "select count(*) n from kosk_applications where status = 'PENDING'"
      ),
      deckRequests: await one(
        "select count(*) n from decks where publish_status = 'PENDING' and archived_at is null"
      ),
      kosks: await one(
        "select count(*) n from kosks where archived_at is null"
      ),
      madrasahs: await one(
        "select count(*) n from madrasahs where archived_at is null"
      ),
      courses: await one(
        "select count(*) n from courses c join kosks k on k.id = c.kosk_id where c.archived_at is null and k.archived_at is null"
      ),
      students: await one(
        "select count(distinct e.user_id) n from enrollments e join courses c on c.id = e.course_id join kosks k on k.id = c.kosk_id where c.archived_at is null and k.archived_at is null and e.status = 'ENROLLED'"
      ),
      passive: await one(
        `select count(*) n from role_assignments ra where ra.role = 'MEDRESE_BASMUDERRIS' and ra.scope_id = $1 and ra.revoked_at is not null`,
        [madrasahId]
      ),
      pendingIn: await one(
        "select count(*) n from enrollments e join courses c on c.id = e.course_id where c.kosk_id = $1 and e.status = 'PENDING'",
        [koskId]
      ),
      studentsIn: await one(
        "select count(distinct e.user_id) n from enrollments e join courses c on c.id = e.course_id where c.kosk_id = $1 and e.status = 'ENROLLED'",
        [koskId]
      ),
      upcomingIn: await one(
        "select count(*) n from lessons l join course_weeks w on w.id = l.week_id join courses c on c.id = w.course_id where c.kosk_id = $1 and l.type = 'LIVE' and l.cancelled_at is null and l.scheduled_at >= now() and l.scheduled_at < now() + interval '7 days'",
        [koskId]
      ),
    }),
    healPassive: async () => {
      await client.query(
        "update role_assignments set revoked_at = null, revoked_by = null where scope_id = $1 and role = 'MEDRESE_BASMUDERRIS'",
        [madrasahId]
      );
    },
    enrollmentOf: async (userId) =>
      (
        await client.query(
          "select status from enrollments where user_id = $1 and course_id = $2",
          [userId, courseId]
        )
      ).rows[0]?.status ?? null,
    rejectAudits: async (userId) =>
      (
        await client.query(
          "select details->>'reason' as reason from audit_log where action = 'enrollment.reject' and entity_id = $1 and details->>'userId' = $2",
          [courseId, userId]
        )
      ).rows,
    remove: async () => {
      try {
        // the standing Medaris nazımı first: what it was given names no fixture row
        for (const held of medarisNazims.reverse()) await held.release();
        await client.query("begin");
        await client.query("delete from bans where kosk_id = $1", [koskId]);
        await client.query(
          "delete from kosk_applications where applicant_id = $1",
          [applicant]
        );
        await client.query("delete from flashcards where deck_id = $1", [
          deck.id,
        ]);
        await client.query("delete from decks where id = $1", [deck.id]);
        await client.query("delete from audit_log where entity_id = $1", [
          courseId,
        ]);
        await client.query("delete from enrollments where course_id = $1", [
          courseId,
        ]);
        await client.query("delete from lessons where week_id = $1", [weekId]);
        await client.query("delete from course_weeks where id = $1", [weekId]);
        await client.query("delete from course_muderris where course_id = $1", [
          courseId,
        ]);
        await client.query(
          "delete from role_assignments where scope_id = any($1)",
          [[koskId, madrasahId, courseId]]
        );
        await client.query("delete from courses where id = $1", [courseId]);
        await client.query("delete from madrasahs where id = $1", [madrasahId]);
        await client.query("delete from kosks where id = any($1)", [
          [koskId, otherKoskId],
        ]);
        await client.query("delete from users where email like $1", [
          `%@${moduleHost}`,
        ]);
        await client.query("commit");
      } finally {
        await client.end();
      }
    },
  };
}
