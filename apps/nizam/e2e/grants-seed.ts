import { randomUUID } from "node:crypto";
import pg from "pg";

/**
 * What the İzinler specs put in tedrisat's database (MDRS-172, nizam/38),
 * under random ids and a per-run tail in every name, and take out again: a
 * köşk the signed-in nazım manages with two courses of its own and one that
 * belongs to a medrese, and a ders nazırı already appointed in the first
 * course with three permissions and an end date. Direct SQL: the API only
 * writes what the screens ask, and a post made "two weeks ago" by somebody
 * else is not one of them.
 */
export interface GrantsFixture {
  tail: string;
  kosk: { id: string; name: string };
  otherKoskId: string;
  courses: {
    emsile: { id: string; title: string };
    nahiv: { id: string; title: string };
    medrese: { id: string; title: string };
  };
  madrasahName: string;
  /** the ders nazırı seeded in `emsile` */
  existing: { id: string; name: string; email: string; postId: string };
  /** the post and its permissions as the database holds them, held ones only */
  held: (
    userId: string,
    courseId: string
  ) => Promise<{
    post: { expiresAt: Date | null; grantedBy: string } | null;
    permissions: string[];
    grantExpiries: (Date | null)[];
  }>;
  /** every post, held or not, of the person in the course */
  posts: (
    userId: string,
    courseId: string
  ) => Promise<{ revoked: boolean; revokedBy: string | null }[]>;
  audits: (action: string) => Promise<number>;
  /** a MEDARIS_NAZIM role for the account, taken out with the rest */
  makeMedarisNazim: (sub: string) => Promise<void>;
  remove: () => Promise<void>;
}

