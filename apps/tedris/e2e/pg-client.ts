import pg from "pg";

/** A connected client on the database tedrisat uses, for a spec that changes a row. */
export async function pgClient(): Promise<pg.Client> {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) throw new Error("E2E_DATABASE_URL is not set.");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  return client;
}
