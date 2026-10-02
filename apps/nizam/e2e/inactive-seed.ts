import { randomUUID } from "node:crypto";
import pg from "pg";

/**
 * What the Pasif kapsamlar specs put in tedrisat's database (MDRS-172,
 * nizam/14), under random ids and a per-run tail in every name, and take out
 * again: a medrese whose başmüderris's term ran out on 27 Eylül, a köşk whose
 * last nazım was taken away on 30 Eylül by another köşk nazımı, a course whose
 * last müderris (the imam) was taken away the same day, and — to be left out —
 * a köşk and a medrese that are attended and a köşk nobody ever managed.
 * Direct SQL: the API only writes what the screens ask, and nothing seeds a
 * term that ran out last week.
 */
export interface InactiveFixture {
  tail: string;
  madrasah: { id: string; name: string; head: { name: string } };
  kosk: { id: string; name: string; lastNazim: { name: string } };
  course: { id: string; title: string; lastMuderris: { name: string } };
  remover: { name: string };
  activeKosk: { id: string; name: string };
  activeMadrasah: { id: string; name: string };
  neverManaged: { id: string; name: string };
  /** a MEDARIS_NAZIM role for the account, with the permission or without */
  makeMedarisNazim: (sub: string, withPermission: boolean) => Promise<void>;
  /** who holds the role in the scope now: user id, granter, end */
  held: (
    scopeId: string,
    role: string
  ) => Promise<
    {
      userId: string;
      grantedBy: string;
      expiresAt: Date | null;
      isImam: boolean;
    }[]
  >;
  passiveSince: (
    table: "kosks" | "madrasahs",
    id: string
  ) => Promise<Date | null>;
  listedMuderris: (courseId: string) => Promise<string[]>;
  audits: (action: string, entityId?: string) => Promise<number>;
  remove: () => Promise<void>;
}

