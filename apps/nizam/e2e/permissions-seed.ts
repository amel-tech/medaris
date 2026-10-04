import { randomUUID } from "node:crypto";
import pg from "pg";
import { type HeldMedarisNazim, holdMedarisNazim } from "./medaris-nazim";

/**
 * What the Medaris nazımları and İzin grupları specs put in tedrisat's
 * database (MDRS-171), under random ids, and take out again: the three
 * nazımları of nizam/11 (a group and single permissions, an end within 30
 * days, no end at all), a fourth whose appointment has lapsed, three groups
 * (two for the platform, one for every course) and a köşk nazımı the first
 * nazım appointed, so that dismissing them has something to ask about. Direct
 * SQL: the API only writes what the screens ask, and nothing seeds a lapsed
 * appointment or a role someone else gave.
 */
export interface PermissionsFixture {
  tail: string;
  hasan: { id: string; name: string; email: string };
  rabia: { id: string; name: string; email: string };
  seyyid: { id: string; name: string; email: string };
  lapsed: { id: string; name: string };
  groups: {
    koskIsleri: { id: string; name: string };
    denetim: { id: string; name: string };
    dersDenetimi: { id: string; name: string };
  };
  koskName: string;
  /** the köşk nazımı Hasan appointed */
  handedOn: { id: string; name: string; roleRowId: string };
  /** the platform's Medaris nazımı rows held now, by person */
  heldNazim: (userId: string) => Promise<boolean>;
  grantsOf: (userId: string) => Promise<
    Array<{
      permission: string | null;
      groupId: string | null;
      revoked: boolean;
    }>
  >;
  groupByName: (
    name: string
  ) => Promise<{ id: string; deleted: boolean; items: string[] } | null>;
  audits: (action: string) => Promise<number>;
  roleGrantedBy: (rowId: string) => Promise<{
    grantedBy: string;
    revoked: boolean;
  }>;
  /** a MEDARIS_NAZIM role for the account, taken out with the rest */
  makeMedarisNazim: (sub: string) => Promise<void>;
  /** removes a person the spec appointed through the screen */
  forget: (userId: string) => Promise<void>;
  /** the kept `users` rows that are not ours: the account a spec appoints */
  remove: () => Promise<void>;
}

