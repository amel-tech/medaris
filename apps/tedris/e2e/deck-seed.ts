import { randomUUID } from "node:crypto";
import pg from "pg";

/**
 * What the deck specs put in tedrisat's database (MDRS-164), under random ids,
 * and take out again. Direct SQL on purpose: no endpoint links a deck to a
 * course or writes progress in bulk, and the shared database has other decks
 * the specs must not depend on, so every title carries a random tag.
 *
 * `viewer` is the signed-in talebe's Keycloak `sub`. They own three decks
 * (Mehmûz fiiller: waiting for review, 18 cards, 6 mastered and 7 being
 * learned; Bina'dan kelimeler: private; Emsile çekimleri: published) and one
 * empty private hadith deck to copy into. They collected one public hadith
 * deck of somebody else's; are enrolled in a course that has a private deck;
 * and a second public deck and a stranger's private deck exist beside them.
 */
export interface DeckFixture {
  tag: string;
  titles: {
    pending: string;
    private: string;
    published: string;
    hadithOwn: string;
    collected: string;
    courseDeck: string;
    otherPublic: string;
    strangerPrivate: string;
  };
  ids: {
    pending: string;
    private: string;
    published: string;
    hadithOwn: string;
    collected: string;
    courseDeck: string;
    otherPublic: string;
    strangerPrivate: string;
  };
  courseTitle: string;
  muderrisName: string;
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

/**
 * Minutes since a card was written: the first six are older than the day the
 * viewer collected the deck, the rest newer (the "yeni kart" count).
 */
const age = (n: number) => (n < 6 ? 4000 : 60);

const ARABIC = [
  "أَخَذَ يَأْخُذُ أَخْذًا",
  "أَكَلَ يَأْكُلُ أَكْلًا",
  "أَمَرَ يَأْمُرُ أَمْرًا",
  "أَسَرَ يَأْسِرُ أَسْرًا",
  "أَتَى يَأْتِي إِتْيَانًا",
  "أَمِنَ يَأْمَنُ أَمْنًا",
];

export async function seedDecks(viewer: string): Promise<DeckFixture> {
  const client = new pg.Client({ connectionString: databaseUrl() });
  await client.connect();
  const id = () => randomUUID();
  const tag = randomUUID().slice(0, 6);
  const stranger = id();
  const owner = id();
  const koskId = id();
  const courseId = id();
  const ids = {
    pending: id(),
    private: id(),
    published: id(),
    hadithOwn: id(),
    collected: id(),
    courseDeck: id(),
    otherPublic: id(),
    strangerPrivate: id(),
  };
  const titles = {
    pending: `Mehmûz fiiller ${tag}`,
    private: `Bina’dan kelimeler ${tag}`,
    published: `Emsile çekimleri ${tag}`,
    hadithOwn: `Hadislerim ${tag}`,
    collected: `Kırk hadis ${tag}`,
    courseDeck: `Emsile’nin altı bâbı ${tag}`,
    otherPublic: `Nahiv ıstılahları ${tag}`,
    strangerPrivate: `Gizli deste ${tag}`,
  };
  const courseTitle = `Emsile ve Bina ${tag}`;
  const muderrisName = "Abdülhamit Karaosmanoğlu";

  const deck = (
    deckId: string,
    author: string,
    title: string,
    extra: {
      description?: string;
      isPublic?: boolean;
      status?: string;
      cardType?: string;
      requestedAt?: string;
      courseId?: string;
    } = {}
  ) =>
    client.query(
      `insert into decks(id, author_id, title, description, is_public, publish_status, card_type, publish_requested_at, course_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        deckId,
        author,
        title,
        extra.description ?? null,
        extra.isPublic ?? false,
        extra.status ?? (extra.isPublic ? "PUBLISHED" : "PRIVATE"),
        extra.cardType ?? "VOCABULARY",
        extra.requestedAt ?? null,
        extra.courseId ?? null,
      ]
    );
  const card = async (
    deckId: string,
    author: string,
    n: number,
    type: string,
    front: string,
    back: string,
    meta?: object
  ): Promise<string> => {
    const cardId = id();
    await client.query(
      `insert into flashcards(id, deck_id, author_id, type, content_front, content_back, content_meta, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, now() - ($8 || ' minutes')::interval)`,
      [cardId, deckId, author, type, front, back, meta ?? null, String(age(n))]
    );
    return cardId;
  };
  const progress = (cardId: string, status: string) =>
    client.query(
      "insert into flashcard_progress(user_id, flashcard_id, status) values ($1, $2, $3)",
      [viewer, cardId, status]
    );

  try {
    await client.query("begin");
    await client.query(
      "insert into kosks(id, owner_id, name) values ($1, $2, 'Nûruosmaniye Köşkü')",
      [koskId, owner]
    );
    await client.query(
      "insert into courses(id, kosk_id, author_id, title, status) values ($1, $2, $3, $4, 'PUBLISHED')",
      [courseId, koskId, owner, courseTitle]
    );
    await client.query(
      "insert into course_muderris(course_id, name, order_index) values ($1, $2, 0)",
      [courseId, muderrisName]
    );
    await client.query(
      "insert into enrollments(user_id, course_id, status) values ($1, $2, 'ENROLLED')",
      [viewer, courseId]
    );

    await deck(ids.pending, viewer, titles.pending, {
      description: "Hemzeli fiillerin çekimleri ve emir sîgaları.",
      status: "PENDING",
      requestedAt: "2026-09-29T18:10:00Z",
    });
    for (let n = 0; n < 18; n++) {
      const cardId = await card(
        ids.pending,
        viewer,
        n,
        "VOCABULARY",
        ARABIC[n % ARABIC.length],
        `Anlam ${n + 1}. Nasara babı, mehmûzü’l-fâ.`
      );
      if (n < 6) await progress(cardId, "MASTERED");
      else if (n < 13) await progress(cardId, "LEARNING");
    }
    await deck(ids.private, viewer, titles.private, {
      description: "Bina ve İzhar Şerhi celselerinde geçen kelimeler.",
    });
    for (let n = 0; n < 4; n++) {
      await card(
        ids.private,
        viewer,
        n,
        "VOCABULARY",
        `kelime ${n + 1}`,
        `anlam ${n + 1}`
      );
    }
    await deck(ids.published, viewer, titles.published, {
      description:
        "Sülâsî mücerred bâblarının mâzi, muzâri ve masdar kalıpları.",
      isPublic: true,
    });
    for (let n = 0; n < 3; n++) {
      await card(
        ids.published,
        viewer,
        n,
        "VOCABULARY",
        `kalıp ${n + 1}`,
        `çekim ${n + 1}`
      );
    }
    await deck(ids.hadithOwn, viewer, titles.hadithOwn, {
      cardType: "HADEETH",
    });

    await deck(ids.collected, stranger, titles.collected, {
      description: "İmam Nevevî’nin Erbaîn’inden kırk hadis, kaynaklarıyla.",
      isPublic: true,
      cardType: "HADEETH",
    });
    for (let n = 0; n < 8; n++) {
      const cardId = await card(
        ids.collected,
        stranger,
        n,
        "HADEETH",
        `إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ ${n + 1}`,
        `Ameller ancak niyetlere göredir ${n + 1}.`,
        { source: "Buhârî, Müslim" }
      );
      if (n < 2) await progress(cardId, "MASTERED");
    }
    await client.query(
      "insert into decks_users(user_id, deck_id, created_at) values ($1, $2, now() - interval '1 day')",
      [viewer, ids.collected]
    );

    await deck(ids.courseDeck, owner, titles.courseDeck, {
      description: "Emsile ve Bina dersinin kelimeleri.",
      courseId,
    });
    for (let n = 0; n < 3; n++) {
      await card(
        ids.courseDeck,
        owner,
        n,
        "VOCABULARY",
        `ders kelimesi ${n + 1}`,
        `anlamı ${n + 1}`
      );
    }
    await deck(ids.otherPublic, stranger, titles.otherPublic, {
      description:
        "İ’râb, binâ ve âmil başta olmak üzere temel nahiv ıstılahları.",
      isPublic: true,
    });
    for (let n = 0; n < 2; n++) {
      await card(
        ids.otherPublic,
        stranger,
        n,
        "VOCABULARY",
        `ıstılah ${n + 1}`,
        `tarif ${n + 1}`
      );
    }
    await deck(ids.strangerPrivate, stranger, titles.strangerPrivate);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    await client.end();
    throw error;
  }

  return {
    tag,
    titles,
    ids,
    courseTitle,
    muderrisName,
    remove: async () => {
      try {
        const all = Object.values(ids);
        await client.query("begin");
        await client.query(
          "delete from flashcard_progress where flashcard_id in (select id from flashcards where deck_id = any($1))",
          [all]
        );
        await client.query("delete from decks_users where deck_id = any($1)", [
          all,
        ]);
        await client.query("delete from flashcards where deck_id = any($1)", [
          all,
        ]);
        // Decks a spec created through the form, by the viewer, with this tag.
        await client.query(
          "delete from decks where id = any($1) or (author_id = $2 and title like $3)",
          [all, viewer, `%${tag}%`]
        );
        await client.query("delete from enrollments where course_id = $1", [
          courseId,
        ]);
        await client.query("delete from course_muderris where course_id = $1", [
          courseId,
        ]);
        await client.query("delete from courses where id = $1", [courseId]);
        await client.query("delete from kosks where id = $1", [koskId]);
        await client.query("commit");
      } finally {
        await client.end();
      }
    },
  };
}
