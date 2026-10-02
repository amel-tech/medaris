import { randomUUID } from "node:crypto";
import pg from "pg";

/**
 * What the köşk specs put in tedrisat's database (MDRS-174), under random ids
 * and a per-run tail in every name, and take out again: four köşks the way
 * nizam/09 draws them — one the signed-in köşk nazımı manages, one with two
 * nazımları, a hidden one, and an unlisted one the başnazım manages herself
 * ("Siz"). Direct SQL: the API only writes what the screens ask, and nothing
 * seeds a köşk that was hidden last week. A köşk a spec opens through the
 * screen carries the tail in its name too, so `remove` takes it away with the
 * rest.
 */
export interface KoskFixture {
  tail: string;
  beyazit: { id: string; name: string; handle: string };
  fatih: { id: string; name: string; handle: string };
  kalender: { id: string; name: string; handle: string };
  uskudar: { id: string; name: string; handle: string };
  people: { omer: string; abdullah: string };
  /** the köşks of the table by status, over the whole database: the tabs' numbers */
  counts: () => Promise<{
    all: number;
    active: number;
    passive: number;
    hidden: number;
  }>;
  kosk: (id: string) => Promise<{
    name: string;
    handle: string | null;
    field: string | null;
    level: string | null;
    tags: string[];
    description: string | null;
    isPrivate: boolean;
    hidden: boolean;
    alwaysRequireApproval: boolean;
    recordingsNeverPublic: boolean;
    coverHue: number;
  } | null>;
  /** a köşk made through the screen, found by its name */
  koskByName: (name: string) => Promise<{ id: string } | null>;
  /** who holds KOSK_NAZIM now, oldest first */
  nazims: (
    koskId: string
  ) => Promise<{ userId: string; grantedBy: string; endsAt: Date | null }[]>;
  audits: (action: string) => Promise<number>;
  remove: () => Promise<void>;
}

