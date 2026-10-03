import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import {
  DEFAULT_MIGRATIONS_FOLDER,
  resolveMigrationsFolder,
} from "../../../src/database/migrations-folder";

/**
 * MDRS-219: the default used to be the cwd-relative `./src/database/migrations`,
 * which does not exist in the runner image. These pin the replacement.
 */
describe("migrations folder (MDRS-219)", () => {
  it("defaults to the database module's own migrations folder", () => {
    expect(DEFAULT_MIGRATIONS_FOLDER).toBe(
      join(__dirname, "../../../src/database/migrations")
    );
  });

  it("points the default at a folder the migrator can read", () => {
    // drizzle's migrator starts from meta/_journal.json and opens one
    // <tag>.sql per entry; a missing one is the failure tedris-dev logged.
    const journalPath = join(DEFAULT_MIGRATIONS_FOLDER, "meta/_journal.json");
    expect(existsSync(journalPath)).toBe(true);

    const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
      entries: { tag: string }[];
    };
    expect(journal.entries.length).toBeGreaterThan(0);
    for (const { tag } of journal.entries) {
      expect(existsSync(join(DEFAULT_MIGRATIONS_FOLDER, `${tag}.sql`))).toBe(
        true
      );
    }
  });

  it("uses the default when AUTO_MIGRATIONS_FOLDER is unset or blank", () => {
    expect(resolveMigrationsFolder(undefined)).toBe(DEFAULT_MIGRATIONS_FOLDER);
    expect(resolveMigrationsFolder("")).toBe(DEFAULT_MIGRATIONS_FOLDER);
    expect(resolveMigrationsFolder("   ")).toBe(DEFAULT_MIGRATIONS_FOLDER);
  });

  it("keeps an explicit value as the override, relative to the working directory", () => {
    expect(resolveMigrationsFolder("./dist/src/database/migrations")).toBe(
      resolve(process.cwd(), "dist/src/database/migrations")
    );
    expect(resolveMigrationsFolder("/srv/migrations")).toBe("/srv/migrations");
  });

  it("always hands back an absolute path, so the log names where it looked", () => {
    expect(isAbsolute(resolveMigrationsFolder(undefined))).toBe(true);
    expect(isAbsolute(resolveMigrationsFolder("relative/folder"))).toBe(true);
  });
});
