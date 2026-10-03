import pg from "pg";

/**
 * What the notification specs put in tedrisat's database (MDRS-179): rows of
 * one person's notification list at known ages, so day groups, counts and
 * "Okundu say" can be driven without waiting for an event, and a Medaris
 * nazımı role row for the account that should be told of a ban. Direct SQL:
 * there is no endpoint that writes a notification for a test. The person's
 * own list is cleared first and last — the specs run against a throwaway
 * database, and a count read off a list needs the list to hold only these.
 */
export interface SeedNotification {
  type: string;
  /** how long ago, as a Postgres interval: "5 minutes", "1 day" */
  ago: string;
  read?: boolean;
  koskId?: string | null;
  params?: Record<string, string>;
}

export interface NotificationSeed {
  /** the ids of the rows, in the order given */
  ids: string[];
  /** the person's notifications in the database now: unread first */
  rows: () => Promise<{ type: string; unread: boolean; params: unknown }[]>;
  remove: () => Promise<void>;
}

const connect = async () => {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) throw new Error("E2E_DATABASE_URL is not set.");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  return client;
};

export async function seedNotifications(
  userId: string,
  items: SeedNotification[]
): Promise<NotificationSeed> {
  const client = await connect();
  await client.query("delete from notifications where user_id = $1", [userId]);
  const ids: string[] = [];
  for (const item of items) {
    const { rows } = await client.query(
      `insert into notifications(user_id, type, target_type, target_id, params, read_at, created_at)
       values ($1, $2, $3, $4, $5::jsonb,
               case when $6::boolean then now() else null end,
               date_trunc('milliseconds', now() - $7::interval))
       returning id`,
      [
        userId,
        item.type,
        item.koskId ? "KOSK" : null,
        item.koskId ?? null,
        JSON.stringify(item.params ?? {}),
        item.read ?? false,
        item.ago,
      ]
    );
    ids.push(rows[0].id);
  }
  return {
    ids,
    rows: async () => {
      const { rows } = await client.query(
        "select type, read_at is null as unread, params from notifications where user_id = $1 order by created_at desc",
        [userId]
      );
      return rows;
    },
    remove: async () => {
      await client.query("delete from notifications where user_id = $1", [
        userId,
      ]);
      await client.end();
    },
  };
}

/**
 * Makes `sub` a Medaris nazımı for the length of a spec; `remove` takes the
 * row out only when this call put it in, and clears the person's list.
 */
export async function ensureMedarisNazim(sub: string): Promise<{
  remove: () => Promise<void>;
}> {
  const client = await connect();
  const { rows } = await client.query(
    "select 1 from role_assignments where user_id = $1 and role = 'MEDARIS_NAZIM' and scope_type = 'platform' and revoked_at is null",
    [sub]
  );
  let inserted: string | null = null;
  if (rows.length === 0) {
    await client.query(
      "insert into users(id, given_name, family_name, email) values ($1, 'E2E', 'Medaris', $2) on conflict (id) do nothing",
      [sub, `${sub.slice(0, 8)}@example.test`]
    );
    const res = await client.query(
      "insert into role_assignments(user_id, role, scope_type, granted_by) values ($1, 'MEDARIS_NAZIM', 'platform', $1) returning id",
      [sub]
    );
    inserted = res.rows[0].id;
  }
  await client.query("delete from notifications where user_id = $1", [sub]);
  return {
    remove: async () => {
      await client.query("delete from notifications where user_id = $1", [sub]);
      if (inserted) {
        await client.query("delete from role_assignments where id = $1", [
          inserted,
        ]);
      }
      await client.end();
    },
  };
}