export async function seedKosks(subs: {
  /** the köşk nazımı the specs sign in as */
  nazim: string;
  /** the Medaris başnazımı */
  chief: string;
}): Promise<KoskFixture> {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) throw new Error("E2E_DATABASE_URL is not set.");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const tail = randomUUID().slice(0, 8);
  const mk = (label: string, ascii: string) => ({
    id: randomUUID(),
    name: `E2E ${label} Köşkü ${tail}`,
    handle: `e2e-${ascii}-${tail}`,
  });
  const beyazit = mk("Beyazıt", "beyazit");
  const fatih = mk("Fatih", "fatih");
  const kalender = mk("Kalenderhane", "kalenderhane");
  const uskudar = mk("Üsküdar", "uskudar");
  const people = { omer: randomUUID(), abdullah: randomUUID() };

  try {
    await client.query("begin");
    await client.query(
      `insert into users(id, given_name, family_name, email) values
        ($1, 'Ömer Nasuhi', 'Bilmenoğlu', $3),
        ($2, 'Abdullah Nuri', 'Gezginoğlu', $4)`,
      [
        people.omer,
        people.abdullah,
        `omer.${tail}@example.test`,
        `abdullah.${tail}@example.test`,
      ]
    );
    await client.query(
      `insert into kosks(id, owner_id, name, handle, field, level, is_private, cover_hue, archived_at, archived_by) values
        ($1, $5, $6, $10, 'Hadis', 'BEGINNER', false, 155, null, null),
        ($2, $5, $7, $11, 'Fıkıh', 'INTERMEDIATE', false, 20, null, null),
        ($3, $5, $8, $12, 'Belâgat', 'ADVANCED', false, 250, '2026-09-24T09:00:00Z', $5),
        ($4, $5, $9, $13, 'Kur''an ilimleri', 'ALL', true, 285, null, null)`,
      [
        beyazit.id,
        fatih.id,
        kalender.id,
        uskudar.id,
        subs.chief,
        beyazit.name,
        fatih.name,
        kalender.name,
        uskudar.name,
        beyazit.handle,
        fatih.handle,
        kalender.handle,
        uskudar.handle,
      ]
    );
    await client.query(
      `insert into role_assignments(user_id, role, scope_type, scope_id, granted_by, created_at) values
        ($1, 'KOSK_NAZIM', 'kosk', $5, $4, '2026-08-25T09:00:00Z'),
        ($2, 'KOSK_NAZIM', 'kosk', $6, $4, '2026-08-26T09:00:00Z'),
        ($3, 'KOSK_NAZIM', 'kosk', $6, $2, '2026-08-27T09:00:00Z'),
        ($3, 'KOSK_NAZIM', 'kosk', $7, $4, '2026-08-28T09:00:00Z'),
        ($4, 'KOSK_NAZIM', 'kosk', $8, $4, '2026-08-29T09:00:00Z')`,
      [
        subs.nazim,
        people.omer,
        people.abdullah,
        subs.chief,
        beyazit.id,
        fatih.id,
        kalender.id,
        uskudar.id,
      ]
    );
    // Two courses in the first, three in the second: nizam/09's Ders column.
    for (const [koskId, count] of [
      [beyazit.id, 2],
      [fatih.id, 3],
    ] as const) {
      for (let i = 0; i < count; i++) {
        await client.query(
          "insert into courses(kosk_id, author_id, title, status) values ($1, $2, $3, $4)",
          [
            koskId,
            subs.chief,
            `E2E Ders ${i + 1} ${tail}`,
            i === 1 ? "DRAFT" : "PUBLISHED",
          ]
        );
      }
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    await client.end();
    throw error;
  }

  const allIds = async (): Promise<string[]> =>
    (
      await client.query("select id from kosks where name like $1", [
        `%${tail}%`,
      ])
    ).rows.map((r) => r.id as string);

  return {
    tail,
    beyazit,
    fatih,
    kalender,
    uskudar,
    people,
    counts: async () => {
      const { rows } = await client.query(
        `select count(*) as all,
                count(*) filter (where archived_at is null and passive_since is null) as active,
                count(*) filter (where archived_at is null and passive_since is not null) as passive,
                count(*) filter (where archived_at is not null) as hidden
           from kosks`
      );
      const r = rows[0];
      return {
        all: Number(r.all),
        active: Number(r.active),
        passive: Number(r.passive),
        hidden: Number(r.hidden),
      };
    },
    kosk: async (id) => {
      const { rows } = await client.query(
        `select name, handle, field, level, tags, description, is_private,
                archived_at, always_require_approval, recordings_never_public, cover_hue
           from kosks where id = $1`,
        [id]
      );
      const r = rows[0];
      return r
        ? {
            name: r.name,
            handle: r.handle,
            field: r.field,
            level: r.level,
            tags: r.tags,
            description: r.description,
            isPrivate: r.is_private,
            hidden: r.archived_at !== null,
            alwaysRequireApproval: r.always_require_approval,
            recordingsNeverPublic: r.recordings_never_public,
            coverHue: r.cover_hue,
          }
        : null;
    },
    koskByName: async (name) => {
      const { rows } = await client.query(
        "select id from kosks where name = $1",
        [name]
      );
      return rows[0] ? { id: rows[0].id } : null;
    },
    nazims: async (koskId) => {
      const { rows } = await client.query(
        `select user_id, granted_by, expires_at from role_assignments
          where scope_id = $1 and role = 'KOSK_NAZIM' and revoked_at is null
          order by created_at, user_id`,
        [koskId]
      );
      return rows.map((r) => ({
        userId: r.user_id,
        grantedBy: r.granted_by,
        endsAt: r.expires_at,
      }));
    },
    audits: async (action) => {
      const ids = await allIds();
      const { rows } = await client.query(
        "select count(*) as n from audit_log where action = $1 and entity_id = any($2)",
        [action, ids]
      );
      return Number(rows[0].n);
    },
    remove: async () => {
      try {
        const ids = await allIds();
        await client.query("begin");
        await client.query("delete from audit_log where entity_id = any($1)", [
          ids,
        ]);
        await client.query(
          "delete from role_assignments where scope_id = any($1)",
          [ids]
        );
        await client.query(`delete from courses where kosk_id = any($1)`, [
          ids,
        ]);
        await client.query("delete from kosks where id = any($1)", [ids]);
        await client.query("delete from users where id = any($1)", [
          [people.omer, people.abdullah],
        ]);
        await client.query("commit");
      } finally {
        await client.end();
      }
    },
  };
}
