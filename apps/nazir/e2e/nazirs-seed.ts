import { randomUUID } from "node:crypto";
import pg from "pg";
import type { NazirFixture } from "./seed";

/**
 * What the settings and nazır specs add to `seedPortal`'s medrese (MDRS-184),
 * under random ids, and take out again: the medrese's saved settings, a draft
 * and a hidden course next to its two published ones, and three nazırs of
 * nazir/05 — one with two groups and extra permissions, one with a group that
 * ends, one who holds nothing yet — together with what the first of them gave
 * away (a role in the medrese, a permission, a role in a course), which is
 * what nazir/15 asks about. Direct SQL: the API only writes what the screens
 * ask, and nothing seeds a role someone else gave.
 *
 * The permission specs (MDRS-185) read what the screens wrote back through
 * `heldGrants`, `groupRow` and `auditsOn`.
 */
export interface Person {
  id: string;
  name: string;
  email: string;
}

export interface NazirsFixture {
  tail: string;
  /** appointed the first two and gave their permissions */
  admin: Person;
  fatma: Person;
  ummugulsum: Person;
  /** appointed by Fatma, holds nothing */
  abdullah: Person;
  /** given a permission by Fatma */
  ayse: Person;
  /** given a role in the first course by Fatma */
  ders: Person;
  groups: { dersAcma: string; yasak: string; kayit: string };
  /** the end of Ümmügülsüm's group */
  endsAt: Date;
  draft: { id: string; title: string };
  hidden: { id: string; title: string };
  description: string;
  /** "Son değişiklik" as seeded */
  lastChange: { by: Person };
  settingsRow: () => Promise<{
    policies: Record<string, boolean>;
    updatedBy: string;
  } | null>;
  medreseName: () => Promise<{ name: string; description: string | null }>;
  audits: (action: string) => Promise<number>;
  /** the role row a person holds (or held) in a scope */
  roleRow: (
    userId: string,
    role: string,
    scopeId: string
  ) => Promise<{ grantedBy: string; revoked: boolean } | null>;
  grantRow: (
    userId: string,
    permission: string
  ) => Promise<{ grantedBy: string; revoked: boolean } | null>;
  /** the permission rows a person holds now (not revoked, not ended), anywhere in the medrese and its courses */
  heldGrants: (userId: string) => Promise<
    Array<{
      scopeType: string;
      scopeId: string;
      groupId: string | null;
      permission: string | null;
      expiresAt: Date | null;
    }>
  >;
  /** a group of the medrese by name: its permissions, and whether it has been deleted */
  groupRow: (
    name: string
  ) => Promise<{ id: string; permissions: string[]; deleted: boolean } | null>;
  /** the audit rows of an action on an entity (a person, a group) */
  auditsOn: (action: string, entityId: string) => Promise<number>;
  /** takes a person a spec appointed through the screen out of the medrese again */
  forget: (userId: string) => Promise<void>;
  remove: () => Promise<void>;
}

