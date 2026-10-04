import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { useDatabaseForThisFile } from "../helpers/test-app.helper";

/**
 * MDRS-135, migration 0048: `archived_level` on the six tables something can be
 * hidden in, the level (platform, köşk, medrese or course) the hider acted at,
 * so that a restore can be refused to a lower level.
 *
 * No Nest app. The schema is built by applying the migration files one by one,
 * so that rows hidden BEFORE 0048 exist when it runs. 0048 fills their level
 * from `archived_by` and the role that person holds, or held, where the item
 * sits, as the archive decided before the column: a köşk nazımı is the köşk, a
 * başmüderris or a medrese nazırı the medrese, a müderris the course, a hider
 * with no role there (the başnazım) the platform. A row that names no hider
 * keeps a null level, which counts as the lowest level that could have hidden it.
 */
const MIGRATIONS = join(__dirname, "../../src/database/migrations");
const ROLLBACKS = join(__dirname, "../../src/database/rollbacks");
const TARGET = "0048_mdrs_135_archived_level";
const TABLES = [
  "course_weeks",
  "courses",
  "lessons",
  "decks",
  "kosks",
  "madrasahs",
] as const;

const ADMIN = "f2000000-0000-4000-8000-000000000001";
const NAZIM = "f2000000-0000-4000-8000-000000000002";
const HEAD = "f2000000-0000-4000-8000-000000000003";
const NAZIR = "f2000000-0000-4000-8000-000000000004";
const MUDERRIS = "f2000000-0000-4000-8000-000000000005";
const FORMER_NAZIM = "f2000000-0000-4000-8000-000000000006";

