import { randomUUID } from "node:crypto";
import pg from "pg";

/**
 * What the deck specs put in tedrisat's database (MDRS-180), under random ids,
 * and take out again: a köşk the signed-in nazım manages with one course the
 * müderris teaches, two waiting proposals and one shown deck; and, for the
 * başnazım, one waiting publish request with five cards plus one already
 * refused. Direct SQL, so the specs start from a known page without going
 * through the endpoints they test.
 */
export interface DeckReviewFixture {
  koskId: string;
  koskName: string;
  request: { id: string; title: string; cards: number };
  refused: { id: string; title: string; reason: string };
  proposals: [{ id: string; title: string }, { id: string; title: string }];
  deck: { id: string; title: string };
  ownerName: string;
  /** the two tab counts, counted straight from the table */
  counts: () => Promise<{ pending: number; decided: number }>;
  /** rows in `audit_log` for the request's deck */
  auditReads: () => Promise<number>;
  deckRow: (id: string) => Promise<{
    is_public: boolean;
    publish_status: string;
    archived_at: Date | null;
    reject: string | null;
  } | null>;
  proposalRow: (
    id: string
  ) => Promise<{ status: string; reason: string | null } | null>;
  koskDecks: () => Promise<{ id: string; title: string; kosk_id: string }[]>;
  remove: () => Promise<void>;
}

export async function seedDeckReview(subs: {
  nazim: string;
  muderris: string;
}): Promise<DeckReviewFixture> {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) throw new Error("E2E_DATABASE_URL is not set.");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const tail = randomUUID().slice(0, 8);
  const ownerId = randomUUID();
  const koskId = randomUUID();
  const courseId = randomUUID();
  const koskName = `E2E Deste Köşkü ${tail}`;
  const ownerName = `Zeynep Betül Karahanlı ${tail}`;
  const request = {
    id: randomUUID(),
    title: `Mehmûz fiiller ${tail}`,
    cards: 5,
  };
  const refused = {
    id: randomUUID(),
    title: `Avâmil ezberi ${tail}`,
    reason: "Kartlarda kaynak yok.",
  };
  const proposals: DeckReviewFixture["proposals"] = [
    { id: randomUUID(), title: `İ’lâl kaideleri ${tail}` },
    { id: randomUUID(), title: `Ebniye-i seb’a ${tail}` },
  ];
  const deck = { id: randomUUID(), title: `Sarfın temel kelimeleri ${tail}` };
  try {
    await client.query("begin");
    await client.query(
      "insert into users(id, given_name, family_name) values ($1, $2, $3) on conflict (id) do nothing",
      [ownerId, `Zeynep Betül`, `Karahanlı ${tail}`]
    );
    await client.query(
      "insert into kosks(id, owner_id, name) values ($1, $2, $3)",
      [koskId, subs.nazim, koskName]
    );
    await client.query(
      "insert into role_assignments(user_id, role, scope_type, scope_id, granted_by) values ($1, 'KOSK_NAZIM', 'kosk', $2, $1)",
      [subs.nazim, koskId]
    );
    await client.query(
      "insert into courses(id, kosk_id, author_id, title, status) values ($1, $2, $3, 'Avâmil ve Tasrîf', 'PUBLISHED')",
      [courseId, koskId, subs.nazim]
    );
    await client.query(
      "insert into role_assignments(user_id, role, scope_type, scope_id, granted_by) values ($1, 'MUDERRIS', 'course', $2, $3)",
      [subs.muderris, courseId, subs.nazim]
    );
    for (const proposal of proposals) {
      await client.query(
        "insert into deck_proposals(id, kosk_id, course_id, proposed_by, title, description, card_type) values ($1, $2, $3, $4, $5, 'Tek bir köşk destesi iki derse yeter.', 'VOCABULARY')",
        [proposal.id, koskId, courseId, subs.muderris, proposal.title]
      );
    }
    await client.query(
      "insert into decks(id, author_id, kosk_id, title, description, card_type) values ($1, $2, $3, $4, 'sarfın temel kelimeleri', 'VOCABULARY')",
      [deck.id, subs.nazim, koskId, deck.title]
    );
    await client.query(
      "insert into decks(id, author_id, title, description, publish_status, publish_requested_at) values ($1, $2, $3, 'Hemzeli fiillerin çekimleri.', 'PENDING', now() - interval '3 days')",
      [request.id, ownerId, request.title]
    );
    for (let n = 1; n <= request.cards; n += 1) {
      await client.query(
        "insert into flashcards(deck_id, author_id, type, content_front, content_back, created_at) values ($1, $2, 'VOCABULARY', $3, $4, now() - ($5 || ' minutes')::interval)",
        [request.id, ownerId, `ön ${n}`, `arka ${n}`, String(60 - n)]
      );
    }
    await client.query(
      "insert into decks(id, author_id, title, publish_status, publish_decided_at, publish_decided_by, publish_reject_reason) values ($1, $2, $3, 'REJECTED', now() - interval '1 day', $4, $5)",
      [refused.id, ownerId, refused.title, subs.nazim, refused.reason]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    await client.end();
    throw error;
  }
  const decks = [request.id, refused.id];
  return {
    koskId,
    koskName,
    request,
    refused,
    proposals,
    deck,
    ownerName,
    counts: async () => {
      const { rows } = await client.query(
        `select count(*) filter (where publish_status = 'PENDING' and archived_at is null)::int as pending,
                count(*) filter (where publish_status in ('PUBLISHED', 'REJECTED') and publish_decided_at is not null and archived_at is null)::int as decided
           from decks`
      );
      return rows[0];
    },
    auditReads: async () => {
      const { rows } = await client.query(
        "select count(*)::int as n from audit_log where entity_id = $1 and action = 'deck.private-read'",
        [request.id]
      );
      return rows[0].n;
    },
    deckRow: async (id) => {
      const { rows } = await client.query(
        "select is_public, publish_status, archived_at, publish_reject_reason as reject from decks where id = $1",
        [id]
      );
      return rows[0] ?? null;
    },
    proposalRow: async (id) => {
      const { rows } = await client.query(
        "select status, reject_reason as reason from deck_proposals where id = $1",
        [id]
      );
      return rows[0] ?? null;
    },
    koskDecks: async () => {
      const { rows } = await client.query(
        "select id, title, kosk_id from decks where kosk_id = $1 order by created_at",
        [koskId]
      );
      return rows;
    },
    remove: async () => {
      try {
        await client.query("begin");
        await client.query(
          "delete from notifications where user_id = any($1)",
          [[ownerId, subs.muderris]]
        );
        await client.query("delete from deck_proposals where kosk_id = $1", [
          koskId,
        ]);
        await client.query(
          "delete from flashcards where deck_id in (select id from decks where kosk_id = $1 or id = any($2))",
          [koskId, decks]
        );
        await client.query(
          "delete from decks where kosk_id = $1 or id = any($2)",
          [koskId, decks]
        );
        await client.query("delete from audit_log where entity_id = any($1)", [
          decks,
        ]);
        await client.query(
          "delete from role_assignments where scope_id = any($1)",
          [[koskId, courseId]]
        );
        await client.query("delete from courses where kosk_id = $1", [koskId]);
        await client.query("delete from kosks where id = $1", [koskId]);
        await client.query("delete from users where id = $1", [ownerId]);
        await client.query("commit");
      } finally {
        await client.end();
      }
    },
  };
}
