import type { ConnectionOptions } from "node:tls";

/**
 * Resolves the `ssl` option handed to `pg`.
 *
 * `DB_SSL=true` used to produce `{ rejectUnauthorized: false }`, which encrypts
 * the connection but authenticates nothing — any server able to answer on the
 * host:port is trusted. Verification is now always on; a private CA is supplied
 * through `DB_CA_CERT` (a PEM bundle), and without it the platform trust store
 * applies.
 *
 * Shared with drizzle.config.ts so the migration client and the runtime pool
 * cannot drift apart.
 */
export function resolveDatabaseSsl(
  env: NodeJS.ProcessEnv = process.env
): ConnectionOptions | false {
  if (env.DB_SSL !== "true") {
    return false;
  }

  const ca = env.DB_CA_CERT;

  if (!ca) {
    return { rejectUnauthorized: true };
  }

  // A PEM is multi-line, and the usual delivery paths for one — an unquoted
  // dotenv value, docker-compose `environment:`, several CI secret UIs — hand
  // it over with literal backslash-n instead of newlines. Left as-is, `tls`
  // rejects it with `PEM routines: NO_START_LINE`, which reads like a broken
  // certificate rather than a broken variable.
  return { rejectUnauthorized: true, ca: ca.replace(/\\n/g, "\n") };
}
