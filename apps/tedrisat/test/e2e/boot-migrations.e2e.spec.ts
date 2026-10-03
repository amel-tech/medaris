import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { INestApplication } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { DatabaseService } from "../../src/database/database.service";
import { DEFAULT_MIGRATIONS_FOLDER } from "../../src/database/migrations-folder";
import {
  createTestApp,
  useDatabaseForThisFile,
} from "../helpers/test-app.helper";

/**
 * MDRS-219: the two halves of the boot-time migrator against a real Postgres.
 *
 * tedris-dev booted with the migrator pointed at a folder that did not exist
 * in its image, logged the failure and served traffic on a schema that lacked
 * every migration from 0014 on. A failure must now stop the boot, and an
 * unset AUTO_MIGRATIONS_FOLDER must name a folder that is there.
 */
describe("boot-time migrations (e2e)", () => {
  let emptyFolder: string;
  let app: INestApplication | undefined;

  beforeAll(async () => {
    emptyFolder = mkdtempSync(join(tmpdir(), "tedrisat-no-migrations-"));
    // Phase one on its own, so the environment can be edited before the boot
    // (the same split keycloak-audience.e2e.spec.ts relies on).
    await useDatabaseForThisFile();
  });

  afterAll(async () => {
    await app?.close();
    rmSync(emptyFolder, { recursive: true, force: true });
  });

  it("refuses to boot when the migrations cannot be applied", async () => {
    process.env.AUTO_MIGRATIONS_FOLDER = emptyFolder;

    await expect(createTestApp()).rejects.toThrow(/_journal\.json/);
  });

  it("boots on the default folder and applies every migration in it", async () => {
    delete process.env.AUTO_MIGRATIONS_FOLDER;

    app = await createTestApp();

    const journal = JSON.parse(
      readFileSync(
        join(DEFAULT_MIGRATIONS_FOLDER, "meta/_journal.json"),
        "utf8"
      )
    ) as { entries: unknown[] };
    const { rows } = await app
      .get(DatabaseService)
      .db.execute<{ applied: number }>(
        sql`select count(*)::int as applied from drizzle.__drizzle_migrations`
      );

    expect(rows[0].applied).toBe(journal.entries.length);
  });
});