export async function seedGrants(subs: {
  /** the köşk nazımı the specs sign in as */
  nazim: string;
}): Promise<GrantsFixture> {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) throw new Error("E2E_DATABASE_URL is not set.");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const tail = randomUUID().slice(0, 8);
  const startedAt = new Date();
  const ids = {
    kosk: randomUUID(),
    otherKosk: randomUUID(),
    madrasah: randomUUID(),
    existing: randomUUID(),
    chief: randomUUID(),
    post: randomUUID(),
  };
  const kosk = { id: ids.kosk, name: `E2E Nûruosmaniye Köşkü ${tail}` };
  const madrasahName = `E2E Süleymaniye ${tail}`;
  const courses = {
    emsile: { id: randomUUID(), title: `Emsile ve Bina ${tail}` },
    nahiv: { id: randomUUID(), title: `Nahiv ${tail}` },
    medrese: { id: randomUUID(), title: `Bina ve İzhar Şerhi ${tail}` },
  };
  const existing = {
    id: ids.existing,
    name: "Yusuf Kerem Aydınoğlu",
    email: `yusufkerem.${tail}@example.test`,
    postId: ids.post,
  };
  const medarisNazimSubs: string[] = [];

  try {
    await client.query("begin");
    await client.query(
      `insert into users(id, given_name, family_name, email) values
        ($1, 'Yusuf Kerem', 'Aydınoğlu', $3), ($2, 'Yusuf Ziya', 'Ertuğrul', $4)`,
      [ids.existing, ids.chief, existing.email, `yusuf.${tail}@example.test`]
    );
    await client.query(
      "insert into kosks(id, owner_id, name) values ($1, $2, $3), ($4, $5, $6)",
      [
        ids.kosk,
        subs.nazim,
        kosk.name,
        ids.otherKosk,
        randomUUID(),
        `E2E Başka Köşk ${tail}`,
      ]
    );
    await client.query(
      "insert into role_assignments(user_id, role, scope_type, scope_id, granted_by) values ($1, 'KOSK_NAZIM', 'kosk', $2, $3)",
      [subs.nazim, ids.kosk, ids.chief]
    );
    await client.query(
      "insert into madrasahs(id, handle, name, created_by) values ($1, $2, $3, $4)",
      [ids.madrasah, `e2e-suleymaniye-${tail}`, madrasahName, ids.chief]
    );
    for (const [c, madrasahId] of [
      [courses.emsile, null],
      [courses.nahiv, null],
      [courses.medrese, ids.madrasah],
    ] as const) {
      await client.query(
        "insert into courses(id, kosk_id, madrasah_id, author_id, title, status) values ($1, $2, $3, $4, $5, 'PUBLISHED')",
        [c.id, ids.kosk, madrasahId, subs.nazim, c.title]
      );
    }
    // Appointed 14 Eylül by the signed-in nazım, ending 31 Aralık.
    await client.query(
      `insert into role_assignments(id, user_id, role, scope_type, scope_id, granted_by, created_at, expires_at)
       values ($1, $2, 'DERS_NAZIR', 'course', $3, $4, '2026-09-14T09:00:00Z', '2026-12-31T20:59:59Z')`,
      [ids.post, ids.existing, courses.emsile.id, subs.nazim]
    );
    await client.query(
      `insert into permission_grants(user_id, scope_type, scope_id, permission, granted_by, created_at, expires_at)
       select $1, 'course', $2, p, $3, '2026-09-14T09:00:00Z', '2026-12-31T20:59:59Z'
         from unnest(array['session.manage', 'session.live_link', 'week.hide']) as p`,
      [ids.existing, courses.emsile.id, subs.nazim]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    await client.end();
    throw error;
  }

  const courseIds = [courses.emsile.id, courses.nahiv.id, courses.medrese.id];

  return {
    tail,
    kosk,
    otherKoskId: ids.otherKosk,
    courses,
    madrasahName,
    existing,
    held: async (userId, courseId) => {
      const {
        rows: [post],
      } = await client.query(
        `select expires_at, granted_by from role_assignments
          where user_id = $1 and scope_id = $2 and role = 'DERS_NAZIR'
            and revoked_at is null and (expires_at is null or expires_at > now())`,
        [userId, courseId]
      );
      const { rows } = await client.query(
        `select permission, expires_at from permission_grants
          where user_id = $1 and scope_id = $2 and revoked_at is null
            and (expires_at is null or expires_at > now())
          order by permission`,
        [userId, courseId]
      );
      return {
        post: post
          ? { expiresAt: post.expires_at, grantedBy: post.granted_by }
          : null,
        permissions: rows.map((r: { permission: string }) => r.permission),
        grantExpiries: rows.map(
          (r: { expires_at: Date | null }) => r.expires_at
        ),
      };
    },
    posts: async (userId, courseId) =>
      (
        await client.query(
          `select revoked_at is not null as revoked, revoked_by from role_assignments
            where user_id = $1 and scope_id = $2 and role = 'DERS_NAZIR' order by created_at`,
          [userId, courseId]
        )
      ).rows.map((r: { revoked: boolean; revoked_by: string | null }) => ({
        revoked: r.revoked,
        revokedBy: r.revoked_by,
      })),
    audits: async (action) =>
      Number(
        (
          await client.query(
            "select count(*) from audit_log where action = $1 and created_at >= $2",
            [action, startedAt]
          )
        ).rows[0].count
      ),
    makeMedarisNazim: async (sub) => {
      medarisNazimSubs.push(sub);
      await client.query(
        "insert into role_assignments(user_id, role, scope_type, granted_by) values ($1, 'MEDARIS_NAZIM', 'platform', $1)",
        [sub]
      );
    },
    remove: async () => {
      try {
        await client.query("begin");
        await client.query(
          "delete from permission_grants where scope_id = any($1)",
          [courseIds]
        );
        await client.query(
          "delete from role_assignments where scope_id = any($1)",
          [[...courseIds, ids.kosk, ids.otherKosk]]
        );
        if (medarisNazimSubs.length > 0) {
          await client.query(
            "delete from role_assignments where role = 'MEDARIS_NAZIM' and user_id = any($1)",
            [medarisNazimSubs]
          );
        }
        await client.query("delete from courses where id = any($1)", [
          courseIds,
        ]);
        await client.query("delete from madrasahs where id = $1", [
          ids.madrasah,
        ]);
        await client.query("delete from kosks where id = any($1)", [
          [ids.kosk, ids.otherKosk],
        ]);
        await client.query("delete from users where id = any($1)", [
          [ids.existing, ids.chief],
        ]);
        await client.query(
          `delete from audit_log where created_at >= $1
             and (action like 'course_nazir.%' or action = 'user.lookup')`,
          [startedAt]
        );
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        await client.end();
      }
    },
  };
}
