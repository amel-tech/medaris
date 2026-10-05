import pg from "pg";

/**
 * A Medaris nazımı for the length of a spec, on a database that may already
 * hold one.
 *
 * The account the specs sign in as holds a standing platform role in the shared
 * test database (the e2e seed gives it one), and a platform role is unique per
 * person: a spec that inserted its own row collided with it, and a spec that
 * deleted "its" row took the standing one away for every spec after it. Here a
 * spec takes the account in the state it needs and `release` gives back exactly
 * what was there:
 *
 * - the role row is inserted only when the person does not hold it, and only
 *   then deleted;
 * - the person's other live permissions in the platform and in every course
 *   (the ones a course grant without an id reaches) are set aside, so what the
 *   screen shows is the spec's `grants` and nothing else, and put back with
 *   their ids and dates.
 */
export interface MedarisGrant {
  code: string;
  /** where it is held: the platform (default) or every course */
  scope?: "platform" | "course";
}

export interface HeldMedarisNazim {
  release: () => Promise<void>;
}

const SET_ASIDE_COLUMNS = `id, user_id, scope_type, scope_id, permission, group_id,
  granted_by, authority_scope_type, created_at, expires_at`;

export async function holdMedarisNazim(
  sub: string,
  grants: MedarisGrant[] = [],
  grantedBy: string = sub
): Promise<HeldMedarisNazim> {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) throw new Error("E2E_DATABASE_URL is not set.");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  let roleId: string | null = null;
  const givenIds: string[] = [];
  let setAside: Record<string, unknown>[] = [];
  let released = false;
  try {
    await client.query("begin");
    await client.query(
      "insert into users(id, given_name, family_name, email) values ($1, 'E2E', 'Medaris', $2) on conflict (id) do nothing",
      [sub, `${sub.slice(0, 8)}@example.test`]
    );
    const inserted = await client.query(
      `insert into role_assignments(user_id, role, scope_type, granted_by)
       values ($1, 'MEDARIS_NAZIM', 'platform', $2)
       on conflict (user_id, role) where revoked_at is null and scope_id is null
       do nothing returning id`,
      [sub, grantedBy]
    );
    roleId = inserted.rows[0]?.id ?? null;
    setAside = (
      await client.query(
        `select ${SET_ASIDE_COLUMNS} from permission_grants
          where user_id = $1 and scope_id is null and revoked_at is null
            and scope_type in ('platform', 'course')`,
        [sub]
      )
    ).rows;
    if (setAside.length > 0) {
      await client.query("delete from permission_grants where id = any($1)", [
        setAside.map((row) => row.id),
      ]);
    }
    for (const grant of grants) {
      const { rows } = await client.query(
        `insert into permission_grants(user_id, scope_type, scope_id, permission, granted_by)
         values ($1, $2, null, $3, $4) returning id`,
        [sub, grant.scope ?? "platform", grant.code, grantedBy]
      );
      givenIds.push(rows[0].id);
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    await client.end();
    throw error;
  }
  return {
    release: async () => {
      if (released) return;
      released = true;
      try {
        await client.query("begin");
        if (givenIds.length > 0) {
          await client.query(
            "delete from permission_grants where id = any($1)",
            [givenIds]
          );
        }
        for (const row of setAside) {
          await client.query(
            `insert into permission_grants(${SET_ASIDE_COLUMNS})
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             on conflict (id) do nothing`,
            [
              row.id,
              row.user_id,
              row.scope_type,
              row.scope_id,
              row.permission,
              row.group_id,
              row.granted_by,
              row.authority_scope_type,
              row.created_at,
              row.expires_at,
            ]
          );
        }
        if (roleId) {
          await client.query("delete from role_assignments where id = $1", [
            roleId,
          ]);
        }
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
