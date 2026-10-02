import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { useDatabaseForThisFile } from "../helpers/test-app.helper";

/**
 * MDRS-171: migration 0032 lets a group or a grant in the scope "course" name
 * no course (every course), puts a unique live name on the groups no scope id
 * narrows, and leaves every row that exists before it as it was. Its rollback
 * puts the old constraints back (after taking the course-wide rows out). The
 * schema is built file by file so that rows can exist BEFORE 0032 runs.
 */
const MIGRATIONS = join(__dirname, "../../src/database/migrations");
const ROLLBACKS = join(__dirname, "../../src/database/rollbacks");
const TARGET = "0032_permission_groups_course_wide";

const statementsOf = (file: string): string[] =>
  readFileSync(file, "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

describe("0032_permission_groups_course_wide migration (e2e)", () => {
  let client: Client;

  const run = async (file: string) => {
    for (const statement of statementsOf(file)) {
      await client.query(statement);
    }
  };

  const fails = async (sql: string, params: unknown[] = []) => {
    try {
      await client.query(sql, params);
      return false;
    } catch {
      return true;
    }
  };

  const ids = {
    platform: "c1710000-0000-4000-8000-000000000001",
    user: "c1710000-0000-4000-8000-000000000002",
    wide: "c1710000-0000-4000-8000-000000000003",
  };

  beforeAll(async () => {
    await useDatabaseForThisFile();
    client = new Client({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      user: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });
    await client.connect();

    const journal = JSON.parse(
      readFileSync(join(MIGRATIONS, "meta/_journal.json"), "utf8")
    ) as { entries: { tag: string }[] };
    const tags = journal.entries.map((e) => e.tag);
    const target = tags.indexOf(TARGET);
    expect(target).toBeGreaterThan(0);
    for (const tag of tags.slice(0, target)) {
      await run(join(MIGRATIONS, `${tag}.sql`));
    }
  });

  afterAll(async () => {
    await client?.end();
  });

  it("keeps existing rows, allows course-wide ones, and the rollback restores the old rule", async () => {
    await client.query(
      "insert into permission_groups (id, scope_type, name, created_by) values ($1, 'platform', 'Denetim', $2)",
      [ids.platform, ids.user]
    );
    await client.query(
      "insert into permission_grants (user_id, scope_type, group_id, granted_by) values ($1, 'platform', $2, $1)",
      [ids.user, ids.platform]
    );
    // Before: a course group with no course is refused.
    expect(
      await fails(
        "insert into permission_groups (scope_type, name, created_by) values ('course', 'Ders', $1)",
        [ids.user]
      )
    ).toBe(true);

    await run(join(MIGRATIONS, `${TARGET}.sql`));

    const { rows: groups } = await client.query(
      "select id, name from permission_groups"
    );
    expect(groups).toEqual([{ id: ids.platform, name: "Denetim" }]);

    await client.query(
      "insert into permission_groups (id, scope_type, name, created_by) values ($1, 'course', 'Ders denetimi', $2)",
      [ids.wide, ids.user]
    );
    await client.query(
      "insert into permission_grants (user_id, scope_type, group_id, granted_by) values ($1, 'course', $2, $1)",
      [ids.user, ids.wide]
    );
    // A live name is used once among groups with no scope id, in any case...
    expect(
      await fails(
        "insert into permission_groups (scope_type, name, created_by) values ('platform', 'DENETİM'::text, $1), ('platform', 'denetim', $1)",
        [ids.user]
      )
    ).toBe(true);
    expect(
      await fails(
        "insert into permission_groups (scope_type, name, created_by) values ('course', 'ders DENETIMI', $1)",
        [ids.user]
      )
    ).toBe(true);
    // ...a deleted one frees it...
    await client.query(
      "update permission_groups set deleted_at = now() where id = $1",
      [ids.wide]
    );
    await client.query(
      "insert into permission_groups (scope_type, name, created_by) values ('course', 'Ders denetimi', $1)",
      [ids.user]
    );
    // ...and a köşk or medrese group, or grant, still names its scope.
    expect(
      await fails(
        "insert into permission_groups (scope_type, name, created_by) values ('kosk', 'K', $1)",
        [ids.user]
      )
    ).toBe(true);
    expect(
      await fails(
        "insert into permission_grants (user_id, scope_type, permission, granted_by) values ($1, 'madrasah', 'course.edit', $1)",
        [ids.user]
      )
    ).toBe(true);

    await run(join(ROLLBACKS, `${TARGET}.down.sql`));
    const { rows: left } = await client.query(
      "select id from permission_groups order by id"
    );
    expect(left.map((r: { id: string }) => r.id)).toEqual([ids.platform]);
    expect(
      await fails(
        "insert into permission_groups (scope_type, name, created_by) values ('course', 'Ders', $1)",
        [ids.user]
      )
    ).toBe(true);

    // And forward again from the rolled-back state.
    await run(join(MIGRATIONS, `${TARGET}.sql`));
    await client.query(
      "insert into permission_groups (scope_type, name, created_by) values ('course', 'Ders', $1)",
      [ids.user]
    );
  });
});