const statementsOf = (file: string): string[] =>
  readFileSync(file, "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

describe("0048_mdrs_135_archived_level migration (e2e)", () => {
  let client: Client;

  const run = async (file: string) => {
    for (const statement of statementsOf(file)) {
      await client.query(statement);
    }
  };

  const columns = async () =>
    (
      await client.query(
        "select table_name, is_nullable, udt_name from information_schema.columns where column_name = 'archived_level' order by table_name"
      )
    ).rows;

  const one = async <T>(text: string, values: unknown[] = []): Promise<T> =>
    (await client.query(text, values)).rows[0] as T;

  const role = (
    userId: string,
    name: string,
    scopeType: string,
    scopeId: string,
    revoked = false
  ) =>
    client.query(
      `insert into role_assignments (user_id, role, scope_type, scope_id, granted_by, revoked_at, revoked_by)
       values ($1, $2, $3, $4, $5, ${revoked ? "now()" : "null"}, ${revoked ? "$5" : "null"})`,
      [userId, name, scopeType, scopeId, ADMIN]
    );

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
    // 0048 is in the journal, and exactly the ones before it are applied first
    // (later migrations have their own specs).
    expect(target).toBeGreaterThan(0);
    for (const tag of tags.slice(0, target)) {
      await run(join(MIGRATIONS, `${tag}.sql`));
    }
  });

  afterAll(async () => {
    await client?.end();
  });

  it("adds a nullable scope_type column to the six tables, fills the level of what is hidden from its hider's role, and the rollback removes them", async () => {
    const { id: kosk } = await one<{ id: string }>(
      "insert into kosks (owner_id, name) values ($1, 'Nûruosmaniye') returning id",
      [NAZIM]
    );
    const { id: madrasah } = await one<{ id: string }>(
      "insert into madrasahs (handle, name, created_by) values ('suleymaniye', 'Süleymaniye', $1) returning id",
      [ADMIN]
    );
    await role(NAZIM, "KOSK_NAZIM", "kosk", kosk);
    // A köşk nazımı who has since left the post: the row is history, and still counts.
    await role(FORMER_NAZIM, "KOSK_NAZIM", "kosk", kosk, true);
    await role(HEAD, "MEDRESE_BASMUDERRIS", "madrasah", madrasah);
    await role(NAZIR, "MEDRESE_NAZIR", "madrasah", madrasah);

    const course = async (
      title: string,
      archivedBy: string | null,
      inMadrasah = true
    ) =>
      (
        await one<{ id: string }>(
          `insert into courses (kosk_id, madrasah_id, author_id, title, archived_at, archived_by)
           values ($1, $2, $3, $4, now(), $5) returning id`,
          [kosk, inMadrasah ? madrasah : null, NAZIM, title, archivedBy]
        )
      ).id;
    const byNazim = await course("Köşk nazımı gizledi", NAZIM);
    const byFormerNazim = await course(
      "Eski köşk nazımı gizledi",
      FORMER_NAZIM
    );
    const byHead = await course("Başmüderris gizledi", HEAD);
    const byNazir = await course("Medrese nazırı gizledi", NAZIR);
    const byAdmin = await course("Başnazım gizledi", ADMIN);
    const byNobody = await course("Gizleyen bilinmiyor", null);
    const shown = (
      await one<{ id: string }>(
        "insert into courses (kosk_id, madrasah_id, author_id, title) values ($1, $2, $3, 'Görünen ders') returning id",
        [kosk, madrasah, NAZIM]
      )
    ).id;
    await role(MUDERRIS, "MUDERRIS", "course", shown);

    const { id: week } = await one<{ id: string }>(
      "insert into course_weeks (course_id, week_number, title, archived_at, archived_by) values ($1, 1, 'Hafta 1', now(), $2) returning id",
      [shown, MUDERRIS]
    );
    const { id: openWeek } = await one<{ id: string }>(
      "insert into course_weeks (course_id, week_number, title) values ($1, 2, 'Hafta 2') returning id",
      [shown]
    );
    const { id: lessonByNazim } = await one<{ id: string }>(
      "insert into lessons (week_id, title, type, archived_at, archived_by) values ($1, 'Nazım kaldırdı', 'LIVE', now(), $2) returning id",
      [openWeek, NAZIM]
    );
    const { id: lessonByMuderris } = await one<{ id: string }>(
      "insert into lessons (week_id, title, type, archived_at, archived_by) values ($1, 'Müderris kaldırdı', 'LIVE', now(), $2) returning id",
      [openWeek, MUDERRIS]
    );
    const { id: deckByNazim } = await one<{ id: string }>(
      "insert into decks (author_id, kosk_id, title, archived_at, archived_by) values ($1, $2, 'Nazım gizledi', now(), $1) returning id",
      [NAZIM, kosk]
    );
    const { id: deckByAdmin } = await one<{ id: string }>(
      "insert into decks (author_id, kosk_id, title, archived_at, archived_by) values ($1, $2, 'Başnazım gizledi', now(), $3) returning id",
      [NAZIM, kosk, ADMIN]
    );
    const { id: hiddenKosk } = await one<{ id: string }>(
      "insert into kosks (owner_id, name, archived_at, archived_by) values ($1, 'Eski köşk', now(), $1) returning id",
      [ADMIN]
    );
    await client.query(
      "update madrasahs set archived_at = now(), archived_by = $2 where id = $1",
      [madrasah, HEAD]
    );
    expect(await columns()).toEqual([]);

    await run(join(MIGRATIONS, `${TARGET}.sql`));

    expect(await columns()).toEqual(
      [...TABLES].sort().map((table_name) => ({
        table_name,
        is_nullable: "YES",
        udt_name: "scope_type",
      }))
    );
    const level = async (table: string, id: string) =>
      (
        await one<{ archived_level: string | null }>(
          `select archived_level from ${table} where id = $1`,
          [id]
        )
      ).archived_level;
    expect({
      byNazim: await level("courses", byNazim),
      byFormerNazim: await level("courses", byFormerNazim),
      byHead: await level("courses", byHead),
      byNazir: await level("courses", byNazir),
      byAdmin: await level("courses", byAdmin),
      byNobody: await level("courses", byNobody),
      shown: await level("courses", shown),
      week: await level("course_weeks", week),
      openWeek: await level("course_weeks", openWeek),
      lessonByNazim: await level("lessons", lessonByNazim),
      lessonByMuderris: await level("lessons", lessonByMuderris),
      deckByNazim: await level("decks", deckByNazim),
      deckByAdmin: await level("decks", deckByAdmin),
      hiddenKosk: await level("kosks", hiddenKosk),
      openKosk: await level("kosks", kosk),
      madrasah: await level("madrasahs", madrasah),
    }).toEqual({
      byNazim: "kosk",
      byFormerNazim: "kosk",
      byHead: "madrasah",
      byNazir: "madrasah",
      byAdmin: "platform",
      byNobody: null,
      shown: null,
      week: "course",
      openWeek: null,
      lessonByNazim: "kosk",
      lessonByMuderris: "course",
      deckByNazim: "kosk",
      deckByAdmin: "platform",
      hiddenKosk: "platform",
      openKosk: null,
      madrasah: "madrasah",
    });
    // Nothing but the new column changed: the hider and the moment stay.
    expect(
      await one("select archived_by from courses where id = $1", [byHead])
    ).toEqual({ archived_by: HEAD });
    // The column takes the four levels and nothing else.
    await client.query("update kosks set archived_level = 'kosk'");
    await expect(
      client.query("update kosks set archived_level = 'galaxy'")
    ).rejects.toThrow();

    await run(join(ROLLBACKS, `${TARGET}.down.sql`));
    expect(await columns()).toEqual([]);
    expect(
      (await client.query("select name from kosks order by name")).rows
    ).toEqual([{ name: "Eski köşk" }, { name: "Nûruosmaniye" }]);

    // And forward again: the rollback leaves exactly the state 0048 expects,
    // and the level is filled the same way.
    await run(join(MIGRATIONS, `${TARGET}.sql`));
    expect(await columns()).toHaveLength(TABLES.length);
    expect(await level("courses", byNazim)).toBe("kosk");
    expect(await level("courses", byNobody)).toBeNull();
  });
});
