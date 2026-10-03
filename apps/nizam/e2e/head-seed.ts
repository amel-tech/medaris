import { randomUUID } from "node:crypto";
import pg from "pg";

/**
 * What the "Başmüderrisi değiştir" specs put in tedrisat's database
 * (MDRS-172, nizam/22), under random ids and a per-run tail in every name, and
 * take out again: a medrese with a başmüderris who handed on a nazır role, a
 * single permission and a group to two people, and a passive medrese with no
 * başmüderris at all. Direct SQL: the API only writes what the screens ask,
 * and nothing seeds a hand-on made by somebody else last month.
 */
export interface HeadFixture {
  tail: string;
  active: { id: string; name: string };
  passive: { id: string; name: string };
  head: { id: string; name: string };
  /** what the head handed on, in the order given */
  handedOn: {
    role: { id: string; person: string };
    permission: { id: string; person: string };
    group: { id: string; person: string; name: string };
  };
  chief: string;
  /** who heads the medrese now, and until when */
  heads: (
    madrasahId: string
  ) => Promise<{ userId: string; expiresAt: Date | null }[]>;
  rowState: (
    kind: "ROLE" | "GRANT",
    id: string
  ) => Promise<{ grantedBy: string; revoked: boolean }>;
  audits: (action: string) => Promise<number>;
  lastAudit: (action: string) => Promise<Record<string, unknown> | null>;
  remove: () => Promise<void>;
}

export async function seedHead(chief: string): Promise<HeadFixture> {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) throw new Error("E2E_DATABASE_URL is not set.");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const tail = randomUUID().slice(0, 8);
  const startedAt = new Date();
  const ids = {
    active: randomUUID(),
    passive: randomUUID(),
    head: randomUUID(),
    fatma: randomUUID(),
    seyyid: randomUUID(),
    role: randomUUID(),
    grant: randomUUID(),
    groupGrant: randomUUID(),
    group: randomUUID(),
  };
  const active = { id: ids.active, name: `E2E Süleymaniye Medresesi ${tail}` };
  const passive = { id: ids.passive, name: `E2E Zeyrek Medresesi ${tail}` };
  const head = { id: ids.head, name: "Mehmet Emin Işıkoğlu" };
  const groupName = `E2E Ders açma ve kadro ${tail}`;
  const email = (id: string) => `${id.slice(0, 8)}.${tail}@example.test`;

  try {
    await client.query("begin");
    await client.query(
      `insert into users(id, given_name, family_name, email) values
        ($1, 'Mehmet Emin', 'Işıkoğlu', $4), ($2, 'Fatma Zehra', 'Çelebioğlu', $5),
        ($3, 'Seyyid Ahmet', 'Kocabeyoğlu', $6)`,
      [
        ids.head,
        ids.fatma,
        ids.seyyid,
        email(ids.head),
        email(ids.fatma),
        email(ids.seyyid),
      ]
    );
    await client.query(
      `insert into madrasahs(id, handle, name, created_by, passive_since, passive_reason) values
        ($1, $3, $4, $7, null, null),
        ($2, $5, $6, $7, '2026-09-27T09:00:00Z', 'TERM_ENDED')`,
      [
        ids.active,
        ids.passive,
        `e2e-suleymaniye-${tail}`,
        active.name,
        `e2e-zeyrek-${tail}`,
        passive.name,
        chief,
      ]
    );
    await client.query(
      `insert into role_assignments(user_id, role, scope_type, scope_id, granted_by) values
        ($1, 'MEDRESE_BASMUDERRIS', 'madrasah', $2, $3)`,
      [ids.head, ids.active, chief]
    );
    // What the head handed on: a nazır role (12 Eylül, no end), one permission, one group.
    await client.query(
      `insert into role_assignments(id, user_id, role, scope_type, scope_id, granted_by, created_at) values
        ($1, $2, 'MEDRESE_NAZIR', 'madrasah', $3, $4, '2026-09-12T09:00:00Z')`,
      [ids.role, ids.fatma, ids.active, ids.head]
    );
    await client.query(
      `insert into permission_groups(id, scope_type, scope_id, name, created_by) values ($1, 'madrasah', $2, $3, $4)`,
      [ids.group, ids.active, groupName, ids.head]
    );
    await client.query(
      `insert into permission_group_items(group_id, permission) values ($1, 'platform.madrasah_edit'), ($1, 'platform.madrasah_nazir_grant')`,
      [ids.group]
    );
    await client.query(
      `insert into permission_grants(id, user_id, scope_type, scope_id, permission, group_id, granted_by, created_at) values
        ($1, $3, 'madrasah', $5, 'platform.madrasah_nazir_grant', null, $6, '2026-09-13T09:00:00Z'),
        ($2, $4, 'madrasah', $5, null, $7, $6, '2026-09-14T09:00:00Z')`,
      [
        ids.grant,
        ids.groupGrant,
        ids.fatma,
        ids.seyyid,
        ids.active,
        ids.head,
        ids.group,
      ]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    await client.end();
    throw error;
  }

  const madrasahIds = [ids.active, ids.passive];
  const people = [ids.head, ids.fatma, ids.seyyid];

  return {
    tail,
    active,
    passive,
    head,
    handedOn: {
      role: { id: ids.role, person: "Fatma Zehra Çelebioğlu" },
      permission: { id: ids.grant, person: "Fatma Zehra Çelebioğlu" },
      group: {
        id: ids.groupGrant,
        person: "Seyyid Ahmet Kocabeyoğlu",
        name: groupName,
      },
    },
    chief,
    heads: async (madrasahId) =>
      (
        await client.query(
          `select user_id, expires_at from role_assignments
            where scope_id = $1 and role = 'MEDRESE_BASMUDERRIS' and revoked_at is null
              and (expires_at is null or expires_at > now())`,
          [madrasahId]
        )
      ).rows.map((r: { user_id: string; expires_at: Date | null }) => ({
        userId: r.user_id,
        expiresAt: r.expires_at,
      })),
    rowState: async (kind, id) => {
      const {
        rows: [row],
      } = await client.query(
        kind === "ROLE"
          ? "select granted_by, revoked_at is not null as revoked from role_assignments where id = $1"
          : "select granted_by, revoked_at is not null as revoked from permission_grants where id = $1",
        [id]
      );
      return { grantedBy: row.granted_by, revoked: row.revoked };
    },
    audits: async (action) =>
      Number(
        (
          await client.query(
            "select count(*) from audit_log where action = $1 and created_at >= $2",
            [action, startedAt]
          )
        ).rows[0].count
      ),
    lastAudit: async (action) =>
      (
        await client.query(
          "select details from audit_log where action = $1 and created_at >= $2 order by created_at desc limit 1",
          [action, startedAt]
        )
      ).rows[0]?.details ?? null,
    remove: async () => {
      try {
        await client.query("begin");
        await client.query(
          "delete from permission_grants where scope_id = any($1)",
          [madrasahIds]
        );
        await client.query(
          "delete from permission_group_items where group_id = $1",
          [ids.group]
        );
        await client.query("delete from permission_groups where id = $1", [
          ids.group,
        ]);
        await client.query(
          "delete from role_assignments where scope_id = any($1)",
          [madrasahIds]
        );
        await client.query("delete from madrasahs where id = any($1)", [
          madrasahIds,
        ]);
        await client.query("delete from users where id = any($1)", [people]);
        await client.query(
          `delete from audit_log where created_at >= $1
             and (action like 'madrasah.%' or action = 'user.lookup')`,
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