export async function seedPermissions(): Promise<PermissionsFixture> {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) throw new Error("E2E_DATABASE_URL is not set.");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const tail = randomUUID().slice(0, 8);
  const ids = {
    admin: randomUUID(),
    hasan: randomUUID(),
    rabia: randomUUID(),
    seyyid: randomUUID(),
    lapsed: randomUUID(),
    handed: randomUUID(),
    kosk: randomUUID(),
    koskIsleri: randomUUID(),
    denetim: randomUUID(),
    dersDenetimi: randomUUID(),
  };
  const mk = (id: string, name: string) => ({
    id,
    name,
    email: `${name.split(" ")[0]?.toLowerCase()}.${tail}@example.test`,
  });
  const hasan = mk(ids.hasan, "Hasan Basri Gündoğdu");
  const rabia = mk(ids.rabia, "Rabia Hümeyra Tokatlıoğlu");
  const seyyid = mk(ids.seyyid, "Seyyid Ahmet Kocabeyoğlu");
  const lapsed = { id: ids.lapsed, name: "Ayşe Nur Kılıçarslan" };
  const handed = {
    id: ids.handed,
    name: "Mehmet Emin Işıkoğlu",
    roleRowId: randomUUID(),
  };
  const groups = {
    koskIsleri: { id: ids.koskIsleri, name: `E2E Köşk işleri ${tail}` },
    denetim: { id: ids.denetim, name: `E2E Denetim ${tail}` },
    dersDenetimi: { id: ids.dersDenetimi, name: `E2E Ders denetimi ${tail}` },
  };
  const koskName = `E2E Nûruosmaniye Köşkü ${tail}`;
  const extraUsers: string[] = [];
  const medarisNazims: HeldMedarisNazim[] = [];

  // Appointed 14, 15 and 22 September; the second ends in 14 days.
  const inDays = (n: number) =>
    new Date(Date.now() + n * 24 * 3600 * 1000).toISOString();

  try {
    await client.query("begin");
    await client.query(
      `insert into users(id, given_name, family_name, email) values
        ($1, 'Yusuf Ziya', 'Ertuğrul', $2),
        ($3, 'Hasan Basri', 'Gündoğdu', $4),
        ($5, 'Rabia Hümeyra', 'Tokatlıoğlu', $6),
        ($7, 'Seyyid Ahmet', 'Kocabeyoğlu', $8),
        ($9, 'Ayşe Nur', 'Kılıçarslan', $10),
        ($11, 'Mehmet Emin', 'Işıkoğlu', $12)`,
      [
        ids.admin,
        `yusuf.${tail}@example.test`,
        hasan.id,
        hasan.email,
        rabia.id,
        rabia.email,
        seyyid.id,
        seyyid.email,
        lapsed.id,
        `ayse.${tail}@example.test`,
        handed.id,
        `mehmet.${tail}@example.test`,
      ]
    );
    await client.query(
      `insert into permission_groups(id, scope_type, name, created_by) values
        ($1, 'platform', $4, $7), ($2, 'platform', $5, $7), ($3, 'course', $6, $7)`,
      [
        groups.koskIsleri.id,
        groups.denetim.id,
        groups.dersDenetimi.id,
        groups.koskIsleri.name,
        groups.denetim.name,
        groups.dersDenetimi.name,
        ids.admin,
      ]
    );
    await client.query(
      `insert into permission_group_items(group_id, permission) values
        ($1, 'platform.kosk_create'), ($1, 'platform.kosk_nazim_manage'),
        ($1, 'platform.hosting_grant'), ($1, 'platform.kosk_application_decide'),
        ($2, 'platform.audit_read'), ($2, 'platform.policy_edit'),
        ($3, 'course.edit'), ($3, 'course.publish'), ($3, 'ban.course')`,
      [groups.koskIsleri.id, groups.denetim.id, groups.dersDenetimi.id]
    );
    await client.query(
      `insert into role_assignments(user_id, role, scope_type, granted_by, created_at, expires_at) values
        ($1, 'MEDARIS_NAZIM', 'platform', $5, '2026-09-14T09:00:00Z', '2026-12-31T20:59:59Z'),
        ($2, 'MEDARIS_NAZIM', 'platform', $5, '2026-09-15T09:00:00Z', $6),
        ($3, 'MEDARIS_NAZIM', 'platform', $5, '2026-09-22T09:00:00Z', null),
        ($4, 'MEDARIS_NAZIM', 'platform', $5, '2026-08-01T09:00:00Z', '2026-09-01T09:00:00Z')`,
      [hasan.id, rabia.id, seyyid.id, lapsed.id, ids.admin, inDays(14)]
    );
    await client.query(
      `insert into permission_grants(user_id, scope_type, scope_id, permission, group_id, granted_by, created_at, expires_at) values
        ($1, 'platform', null, null, $4, $5, '2026-09-14T09:00:00Z', '2026-12-31T20:59:59Z'),
        ($1, 'course', null, null, $6, $5, '2026-09-14T09:00:00Z', '2026-12-31T20:59:59Z'),
        ($1, 'platform', null, 'platform.madrasah_create', null, $5, '2026-09-14T09:00:00Z', '2026-12-31T20:59:59Z'),
        ($1, 'platform', null, 'platform.deck_publish', null, $5, '2026-09-14T09:00:00Z', '2026-12-31T20:59:59Z'),
        ($1, 'platform', null, 'platform.ban_account', null, $5, '2026-09-30T13:12:00Z', '2026-12-31T20:59:59Z'),
        ($2, 'platform', null, null, $7, $5, '2026-09-15T09:00:00Z', $8),
        ($3, 'course', null, null, $6, $5, '2026-09-22T09:00:00Z', null),
        ($3, 'platform', null, 'platform.inactive_scopes_manage', null, $5, '2026-09-22T09:00:00Z', null),
        ($3, 'platform', null, 'platform.youtube_manage', null, $5, '2026-09-22T09:00:00Z', null)`,
      [
        hasan.id,
        rabia.id,
        seyyid.id,
        groups.koskIsleri.id,
        ids.admin,
        groups.dersDenetimi.id,
        groups.denetim.id,
        inDays(14),
      ]
    );
    await client.query(
      "insert into kosks(id, owner_id, name) values ($1, $2, $3)",
      [ids.kosk, hasan.id, koskName]
    );
    await client.query(
      "insert into role_assignments(id, user_id, role, scope_type, scope_id, granted_by) values ($1, $2, 'KOSK_NAZIM', 'kosk', $3, $4)",
      [handed.roleRowId, handed.id, ids.kosk, hasan.id]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    await client.end();
    throw error;
  }

  const allUsers = () => [
    ids.admin,
    hasan.id,
    rabia.id,
    seyyid.id,
    lapsed.id,
    handed.id,
    ...extraUsers,
  ];

  return {
    tail,
    hasan,
    rabia,
    seyyid,
    lapsed,
    groups,
    koskName,
    handedOn: handed,
    heldNazim: async (userId) =>
      (
        await client.query(
          `select 1 from role_assignments where user_id = $1 and role = 'MEDARIS_NAZIM'
             and revoked_at is null and (expires_at is null or expires_at > now())`,
          [userId]
        )
      ).rowCount === 1,
    grantsOf: async (userId) =>
      (
        await client.query(
          `select permission, group_id, revoked_at is not null as revoked
             from permission_grants where user_id = $1 order by created_at, id`,
          [userId]
        )
      ).rows.map(
        (r: {
          permission: string | null;
          group_id: string | null;
          revoked: boolean;
        }) => ({
          permission: r.permission,
          groupId: r.group_id,
          revoked: r.revoked,
        })
      ),
    groupByName: async (name) => {
      const {
        rows: [row],
      } = await client.query(
        "select id, deleted_at is not null as deleted from permission_groups where name = $1",
        [name]
      );
      if (!row) return null;
      const { rows: items } = await client.query(
        "select permission from permission_group_items where group_id = $1 order by permission",
        [row.id]
      );
      return {
        id: row.id,
        deleted: row.deleted,
        items: items.map((i: { permission: string }) => i.permission),
      };
    },
    audits: async (action) =>
      Number(
        (
          await client.query(
            "select count(*) from audit_log where action = $1",
            [action]
          )
        ).rows[0].count
      ),
    roleGrantedBy: async (rowId) => {
      const {
        rows: [row],
      } = await client.query(
        "select granted_by, revoked_at is not null as revoked from role_assignments where id = $1",
        [rowId]
      );
      return { grantedBy: row.granted_by, revoked: row.revoked };
    },
    makeMedarisNazim: async (sub) => {
      medarisNazims.push(await holdMedarisNazim(sub));
    },
    forget: async (userId) => {
      extraUsers.push(userId);
    },
    remove: async () => {
      try {
        for (const held of medarisNazims.reverse()) await held.release();
        const people = allUsers();
        await client.query(
          "delete from permission_grants where user_id = any($1) or granted_by = any($1) or group_id = any($2)",
          [
            people,
            [groups.koskIsleri.id, groups.denetim.id, groups.dersDenetimi.id],
          ]
        );
        await client.query(
          "delete from role_assignments where user_id = any($1) or granted_by = any($1)",
          [people]
        );
        // Groups the specs made have the tail in their name.
        await client.query(
          "delete from permission_group_items where group_id in (select id from permission_groups where name like $1)",
          [`%${tail}%`]
        );
        await client.query("delete from permission_groups where name like $1", [
          `%${tail}%`,
        ]);
        await client.query("delete from kosks where id = $1", [ids.kosk]);
        await client.query("delete from users where id = any($1)", [
          allUsers(),
        ]);
      } finally {
        await client.end();
      }
    },
  };
}
