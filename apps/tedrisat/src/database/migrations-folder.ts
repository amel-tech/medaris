import { join, resolve } from "node:path";

/**
 * The migrations next to this module, wherever this module is running from
 * (MDRS-219).
 *
 * The SQL files live in `src/database/migrations`, and nest-cli.json copies
 * them to `dist/src/database/migrations` beside the compiled
 * `dist/src/database/*.js`. Anchoring on `__dirname` therefore names a folder
 * that exists under every way this app runs: Vitest and ts sources resolve it
 * to `src/database/migrations`, `nest start` and the runner image to
 * `dist/src/database/migrations`.
 *
 * The default it replaces was the cwd-relative `./src/database/migrations`,
 * which only exists in a checkout. The image runs from `/app/apps/tedrisat`
 * with nothing but `dist/` in it, so any deployment that did not set
 * AUTO_MIGRATIONS_FOLDER by hand pointed the migrator at nothing — which is how
 * the dev database came to lack every migration from 0014 on.
 */
export const DEFAULT_MIGRATIONS_FOLDER = join(__dirname, "migrations");

/**
 * The folder the boot-time migrator reads: AUTO_MIGRATIONS_FOLDER when it is
 * set, resolved against the working directory as before, otherwise
 * {@link DEFAULT_MIGRATIONS_FOLDER}. The result is always absolute, so the log
 * line that names it says exactly where the migrator looked.
 */
export function resolveMigrationsFolder(configured?: string): string {
  const explicit = configured?.trim();
  return explicit ? resolve(explicit) : DEFAULT_MIGRATIONS_FOLDER;
}
