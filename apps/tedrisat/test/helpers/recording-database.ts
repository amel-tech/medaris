import { drizzle } from "drizzle-orm/node-postgres";
import type { DatabaseService } from "../../src/database/database.service";
import * as schema from "../../src/database/schema";

export interface RecordedQuery {
  text: string;
  values: unknown[];
}

/**
 * A real drizzle instance over a stand-in for the `pg` client: it records the
 * SQL and parameters drizzle builds and answers each statement with the rows
 * `rowsFor` returns, as arrays in column order (drizzle selects with
 * `rowMode: "array"`). Nothing connects to anything, so a repository's query
 * can be asserted on without a Postgres container.
 *
 * Postgres returns `count(*)` as a bigint string, so pass numbers as strings
 * where the point is that the repository coerces them.
 */
export function recordingDatabase(rowsFor: (text: string) => unknown[][]): {
  databaseService: DatabaseService;
  queries: RecordedQuery[];
} {
  const queries: RecordedQuery[] = [];
  const client = {
    query: async (config: { text: string }, values: unknown[] = []) => {
      queries.push({ text: config.text, values });
      return { rows: rowsFor(config.text), rowCount: 0, fields: [] };
    },
  };
  const db = drizzle(client as never, { schema });
  return { databaseService: { db } as unknown as DatabaseService, queries };
}
