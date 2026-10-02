import { randomUUID } from "node:crypto";
import pg from "pg";
import type { NazirFixture } from "./seed";

/**
 * What the archive specs add to `seedPortal`'s medrese (MDRS-185), under random
 * ids, and take out again: a hidden course, hidden weeks and hidden sessions in
 * its first course, hidden by the three kinds of hider the page tells apart —
 * the signed-in başmüderris (whose restore is theirs), a köşk nazımı (a higher
 * kademe, so the page shows a sentence in place of "Geri al") and an account
 * that holds no role at all (Medaris yönetimi). Direct SQL: the hide endpoints
 * stamp the signed-in caller and the clock, and these specs need other hiders
 * and other days.
 */
export interface ArchiveFixture {
  /** a köşk nazımı of the köşk both courses are in */
  koskNazim: { id: string; name: string };
  /** an account with no role: its hiding reads as Medaris yönetimi */
  admin: { id: string; name: string };
  /** hidden by the başmüderris, three days ago */
  course: { id: string; title: string };
  /** hidden by the başmüderris, a few days ago: theirs to bring back */
  sessionOfHead: { id: string; title: string };
  /** hidden by the köşk nazımı yesterday */
  sessionOfKosk: { id: string; title: string };
  /** hidden by the account without a role */
  sessionOfAdmin: { id: string; title: string };
  /** hidden by the başmüderris, in the course the specs look at */
  week: { id: string; title: string };
  /** hides `count` more weeks, for the pager */
  hideWeeks: (count: number) => Promise<void>;
  /** whether the row is hidden now */
  isHidden: (
    table: "courses" | "course_weeks" | "lessons" | "madrasahs",
    id: string
  ) => Promise<boolean>;
  remove: () => Promise<void>;
}

const DAY = 24 * 3600 * 1000;

export async function seedArchive(
  base: NazirFixture,
  head: string
): Promise<ArchiveFixture> {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) throw new Error("E2E_DATABASE_URL is not set.");
  const client = new pg.Client({ connectionString: url });
  await client.connect();

  const tail = randomUUID().slice(0, 8);
  const koskNazim = {
    id: randomUUID(),
    name: `Ömer Nasuhi Bilmenoğlu ${tail}`,
  };
  const admin = { id: randomUUID(), name: `Yusuf Ziya Ertuğrul ${tail}` };
  const course = { id: randomUUID(), title: `E2E Merâhu’l-ervâh ${tail}` };
  const visibleWeek = randomUUID();
  const week = { id: randomUUID(), title: `E2E Hafta 9: Genel tekrar ${tail}` };
  const sessions = {
    head: { id: randomUUID(), title: `E2E Telafi celsesi ${tail}` },
    kosk: { id: randomUUID(), title: `E2E Mantığın tarifi ${tail}` },
    admin: { id: randomUUID(), title: `E2E Tanışma celsesi ${tail}` },
  };
  const extraWeeks: string[] = [];
  const now = Date.now();
  const ago = (days: number) => new Date(now - days * DAY).toISOString();

  try {
    await client.query("begin");
    await client.query(
      `insert into users(id, given_name, family_name, email) values
        ($1, $2, '', $3), ($4, $5, '', $6)`,
      [
        koskNazim.id,
        koskNazim.name,
        `kosk.${tail}@example.test`,
        admin.id,
        admin.name,
        `admin.${tail}@example.test`,
      ]
    );
    await client.query(
      "insert into role_assignments(user_id, role, scope_type, scope_id, granted_by) values ($1, 'KOSK_NAZIM', 'kosk', $2, $3)",
      [koskNazim.id, base.koskId, head]
    );
    // a hidden course of the medrese
    await client.query(
      `insert into courses(id, kosk_id, madrasah_id, author_id, title, status, archived_at, archived_by)
        values ($1, $2, $3, $4, $5, 'PUBLISHED', $6, $4)`,
      [course.id, base.koskId, base.madrasah.id, head, course.title, ago(3)]
    );
    // a week that stays visible holds the hidden sessions: a session is listed while its course is shown
    await client.query(
      "insert into course_weeks(id, course_id, week_number, title) values ($1, $2, 1, 'E2E Hafta 1')",
      [visibleWeek, base.first.id]
    );
    await client.query(
      `insert into lessons(id, week_id, title, type, scheduled_at, archived_at, archived_by) values
        ($1, $4, $5, 'LIVE', $8, $9, $10),
        ($2, $4, $6, 'LIVE', $8, $11, $12),
        ($3, $4, $7, 'LIVE', $8, $13, $14)`,
      [
        sessions.head.id,
        sessions.kosk.id,
        sessions.admin.id,
        visibleWeek,
        sessions.head.title,
        sessions.kosk.title,
        sessions.admin.title,
        ago(10),
        ago(4),
        head,
        ago(1),
        koskNazim.id,
        ago(2),
        admin.id,
      ]
    );
    await client.query(
      `insert into course_weeks(id, course_id, week_number, title, archived_at, archived_by)
        values ($1, $2, 9, $3, $4, $5)`,
      [week.id, base.first.id, week.title, ago(5), head]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    await client.end();
    throw error;
  }

  return {
    koskNazim,
    admin,
    course,
    sessionOfHead: sessions.head,
    sessionOfKosk: sessions.kosk,
    sessionOfAdmin: sessions.admin,
    week,
    hideWeeks: async (count) => {
      for (let n = 0; n < count; n += 1) {
        const id = randomUUID();
        extraWeeks.push(id);
        await client.query(
          `insert into course_weeks(id, course_id, week_number, title, archived_at, archived_by)
            values ($1, $2, $3, $4, $5, $6)`,
          [
            id,
            base.first.id,
            20 + n,
            `E2E Hafta ${20 + n} ${tail}`,
            ago(6 + n),
            head,
          ]
        );
      }
    },
    isHidden: async (table, id) => {
      const { rows } = await client.query(
        `select archived_at is not null as hidden from ${table} where id = $1`,
        [id]
      );
      return Boolean(rows[0]?.hidden);
    },
    remove: async () => {
      const weeks = [visibleWeek, week.id, ...extraWeeks];
      const entities = [
        course.id,
        week.id,
        ...extraWeeks,
        sessions.head.id,
        sessions.kosk.id,
        sessions.admin.id,
      ];
      try {
        await client.query("begin");
        await client.query("delete from audit_log where entity_id = any($1)", [
          entities,
        ]);
        await client.query("delete from lessons where week_id = any($1)", [
          weeks,
        ]);
        await client.query("delete from course_weeks where id = any($1)", [
          weeks,
        ]);
        await client.query("delete from courses where id = $1", [course.id]);
        await client.query(
          "delete from role_assignments where user_id = $1 and scope_id = $2",
          [koskNazim.id, base.koskId]
        );
        await client.query("delete from users where id = any($1)", [
          [koskNazim.id, admin.id],
        ]);
        await client.query("commit");
      } finally {
        await client.end();
      }
    },
  };
}