export async function seedInactive(): Promise<InactiveFixture> {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) throw new Error("E2E_DATABASE_URL is not set.");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const tail = randomUUID().slice(0, 8);
  const startedAt = new Date();
  const ids = {
    madrasah: randomUUID(),
    activeMadrasah: randomUUID(),
    kosk: randomUUID(),
    activeKosk: randomUUID(),
    neverManaged: randomUUID(),
    course: randomUUID(),
    head: randomUUID(),
    activeHead: randomUUID(),
    lastNazim: randomUUID(),
    activeNazim: randomUUID(),
    remover: randomUUID(),
    lastMuderris: randomUUID(),
    chief: randomUUID(),
  };
  const names = {
    madrasah: `E2E Zeyrek Medresesi ${tail}`,
    activeMadrasah: `E2E Süleymaniye Medresesi ${tail}`,
    kosk: `E2E Beyazıt Köşkü ${tail}`,
    activeKosk: `E2E Fatih Köşkü ${tail}`,
    neverManaged: `E2E Boş Köşk ${tail}`,
    course: `Kasîde-i Bürde şerhi ${tail}`,
  };
  const people = {
    head: { name: "Abdurrahman Şeref Tunalıoğlu" },
    lastNazim: { name: "Eski Köşk Nazımı" },
    lastMuderris: { name: "Halil İbrahim Sarıkaya" },
    remover: { name: "Ayşe Nur Kılıçarslan" },
  };
  const medarisSubs: string[] = [];
  const email = (id: string) => `${id.slice(0, 8)}.${tail}@example.test`;

  try {
    await client.query("begin");
    await client.query(
      `insert into users(id, given_name, family_name, email) values
        ($1, 'Abdurrahman Şeref', 'Tunalıoğlu', $7), ($2, 'Eski', 'Köşk Nazımı', $8),
        ($3, 'Halil İbrahim', 'Sarıkaya', $9), ($4, 'Ayşe Nur', 'Kılıçarslan', $10),
        ($5, 'Aktif', 'Nazım', $11), ($6, 'Aktif', 'Başmüderris', $12)`,
      [
        ids.head,
        ids.lastNazim,
        ids.lastMuderris,
        ids.remover,
        ids.activeNazim,
        ids.activeHead,
        email(ids.head),
        email(ids.lastNazim),
        email(ids.lastMuderris),
        email(ids.remover),
        email(ids.activeNazim),
        email(ids.activeHead),
      ]
    );
    await client.query(
      "insert into madrasahs(id, handle, name, created_by) values ($1, $2, $3, $7), ($4, $5, $6, $7)",
      [
        ids.madrasah,
        `e2e-zeyrek-${tail}`,
        names.madrasah,
        ids.activeMadrasah,
        `e2e-suleymaniye-${tail}`,
        names.activeMadrasah,
        ids.chief,
      ]
    );
    await client.query(
      "insert into kosks(id, owner_id, name) values ($1, $2, $3), ($4, $5, $6), ($7, $8, $9)",
      [
        ids.kosk,
        ids.chief,
        names.kosk,
        ids.activeKosk,
        ids.chief,
        names.activeKosk,
        ids.neverManaged,
        ids.chief,
        names.neverManaged,
      ]
    );
    await client.query(
      "insert into courses(id, kosk_id, author_id, title, status) values ($1, $2, $3, $4, 'PUBLISHED')",
      [ids.course, ids.activeKosk, ids.chief, names.course]
    );
    // Zeyrek: the term ran out on 27 Eylül; Süleymaniye is attended.
    await client.query(
      `insert into role_assignments(user_id, role, scope_type, scope_id, granted_by, created_at, expires_at) values
        ($1, 'MEDRESE_BASMUDERRIS', 'madrasah', $2, $3, '2026-06-01T09:00:00Z', '2026-09-27T09:00:00Z')`,
      [ids.head, ids.madrasah, ids.chief]
    );
    await client.query(
      `insert into role_assignments(user_id, role, scope_type, scope_id, granted_by) values
        ($1, 'MEDRESE_BASMUDERRIS', 'madrasah', $2, $3)`,
      [ids.activeHead, ids.activeMadrasah, ids.chief]
    );
    // Beyazıt: the remover was a nazım of it; the last nazım was taken away by them on 30 Eylül.
    await client.query(
      `insert into role_assignments(user_id, role, scope_type, scope_id, granted_by, created_at, revoked_at, revoked_by) values
        ($1, 'KOSK_NAZIM', 'kosk', $3, $4, '2026-06-01T09:00:00Z', '2026-09-20T09:00:00Z', $4),
        ($2, 'KOSK_NAZIM', 'kosk', $3, $4, '2026-06-02T09:00:00Z', '2026-09-30T09:00:00Z', $1)`,
      [ids.remover, ids.lastNazim, ids.kosk, ids.chief]
    );
    // Fatih (the course's köşk): attended.
    await client.query(
      `insert into role_assignments(user_id, role, scope_type, scope_id, granted_by) values
        ($1, 'KOSK_NAZIM', 'kosk', $2, $3)`,
      [ids.activeNazim, ids.activeKosk, ids.chief]
    );
    // The course: its only müderris, the imam, was taken away on 30 Eylül.
    await client.query(
      `insert into role_assignments(user_id, role, scope_type, scope_id, granted_by, is_imam, created_at, revoked_at, revoked_by) values
        ($1, 'MUDERRIS', 'course', $2, $3, true, '2026-06-01T09:00:00Z', '2026-09-30T09:00:00Z', $4)`,
      [ids.lastMuderris, ids.course, ids.chief, ids.activeNazim]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    await client.end();
    throw error;
  }

  const scopeIds = [
    ids.madrasah,
    ids.activeMadrasah,
    ids.kosk,
    ids.activeKosk,
    ids.neverManaged,
    ids.course,
  ];
  const userIds = [
    ids.head,
    ids.activeHead,
    ids.lastNazim,
    ids.activeNazim,
    ids.remover,
    ids.lastMuderris,
    ids.chief,
  ];

  return {
    tail,
    madrasah: { id: ids.madrasah, name: names.madrasah, head: people.head },
    kosk: { id: ids.kosk, name: names.kosk, lastNazim: people.lastNazim },
    course: {
      id: ids.course,
      title: names.course,
      lastMuderris: people.lastMuderris,
    },
    remover: people.remover,
    activeKosk: { id: ids.activeKosk, name: names.activeKosk },
    activeMadrasah: { id: ids.activeMadrasah, name: names.activeMadrasah },
    neverManaged: { id: ids.neverManaged, name: names.neverManaged },
    makeMedarisNazim: async (sub, withPermission) => {
      medarisSubs.push(sub);
      await client.query(
        "insert into role_assignments(user_id, role, scope_type, granted_by) values ($1, 'MEDARIS_NAZIM', 'platform', $1)",
        [sub]
      );
      if (withPermission) {
        await client.query(
          "insert into permission_grants(user_id, scope_type, permission, granted_by) values ($1, 'platform', 'platform.inactive_scopes_manage', $1)",
          [sub]
        );
      }
    },
    held: async (scopeId, role) =>
      (
        await client.query(
          `select user_id, granted_by, expires_at, is_imam from role_assignments
            where scope_id = $1 and role = $2 and revoked_at is null
              and (expires_at is null or expires_at > now())
            order by created_at`,
          [scopeId, role]
        )
      ).rows.map(
        (r: {
          user_id: string;
          granted_by: string;
          expires_at: Date | null;
          is_imam: boolean;
        }) => ({
          userId: r.user_id,
          grantedBy: r.granted_by,
          expiresAt: r.expires_at,
          isImam: r.is_imam,
        })
      ),
    passiveSince: async (table, id) =>
      (
        await client.query(`select passive_since from ${table} where id = $1`, [
          id,
        ])
      ).rows[0]?.passive_since ?? null,
    listedMuderris: async (courseId) =>
      (
        await client.query(
          "select user_id from course_muderris where course_id = $1 order by order_index",
          [courseId]
        )
      ).rows.map((r: { user_id: string }) => r.user_id),
    audits: async (action, entityId) =>
      Number(
        (
          await client.query(
            `select count(*) from audit_log where action = $1 and created_at >= $2
               and ($3::uuid is null or entity_id = $3::uuid)`,
            [action, startedAt, entityId ?? null]
          )
        ).rows[0].count
      ),
    remove: async () => {
      try {
        await client.query("begin");
        await client.query(
          "delete from permission_grants where user_id = any($1)",
          [medarisSubs]
        );
        await client.query(
          "delete from role_assignments where scope_id = any($1) or (role = 'MEDARIS_NAZIM' and user_id = any($2))",
          [scopeIds, medarisSubs]
        );
        await client.query("delete from course_muderris where course_id = $1", [
          ids.course,
        ]);
        await client.query("delete from courses where id = $1", [ids.course]);
        await client.query("delete from madrasahs where id = any($1)", [
          [ids.madrasah, ids.activeMadrasah],
        ]);
        await client.query("delete from kosks where id = any($1)", [
          [ids.kosk, ids.activeKosk, ids.neverManaged],
        ]);
        await client.query("delete from users where id = any($1)", [userIds]);
        await client.query(
          `delete from audit_log where created_at >= $1
             and (action like 'inactive_scope.%' or action like 'madrasah.%' or action = 'user.lookup')`,
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
