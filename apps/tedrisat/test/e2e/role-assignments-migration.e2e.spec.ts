import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { useDatabaseForThisFile } from "../helpers/test-app.helper";

/**
 * MDRS-134: migrations 0022–0024 move what PR #99 created — `kosk_managers`,
 * `madrasah_nazirs`, the bound `course_muderris` rows and `kosks.madrasah_id`
 * — into `role_assignments` and `madrasah_kosk_hosting`, and the three
 * rollbacks move it back.
 *
 * No Nest app here. The schema is built by applying the migration files one
 * by one up to 0021, then a production-shaped data set is written — the case
 * the app's boot-time migrator can never show, because it always runs every
 * migration before any test writes a row. Shape, not volume: it has every
 * kind of row the migration treats differently (see `seed`).
 */
const MIGRATIONS = join(__dirname, "../../src/database/migrations");
const ROLLBACKS = join(__dirname, "../../src/database/rollbacks");
const TARGETS = [
  "0022_role_assignments",
  "0023_role_assignments_data",
  "0024_drop_superseded_role_tables",
];

interface JournalEntry {
  tag: string;
}

const statementsOf = (file: string): string[] =>
  readFileSync(file, "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

/** A deterministic uuid: `prefix` names the kind of row, `n` numbers it. */
const id = (prefix: string, n: number) =>
  `${prefix}000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const ADMIN = id("a0", 0);
const KOSKS = 24;
const COURSES_PER_KOSK = 4;

describe("0022–0024 role assignments migration (e2e)", () => {
  let client: Client;
  const notices: string[] = [];
  /** The database as PR #99 left it, before 0022 ran. */
  let pristine: {
    schema: unknown;
    counts: Record<string, number>;
    data: Record<string, unknown[]>;
  };

  const run = async (file: string) => {
    for (const statement of statementsOf(file)) {
      await client.query(statement);
    }
  };
  const up = async () => {
    for (const tag of TARGETS) await run(join(MIGRATIONS, `${tag}.sql`));
  };
  const down = async () => {
    for (const tag of [...TARGETS].reverse()) {
      await run(join(ROLLBACKS, `${tag}.down.sql`));
    }
  };

  const rows = async (sql: string, params: unknown[] = []) =>
    (await client.query(sql, params)).rows;

  /** Everything `\d` would show, as comparable data, sorted. */
  const schema = async () => ({
    columns: await rows(
      `select table_name, column_name, data_type, udt_name, is_nullable, column_default
         from information_schema.columns where table_schema = 'public'
        order by table_name, column_name`
    ),
    constraints: await rows(
      `select conrelid::regclass::text as table_name, conname, pg_get_constraintdef(oid) as def
         from pg_constraint where connamespace = 'public'::regnamespace
        order by 1, 2`
    ),
    indexes: await rows(
      `select tablename, indexname, indexdef from pg_indexes
        where schemaname = 'public' order by 1, 2`
    ),
    types: await rows(
      `select t.typname, array_agg(e.enumlabel order by e.enumsortorder) as labels
         from pg_type t join pg_enum e on e.enumtypid = t.oid
        group by t.typname order by 1`
    ),
  });

  const tables = async (): Promise<string[]> =>
    (
      await rows(
        "select tablename from pg_tables where schemaname = 'public' order by 1"
      )
    ).map((r: { tablename: string }) => r.tablename);

  /** Every row of every table, in a stable order. */
  const data = async () => {
    const out: Record<string, unknown[]> = {};
    for (const table of await tables()) {
      out[table] = await rows(
        `select * from "${table}" order by (row_to_json("${table}".*))::text`
      );
    }
    return out;
  };

  const counts = async () => {
    const out: Record<string, number> = {};
    for (const table of await tables()) {
      out[table] = Number(
        (await rows(`select count(*) as n from "${table}"`))[0].n
      );
    }
    return out;
  };

  /**
   * The shape production has after PR #99: three medreses (two nazırs, one,
   * none); köşks with one or two managers, three of them affiliated (two with
   * the same medrese); courses with no müderris, unbound müderris only, a
   * bound one listed after an unbound one, the same account listed twice,
   * hidden and draft courses; enrollments in every state.
   */
  const seed = async () => {
    for (let m = 1; m <= 3; m++) {
      await client.query(
        "insert into madrasahs (id, handle, name, created_by, created_at) values ($1, $2, $3, $4, now() - ($5 || ' days')::interval)",
        [id("b0", m), `medrese-${m}`, `Medrese ${m}`, ADMIN, 30 - m]
      );
    }
    await client.query(
      "insert into madrasah_nazirs (madrasah_id, user_id, created_at) values ($1, $2, now() - interval '20 days'), ($1, $3, now() - interval '10 days'), ($4, $5, now() - interval '5 days')",
      [id("b0", 1), id("c0", 1), id("c0", 2), id("b0", 2), id("c0", 3)]
    );

    for (let k = 1; k <= KOSKS; k++) {
      const owner = id("d0", k);
      const madrasah =
        k === 1 || k === 2 ? id("b0", 1) : k === 3 ? id("b0", 2) : null;
      await client.query(
        "insert into kosks (id, owner_id, madrasah_id, name, created_at) values ($1, $2, $3, $4, now() - ($5 || ' hours')::interval)",
        [id("e0", k), owner, madrasah, `Köşk ${k}`, 500 - k]
      );
      await client.query(
        "insert into kosk_managers (kosk_id, user_id, added_by, created_at) values ($1, $2, $2, now() - ($3 || ' hours')::interval)",
        [id("e0", k), owner, 400 - k]
      );
      if (k % 3 === 0) {
        await client.query(
          "insert into kosk_managers (kosk_id, user_id, added_by, created_at) values ($1, $2, $3, now() - ($4 || ' hours')::interval)",
          [id("e0", k), id("d1", k), owner, 100 - k]
        );
      }

      for (let c = 1; c <= COURSES_PER_KOSK; c++) {
        const n = k * 10 + c;
        const course = id("f0", n);
        await client.query(
          `insert into courses (id, kosk_id, author_id, title, status, archived_at, created_at)
           values ($1, $2, $3, $4, $5, $6, now() - ($7 || ' hours')::interval)`,
          [
            course,
            id("e0", k),
            owner,
            `Ders ${k}.${c}`,
            c === 4 ? "DRAFT" : "PUBLISHED",
            c === 3 && k % 4 === 0 ? new Date("2026-09-01T00:00:00Z") : null,
            300 - n,
          ]
        );
        const muderris: [string | null, number][] =
          c === 1
            ? []
            : c === 2
              ? [[null, 0]]
              : c === 3
                ? [
                    [null, 0],
                    [id("a1", n), 1],
                    [id("a2", n), 2],
                  ]
                : [
                    [id("a1", n), 0],
                    [id("a2", n), 1],
                    [id("a1", n), 2],
                  ];
        for (const [userId, orderIndex] of muderris) {
          await client.query(
            "insert into course_muderris (course_id, user_id, name, order_index) values ($1, $2, $3, $4)",
            [course, userId, `Hoca ${orderIndex}`, orderIndex]
          );
        }
        for (const [i, status] of [
          "ENROLLED",
          "COMPLETED",
          "PENDING",
        ].entries()) {
          await client.query(
            "insert into enrollments (user_id, course_id, status) values ($1, $2, $3)",
            [id("a9", n * 10 + i), course, status]
          );
        }
      }
    }
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
    client.on("notice", (notice) => notices.push(String(notice.message)));

    const journal = JSON.parse(
      readFileSync(join(MIGRATIONS, "meta/_journal.json"), "utf8")
    ) as { entries: JournalEntry[] };
    const tags = journal.entries.map((e) => e.tag);
    const first = tags.indexOf(TARGETS[0]);
    expect(first).toBeGreaterThan(0);
    // The three are consecutive and nothing comes between them.
    expect(tags.slice(first, first + TARGETS.length)).toEqual(TARGETS);
    for (const tag of tags.slice(0, first)) {
      await run(join(MIGRATIONS, `${tag}.sql`));
    }
    await seed();
    pristine = {
      schema: await schema(),
      counts: await counts(),
      data: await data(),
    };
  });

  afterAll(async () => {
    await client?.end();
  });

  describe("applied to production-shaped data", () => {
    let before: {
      managers: {
        kosk_id: string;
        user_id: string;
        added_by: string;
        created_at: Date;
      }[];
      nazirs: { madrasah_id: string; user_id: string; created_at: Date }[];
      affiliated: { id: string; madrasah_id: string }[];
    };

    beforeAll(async () => {
      before = {
        managers: await rows(
          "select kosk_id, user_id, added_by, created_at from kosk_managers order by kosk_id, user_id"
        ),
        nazirs: await rows(
          "select madrasah_id, user_id, created_at from madrasah_nazirs order by madrasah_id, user_id"
        ),
        affiliated: await rows(
          "select id, madrasah_id from kosks where madrasah_id is not null order by id"
        ),
      };
      notices.length = 0;
      await up();
    });

    it("makes every former köşk manager a KOSK_NAZIM and every former medrese nazır a MEDRESE_BASMUDERRIS", async () => {
      expect(before.managers.length).toBe(KOSKS + KOSKS / 3);
      const kosk = await rows(
        `select scope_id as kosk_id, user_id, granted_by as added_by, created_at at time zone 'UTC' as created_at
           from role_assignments
          where role = 'KOSK_NAZIM' and scope_type = 'kosk' and revoked_at is null and expires_at is null
          order by scope_id, user_id`
      );
      expect(kosk).toEqual(before.managers);

      expect(before.nazirs).toHaveLength(3);
      const medrese = await rows(
        `select scope_id as madrasah_id, user_id, created_at at time zone 'UTC' as created_at
           from role_assignments
          where role = 'MEDRESE_BASMUDERRIS' and scope_type = 'madrasah' and revoked_at is null and granted_by = $1
          order by scope_id, user_id`,
        [ADMIN]
      );
      expect(medrese).toEqual(before.nazirs);
      // Nobody got a role the old model did not have.
      expect(
        await rows(
          "select distinct role::text from role_assignments order by 1"
        )
      ).toEqual([
        { role: "KOSK_NAZIM" },
        { role: "MEDRESE_BASMUDERRIS" },
        { role: "MUDERRIS" },
      ]);
    });

    it("makes every bound müderris a MUDERRIS once, with exactly one imam — the one listed first — per course that has one", async () => {
      const bound = await rows(
        "select distinct course_id, user_id from course_muderris where user_id is not null order by 1, 2"
      );
      const muderris = await rows(
        `select scope_id as course_id, user_id from role_assignments
          where role = 'MUDERRIS' and scope_type = 'course' and revoked_at is null
          order by 1, 2`
      );
      expect(muderris).toEqual(bound);
      expect(bound.length).toBe(KOSKS * 2 * 2);

      const imams = await rows(
        `select scope_id as course_id, user_id from role_assignments
          where role = 'MUDERRIS' and is_imam order by 1`
      );
      const withBound = new Set(
        bound.map((b: { course_id: string }) => b.course_id)
      );
      expect(imams.map((i: { course_id: string }) => i.course_id)).toEqual(
        [...withBound].sort()
      );
      // The lowest `order_index` among the bound rows: behind an unbound row
      // in `c === 3`, first in `c === 4`, where the same account also
      // appears again further down.
      const expected = await rows(
        `select distinct on (course_id) course_id, user_id from course_muderris
          where user_id is not null order by course_id, order_index, id`
      );
      expect(imams).toEqual(expected);

      // `course_muderris` itself is untouched: it is what the course page shows.
      expect(
        Number((await rows("select count(*) as n from course_muderris"))[0].n)
      ).toBe(KOSKS * (1 + 3 + 3));
    });

    it("turns each affiliation into a hosting right and drops `kosks.madrasah_id`", async () => {
      expect(before.affiliated).toHaveLength(3);
      const hosting = await rows(
        `select kosk_id as id, madrasah_id from madrasah_kosk_hosting
          where revoked_at is null and granted_by = $1 order by kosk_id`,
        [ADMIN]
      );
      expect(hosting).toEqual(before.affiliated);

      const columns = await rows(
        "select column_name from information_schema.columns where table_name = 'kosks' and column_name = 'madrasah_id'"
      );
      expect(columns).toEqual([]);
      expect(
        (await rows("select to_regclass('kosk_managers') as r"))[0].r
      ).toBeNull();
      expect(
        (await rows("select to_regclass('madrasah_nazirs') as r"))[0].r
      ).toBeNull();
    });

    it("moves no course into a medrese, and prints the affiliated köşks' courses for review", async () => {
      expect(
        Number(
          (
            await rows(
              "select count(*) as n from courses where madrasah_id is not null"
            )
          )[0].n
        )
      ).toBe(0);

      const reviewed = await rows(
        "select id from courses where kosk_id = any($1) order by id",
        [before.affiliated.map((a) => a.id)]
      );
      expect(reviewed).toHaveLength(3 * COURSES_PER_KOSK);
      const lines = notices.filter((n) =>
        n.startsWith("MDRS-134 review: course ")
      );
      expect(lines).toHaveLength(reviewed.length);
      for (const { id: courseId } of reviewed) {
        expect(lines.some((l) => l.includes(courseId))).toBe(true);
      }
      expect(notices).toContain(
        `MDRS-134 review: ${reviewed.length} course(s) of formerly affiliated köşks to review`
      );
    });

    it("refuses a second imam for the same course, and only an imam who is a müderris", async () => {
      const [imam] = await rows(
        "select scope_id from role_assignments where is_imam limit 1"
      );
      const secondImam = client.query(
        `insert into role_assignments (user_id, role, scope_type, scope_id, is_imam, granted_by)
         values ($1, 'MUDERRIS', 'course', $2, true, $3)`,
        [id("a7", 1), imam.scope_id, ADMIN]
      );
      await expect(secondImam).rejects.toMatchObject({
        code: "23505",
        constraint: "role_assignments_one_imam_per_course_idx",
      });

      await expect(
        client.query(
          `insert into role_assignments (user_id, role, scope_type, scope_id, is_imam, granted_by)
           values ($1, 'DERS_NAZIR', 'course', $2, true, $3)`,
          [id("a7", 2), imam.scope_id, ADMIN]
        )
      ).rejects.toMatchObject({
        code: "23514",
        constraint: "role_assignments_imam_is_muderris",
      });
      await expect(
        client.query(
          `insert into role_assignments (user_id, role, scope_type, scope_id, granted_by)
           values ($1, 'KOSK_NAZIM', 'course', $2, $3)`,
          [id("a7", 3), imam.scope_id, ADMIN]
        )
      ).rejects.toMatchObject({
        code: "23514",
        constraint: "role_assignments_scope_matches_role",
      });
      await expect(
        client.query(
          `insert into role_assignments (user_id, role, scope_type, scope_id, granted_by)
           values ($1, 'MEDARIS_NAZIM', 'platform', $2, $3)`,
          [id("a7", 4), imam.scope_id, ADMIN]
        )
      ).rejects.toMatchObject({
        code: "23514",
        constraint: "role_assignments_scope_id_present",
      });
    });
  });

  describe("reverted", () => {
    it("leaves the schema and every row as they were, and applies again", async () => {
      // `up()` ran in the block above, and the imam test's inserts were all
      // refused, so this reverts exactly what the migration did.
      expect(await tables()).not.toContain("kosk_managers");
      await down();

      expect(pristine.counts.kosk_managers).toBe(KOSKS + KOSKS / 3);
      expect(await schema()).toEqual(pristine.schema);
      expect(await counts()).toEqual(pristine.counts);
      expect(await data()).toEqual(pristine.data);

      // And forward again: the rollback leaves exactly the state 0022 expects.
      await up();
      expect(
        Number(
          (
            await rows(
              "select count(*) as n from role_assignments where role = 'KOSK_NAZIM'"
            )
          )[0].n
        )
      ).toBe(KOSKS + KOSKS / 3);
    });
  });
});
