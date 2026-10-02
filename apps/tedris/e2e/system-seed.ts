import { randomUUID } from "node:crypto";
import pg from "pg";

/**
 * What the system-pages specs put in tedrisat's database (MDRS-156), under
 * random ids, and take out again: a köşk with a DRAFT course the müderris may
 * edit (tedris/14), a PUBLISHED course whose applications wait for approval
 * (tedris/07), and a public deck that is somebody else's (tedris/39). Direct
 * SQL, for the reason `seed.ts` gives.
 */
export interface SystemFixture {
  draft: { id: string; title: string; koskName: string };
  approval: { id: string; title: string };
  deck: { id: string; title: string };
  /** Removes the PENDING enrollment an application wrote. */
  clearEnrollments: () => Promise<void>;
  remove: () => Promise<void>;
}

const databaseUrl = () => {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) {
    throw new Error(
      "E2E_DATABASE_URL is not set: point it at the database tedrisat uses."
    );
  }
  return url;
};

/** `muderris` is the Keycloak `sub` of the account that may edit the draft. */
export async function seedSystemPages(
  muderris: string
): Promise<SystemFixture> {
  const client = new pg.Client({ connectionString: databaseUrl() });
  await client.connect();
  const tail = randomUUID().slice(0, 8);
  const owner = randomUUID();
  const koskId = randomUUID();
  const koskName = `E2E Nûruosmaniye ${tail}`;
  const draft = {
    id: randomUUID(),
    title: `Kâfiye’ye giriş ${tail}`,
    koskName,
  };
  const approval = {
    id: randomUUID(),
    title: `Bina ve İzhar Şerhi ${tail}`,
  };
  const deck = { id: randomUUID(), title: `Kırk hadis ${tail}` };
  const weeks = [randomUUID(), randomUUID()];

  try {
    await client.query("begin");
    await client.query(
      "insert into kosks(id, owner_id, name) values ($1, $2, $3)",
      [koskId, owner, koskName]
    );
    await client.query(
      `insert into courses(id, kosk_id, author_id, title, status, requires_approval)
       values ($1, $3, $4, $5, 'DRAFT', false), ($2, $3, $4, $6, 'PUBLISHED', true)`,
      [draft.id, approval.id, koskId, owner, draft.title, approval.title]
    );
    await client.query(
      "insert into course_weeks(id, course_id, week_number, title, order_index) values ($1, $3, 1, 'Kelime, kelâm ve i‘râb', 0), ($2, $3, 2, 'Merfûlar', 1)",
      [weeks[0], weeks[1], draft.id]
    );
    // 12 Ekim 2026 21:00 (Europe/Istanbul) is the earliest; the later one must not win.
    await client.query(
      `insert into lessons(id, week_id, title, type, order_index, duration_minutes, scheduled_at)
       values ($1, $3, 'Kelime ve kelâm', 'LIVE', 0, 60, '2026-10-19T18:00:00Z'),
              ($2, $4, 'Merfûlar', 'LIVE', 0, 60, '2026-10-12T18:00:00Z')`,
      [randomUUID(), randomUUID(), weeks[1], weeks[0]]
    );
    await client.query(
      "insert into role_assignments(user_id, role, scope_type, scope_id, is_imam, granted_by) values ($1, 'MUDERRIS', 'course', $2, false, $3)",
      [muderris, draft.id, owner]
    );
    await client.query(
      "insert into decks(id, author_id, title, is_public) values ($1, $2, $3, true)",
      [deck.id, owner, deck.title]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    await client.end();
    throw error;
  }

  return {
    draft,
    approval,
    deck,
    clearEnrollments: async () => {
      await client.query("delete from enrollments where course_id = $1", [
        approval.id,
      ]);
    },
    remove: async () => {
      try {
        await client.query("begin");
        await client.query("delete from role_assignments where scope_id = $1", [
          draft.id,
        ]);
        await client.query(
          "delete from enrollments where course_id = any($1)",
          [[draft.id, approval.id]]
        );
        await client.query("delete from lessons where week_id = any($1)", [
          weeks,
        ]);
        await client.query("delete from course_weeks where course_id = $1", [
          draft.id,
        ]);
        await client.query("delete from courses where id = any($1)", [
          [draft.id, approval.id],
        ]);
        await client.query("delete from kosks where id = $1", [koskId]);
        await client.query("delete from decks where id = $1", [deck.id]);
        await client.query("commit");
      } finally {
        await client.end();
      }
    },
  };
}