export async function seedNazirs(base: NazirFixture): Promise<NazirsFixture> {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) throw new Error("E2E_DATABASE_URL is not set.");
  const client = new pg.Client({ connectionString: url });
  await client.connect();

  const tail = randomUUID().slice(0, 8);
  const person = (given: string, family: string, key: string): Person => ({
    id: randomUUID(),
    name: `${given} ${family}`,
    email: `${key}.${tail}@example.test`,
  });
  const admin = person("Yusuf Ziya", "Ertuğrul", "yusuf");
  const fatma = person("Fatma Zehra", "Çelebioğlu", "fz");
  const ummugulsum = person("Ümmügülsüm Nur", "Hacıosmanoğlu", "uh");
  const abdullah = person("Abdullah Talha", "Erzurumluoğlu", "ae");
  const ayse = person("Ayşe Nur", "Kılıçarslan", "ayse");
  const ders = person("Hatice Kübra", "Aydınoğlu", "hk");
  const people = [admin, fatma, ummugulsum, abdullah, ayse, ders];

  const groups = {
    dersAcma: `E2E Ders açma ve kadro ${tail}`,
    yasak: `E2E Yasak ve itiraz ${tail}`,
    kayit: `E2E Kayıt ve talebe işleri ${tail}`,
  };
  const groupIds = {
    dersAcma: randomUUID(),
    yasak: randomUUID(),
    kayit: randomUUID(),
  };
  const draft = { id: randomUUID(), title: `E2E Maksûd şerhi ${tail}` };
  const hidden = { id: randomUUID(), title: `E2E Gizli ders ${tail}` };
  const description = "Klasik medrese müfredatını çevrim içi sürdürür.";
  const day = 24 * 3600 * 1000;
  const endsAt = new Date(Date.now() + 90 * day);
  const yesterday = new Date(Date.now() - day);
  const madrasahId = base.madrasah.id;

  try {
    await client.query("begin");
    await client.query(
      `insert into users(id, given_name, family_name, email) values
        ($1, 'Yusuf Ziya', 'Ertuğrul', $2),
        ($3, 'Fatma Zehra', 'Çelebioğlu', $4),
        ($5, 'Ümmügülsüm Nur', 'Hacıosmanoğlu', $6),
        ($7, 'Abdullah Talha', 'Erzurumluoğlu', $8),
        ($9, 'Ayşe Nur', 'Kılıçarslan', $10),
        ($11, 'Hatice Kübra', 'Aydınoğlu', $12)`,
      people.flatMap((p) => [p.id, p.email])
    );
    await client.query("update madrasahs set description = $2 where id = $1", [
      madrasahId,
      description,
    ]);
    await client.query(
      `insert into madrasah_settings(madrasah_id, policy_always_approval, updated_at, updated_by)
        values ($1, true, '2026-09-29T09:00:00Z', $2)`,
      [madrasahId, admin.id]
    );
    // A draft and a hidden course beside the two published ones: the list on
    // the right of nazir/04 has the first, never the second.
    await client.query(
      `insert into courses(id, kosk_id, madrasah_id, author_id, title, status) values
        ($1, $2, $3, $4, $5, 'DRAFT')`,
      [draft.id, base.koskId, madrasahId, admin.id, draft.title]
    );
    await client.query(
      `insert into courses(id, kosk_id, madrasah_id, author_id, title, status, archived_at) values
        ($1, $2, $3, $4, $5, 'PUBLISHED', now())`,
      [hidden.id, base.koskId, madrasahId, admin.id, hidden.title]
    );

    await client.query(
      `insert into permission_groups(id, scope_type, scope_id, name, created_by) values
        ($1, 'madrasah', $4, $5, $7), ($2, 'madrasah', $4, $6, $7), ($3, 'madrasah', $4, $8, $7)`,
      [
        groupIds.dersAcma,
        groupIds.yasak,
        groupIds.kayit,
        madrasahId,
        groups.dersAcma,
        groups.yasak,
        admin.id,
        groups.kayit,
      ]
    );
    await client.query(
      `insert into permission_group_items(group_id, permission) values
        ($1, 'course.edit'), ($1, 'session.manage'),
        ($2, 'ban.course'), ($2, 'ban.lift_course'), ($2, 'enrollment.remove'),
        ($3, 'enrollment.decide'), ($3, 'enrollment.complete')`,
      [groupIds.dersAcma, groupIds.yasak, groupIds.kayit]
    );

    // Appointed 12, 20 and 30 September; the third by the first. Fatma's grants
    // are a second apart, so that the API's order (oldest first) is not a coin toss.
    await client.query(
      `insert into role_assignments(user_id, role, scope_type, scope_id, granted_by, created_at) values
        ($1, 'MEDRESE_NAZIR', 'madrasah', $4, $5, '2026-09-12T09:00:00Z'),
        ($2, 'MEDRESE_NAZIR', 'madrasah', $4, $5, '2026-09-20T09:00:00Z'),
        ($3, 'MEDRESE_NAZIR', 'madrasah', $4, $1, '2026-09-30T09:00:00Z')`,
      [fatma.id, ummugulsum.id, abdullah.id, madrasahId, admin.id]
    );
    // What Fatma gave away besides Abdullah's role: a role in a course.
    await client.query(
      `insert into role_assignments(user_id, role, scope_type, scope_id, granted_by, created_at)
        values ($1, 'DERS_NAZIR', 'course', $2, $3, '2026-09-25T09:00:00Z')`,
      [ders.id, base.first.id, fatma.id]
    );
    await client.query(
      `insert into permission_grants(user_id, scope_type, scope_id, group_id, permission, granted_by, created_at, expires_at) values
        ($1, 'madrasah', $5, $6, null, $9, '2026-09-12T09:00:00Z', null),
        ($1, 'madrasah', $5, $7, null, $9, '2026-09-12T09:00:01Z', null),
        ($1, 'madrasah', $5, null, 'course.edit', $9, '2026-09-12T09:00:02Z', null),
        ($1, 'madrasah', $5, null, 'week.hide', $9, '2026-09-12T09:00:03Z', null),
        ($1, 'madrasah', $5, null, 'course.publish', $9, '2026-09-12T09:00:04Z', null),
        ($2, 'madrasah', $5, $8, null, $9, '2026-09-20T09:00:00Z', $10),
        ($2, 'madrasah', $5, null, 'recording.upload', $9, '2026-09-20T09:00:00Z', $11),
        ($3, 'madrasah', $5, null, 'enrollment.decide', $4, '2026-09-26T09:00:00Z', null)`,
      [
        fatma.id,
        ummugulsum.id,
        ayse.id,
        fatma.id,
        madrasahId,
        groupIds.dersAcma,
        groupIds.yasak,
        groupIds.kayit,
        admin.id,
        endsAt.toISOString(),
        yesterday.toISOString(),
      ]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    await client.end();
    throw error;
  }

  return {
    tail,
    admin,
    fatma,
    ummugulsum,
    abdullah,
    ayse,
    ders,
    groups,
    endsAt,
    draft,
    hidden,
    description,
    lastChange: { by: admin },
    settingsRow: async () => {
      const { rows } = await client.query(
        `select policy_closed_course_required as closed, policy_always_approval as approval,
          policy_no_public_recordings as recordings, updated_by
         from madrasah_settings where madrasah_id = $1`,
        [madrasahId]
      );
      const row = rows[0];
      return row
        ? {
            policies: {
              closedCourseRequired: row.closed,
              alwaysApproval: row.approval,
              noPublicRecordings: row.recordings,
            },
            updatedBy: row.updated_by,
          }
        : null;
    },
    medreseName: async () => {
      const { rows } = await client.query(
        "select name, description from madrasahs where id = $1",
        [madrasahId]
      );
      return rows[0];
    },
    audits: async (action) => {
      const { rows } = await client.query(
        "select count(*)::int as n from audit_log where action = $1 and entity_id = $2",
        [action, madrasahId]
      );
      return rows[0].n;
    },
    roleRow: async (userId, role, scopeId) => {
      const { rows } = await client.query(
        `select granted_by, revoked_at is not null as revoked from role_assignments
         where user_id = $1 and role = $2 and scope_id = $3
         order by created_at desc limit 1`,
        [userId, role, scopeId]
      );
      return rows[0]
        ? { grantedBy: rows[0].granted_by, revoked: rows[0].revoked }
        : null;
    },
    grantRow: async (userId, permission) => {
      const { rows } = await client.query(
        `select granted_by, revoked_at is not null as revoked from permission_grants
         where user_id = $1 and permission = $2 and scope_id = $3
         order by created_at desc limit 1`,
        [userId, permission, madrasahId]
      );
      return rows[0]
        ? { grantedBy: rows[0].granted_by, revoked: rows[0].revoked }
        : null;
    },
    heldGrants: async (userId) => {
      const { rows } = await client.query(
        `select scope_type, scope_id, group_id, permission, expires_at from permission_grants
         where user_id = $1 and revoked_at is null
           and (expires_at is null or expires_at > now())
         order by created_at, permission`,
        [userId]
      );
      return rows.map((row) => ({
        scopeType: row.scope_type,
        scopeId: row.scope_id,
        groupId: row.group_id,
        permission: row.permission,
        expiresAt: row.expires_at,
      }));
    },
    groupRow: async (name) => {
      const { rows } = await client.query(
        `select g.id, g.deleted_at is not null as deleted,
          coalesce(array_agg(i.permission order by i.permission) filter (where i.permission is not null), '{}') as permissions
         from permission_groups g left join permission_group_items i on i.group_id = g.id
         where g.scope_id = $1 and g.name = $2
         group by g.id order by g.created_at desc limit 1`,
        [madrasahId, name]
      );
      return rows[0]
        ? {
            id: rows[0].id,
            permissions: rows[0].permissions,
            deleted: rows[0].deleted,
          }
        : null;
    },
    auditsOn: async (action, entityId) => {
      const { rows } = await client.query(
        "select count(*)::int as n from audit_log where action = $1 and entity_id = $2",
        [action, entityId]
      );
      return rows[0].n;
    },
    forget: async (userId) => {
      await client.query(
        "delete from role_assignments where user_id = $1 and scope_id = $2",
        [userId, madrasahId]
      );
    },
    remove: async () => {
      const ids = people.map((p) => p.id);
      try {
        await client.query("begin");
        await client.query(
          "delete from permission_grants where scope_id = $1 or user_id = any($2)",
          [madrasahId, ids]
        );
        // the audit rows of the groups the specs defined, before the groups go
        await client.query(
          `delete from audit_log where entity_id = any($1) or entity_id in (
             select id from permission_groups where scope_id = $2)`,
          [ids, madrasahId]
        );
        await client.query(
          "delete from permission_groups where scope_id = $1",
          [madrasahId]
        );
        await client.query(
          "delete from role_assignments where user_id = any($1) or granted_by = any($1)",
          [ids]
        );
        await client.query(
          "delete from madrasah_settings where madrasah_id = $1",
          [madrasahId]
        );
        await client.query("delete from courses where id = any($1)", [
          [draft.id, hidden.id],
        ]);
        await client.query("delete from users where id = any($1)", [ids]);
        await client.query("delete from audit_log where entity_id = $1", [
          madrasahId,
        ]);
        await client.query("commit");
      } finally {
        await client.end();
      }
    },
  };
}
