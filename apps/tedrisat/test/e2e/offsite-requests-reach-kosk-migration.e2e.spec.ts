import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { useDatabaseForThisFile } from "../helpers/test-app.helper";

/**
 * Migration 0067 copies the medrese's requests for a course outside it from
 * `offsite_course_requests`, which no screen reads, to `course_requests`, which
 * the köşk's "Ders talepleri" (nizam/39) lists and decides: each with its id,
 * as PENDING, once, and never over a row already there. Its rollback removes
 * only the copies still waiting untouched, and keeps one a köşk's nazım has
 * answered since and a row that was there before. Like the other migration specs, the schema
 * is built file by file so that rows exist BEFORE 0067 runs.
 */
const MIGRATIONS = join(__dirname, "../../src/database/migrations");
const ROLLBACKS = join(__dirname, "../../src/database/rollbacks");
const TARGET = "0067_offsite_requests_reach_kosk";

const statementsOf = (file: string): string[] =>
  readFileSync(file, "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

describe("0067_offsite_requests_reach_kosk migration (e2e)", () => {
  let client: Client;

  const run = async (file: string) => {
    for (const statement of statementsOf(file)) {
      await client.query(statement);
    }
  };

  const ids = {
    head: "c0670000-0000-4000-8000-000000000001",
    first: "c0670000-0000-4000-8000-000000000002",
    second: "c0670000-0000-4000-8000-000000000003",
    // in both tables before 0067, with other words: not 0067's to add or take back
    shared: "c0670000-0000-4000-8000-000000000004",
  };
  let madrasahId: string;
  let koskId: string;

  const requests = async () =>
    (
      await client.query(
        "select id, kosk_id, madrasah_id, title, reason, requested_by, status from course_requests order by created_at"
      )
    ).rows;

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

    madrasahId = (
      await client.query(
        "insert into madrasahs (handle, name, created_by) values ('suleymaniye', 'Süleymaniye Medresesi', $1) returning id",
        [ids.head]
      )
    ).rows[0].id;
    koskId = (
      await client.query(
        "insert into kosks (owner_id, name) values ($1, 'Beyazıt Köşkü') returning id",
        [ids.head]
      )
    ).rows[0].id;
    for (const [id, title, at] of [
      [ids.first, "Erbaîn-i Nevevî okumaları", "2026-10-01T09:00:00Z"],
      [ids.second, "Emsile ve Bina", "2026-10-02T09:00:00Z"],
      [ids.shared, "Avâmil", "2026-10-03T09:00:00Z"],
    ]) {
      await client.query(
        "insert into offsite_course_requests (id, madrasah_id, kosk_id, title, reason, requested_by, created_at) values ($1, $2, $3, $4, 'Medresemizde bu metni okutan bir ders yok.', $5, $6)",
        [id, madrasahId, koskId, title, ids.head, at]
      );
    }
  });

  afterAll(async () => {
    await client?.end();
  });

  const insertShared = () =>
    client.query(
      "insert into course_requests (id, madrasah_id, kosk_id, title, reason, requested_by, created_at) values ($1, $2, $3, 'Önceden vardı', 'Başka bir yoldan', $4, '2026-09-30T09:00:00Z')",
      [ids.shared, madrasahId, koskId, ids.head]
    );

  it("copies every request to the köşk's table with its id, as PENDING, once; the rollback keeps one answered since", async () => {
    expect(await requests()).toEqual([]);
    await insertShared();

    await run(join(MIGRATIONS, `${TARGET}.sql`));
    const copied = await requests();
    expect(copied).toEqual([
      expect.objectContaining({ id: ids.shared, title: "Önceden vardı" }),
      {
        id: ids.first,
        kosk_id: koskId,
        madrasah_id: madrasahId,
        title: "Erbaîn-i Nevevî okumaları",
        reason: "Medresemizde bu metni okutan bir ders yok.",
        requested_by: ids.head,
        status: "PENDING",
      },
      expect.objectContaining({ id: ids.second, status: "PENDING" }),
    ]);

    // Running it again copies nothing twice.
    await run(join(MIGRATIONS, `${TARGET}.sql`));
    expect(await requests()).toHaveLength(3);

    // A köşk's nazım answers the first; the rollback takes back only the
    // second, which still waits, and leaves the old table as it was.
    await client.query(
      "update course_requests set status = 'REJECTED', reject_reason = 'Bu dönem yerimiz yok.', decided_by = $1, decided_at = now() where id = $2",
      [ids.head, ids.first]
    );
    await run(join(ROLLBACKS, `${TARGET}.down.sql`));
    expect(await requests()).toEqual([
      expect.objectContaining({ id: ids.shared, title: "Önceden vardı" }),
      expect.objectContaining({ id: ids.first, status: "REJECTED" }),
    ]);
    const { rows: old } = await client.query(
      "select count(*)::int as n from offsite_course_requests"
    );
    expect(old[0].n).toBe(3);
  });
});
