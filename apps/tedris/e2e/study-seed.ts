import { randomUUID } from "node:crypto";
import pg from "pg";

/**
 * What the Ana sayfa, Çalışma and girişsiz deste specs put in tedrisat's
 * database (MDRS-165), under random ids, and take out again. Direct SQL: no
 * endpoint writes a due time or collects a deck on someone's behalf.
 *
 * `viewer` is the signed-in talebe's Keycloak `sub`. They own a deck of four
 * cards: two waiting for a repeat (one with a time that has passed, one the
 * old toggle left without any), one learning that is not due for three days,
 * and one never studied. They are enrolled in a course (40 %, a session in two
 * days) whose deck gained two cards since they collected it, and follow a köşk
 * with one course they are not in. A stranger's public hadith deck (eight
 * cards) is what a visitor reads, beside the stranger's private one.
 */
export interface StudyFixture {
  tag: string;
  titles: {
    own: string;
    courseDeck: string;
    publicDeck: string;
    strangerPrivate: string;
    enrolledCourse: string;
    followedCourse: string;
    followedKosk: string;
  };
  ids: {
    own: string;
    courseDeck: string;
    publicDeck: string;
    strangerPrivate: string;
    enrolledCourse: string;
    followedCourse: string;
    /** the own deck's cards, by what they wait for */
    cards: { dueA: string; dueB: string; later: string; fresh: string };
  };
  fronts: { dueA: string; dueB: string; later: string; fresh: string };
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

export async function seedStudy(viewer: string): Promise<StudyFixture> {
  const client = new pg.Client({ connectionString: databaseUrl() });
  await client.connect();
  const id = () => randomUUID();
  const tag = randomUUID().slice(0, 6);
  const owner = id();
  const stranger = id();
  const koskE = id();
  const koskF = id();
  const weekE = id();
  const ids = {
    own: id(),
    courseDeck: id(),
    publicDeck: id(),
    strangerPrivate: id(),
    enrolledCourse: id(),
    followedCourse: id(),
    cards: { dueA: id(), dueB: id(), later: id(), fresh: id() },
  };
  const titles = {
    own: `Mehmûz fiiller ${tag}`,
    courseDeck: `Emsile’nin altı bâbı ${tag}`,
    publicDeck: `Kırk hadis ${tag}`,
    strangerPrivate: `Gizli deste ${tag}`,
    enrolledCourse: `Emsile ve Bina ${tag}`,
    followedCourse: `Avâmil ve Tasrîf ${tag}`,
    followedKosk: `Fatih Köşkü ${tag}`,
  };
  const fronts = {
    dueA: "رَأَى يَرَى رُؤْيَةً",
    dueB: "أَخَذَ يَأْخُذُ أَخْذًا",
    later: "سَأَلَ يَسْأَلُ سُؤَالًا",
    fresh: "قَرَأَ يَقْرَأُ قِرَاءَةً",
  };

  const deck = (
    deckId: string,
    author: string,
    title: string,
    extra: { isPublic?: boolean; cardType?: string; courseId?: string } = {}
  ) =>
    client.query(
      `insert into decks(id, author_id, title, description, is_public, publish_status, card_type, course_id)
       values ($1, $2, $3, 'Deneme destesi.', $4, $5, $6, $7)`,
      [
        deckId,
        author,
        title,
        extra.isPublic ?? false,
        extra.isPublic ? "PUBLISHED" : "PRIVATE",
        extra.cardType ?? "VOCABULARY",
        extra.courseId ?? null,
      ]
    );
  const card = (
    cardId: string,
    deckId: string,
    author: string,
    type: string,
    front: string,
    back: string,
    ageDays: number,
    meta?: object
  ) =>
    client.query(
      `insert into flashcards(id, deck_id, author_id, type, content_front, content_back, content_meta, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, now() - ($8 || ' days')::interval)`,
      [cardId, deckId, author, type, front, back, meta ?? null, String(ageDays)]
    );
  const progress = (
    cardId: string,
    status: string,
    due: string | null,
    interval: number
  ) =>
    client.query(
      `insert into flashcard_progress(user_id, flashcard_id, status, due_at, interval_days)
       values ($1, $2, $3, ${due ? `now() + interval '${due}'` : "null"}, $4)`,
      [viewer, cardId, status, interval]
    );

  try {
    await client.query("begin");
    await client.query(
      "insert into kosks(id, owner_id, name) values ($1, $2, $3), ($4, $2, $5)",
      [koskE, owner, `Nûruosmaniye Köşkü ${tag}`, koskF, titles.followedKosk]
    );
    await client.query(
      "insert into courses(id, kosk_id, author_id, title, status) values ($1, $2, $3, $4, 'PUBLISHED'), ($5, $6, $3, $7, 'PUBLISHED')",
      [
        ids.enrolledCourse,
        koskE,
        owner,
        titles.enrolledCourse,
        ids.followedCourse,
        koskF,
        titles.followedCourse,
      ]
    );
    await client.query(
      "insert into course_muderris(course_id, name, order_index) values ($1, 'Ayşe Nur Kılıçarslan', 0)",
      [ids.followedCourse]
    );
    await client.query(
      "insert into enrollments(user_id, course_id, status, progress) values ($1, $2, 'ENROLLED', 40)",
      [viewer, ids.enrolledCourse]
    );
    await client.query(
      "insert into kosk_followers(user_id, kosk_id) values ($1, $2)",
      [viewer, koskF]
    );
    await client.query(
      "insert into course_weeks(id, course_id, week_number, title, order_index) values ($1, $2, 5, 'Hafta', 0)",
      [weekE, ids.enrolledCourse]
    );
    await client.query(
      `insert into lessons(id, week_id, title, type, order_index, duration_minutes, scheduled_at)
       values ($1, $2, $3, 'LIVE', 0, 60, now() + interval '2 days')`,
      [id(), weekE, `Mehmûz fiiller: kara’e ve emr-i hâzır ${tag}`]
    );

    await deck(ids.own, viewer, titles.own);
    await card(
      ids.cards.dueA,
      ids.own,
      viewer,
      "VOCABULARY",
      fronts.dueA,
      "Gördü, görür, görmek.",
      9
    );
    await card(
      ids.cards.dueB,
      ids.own,
      viewer,
      "VOCABULARY",
      fronts.dueB,
      "Aldı, alır, almak.",
      9
    );
    await card(
      ids.cards.later,
      ids.own,
      viewer,
      "VOCABULARY",
      fronts.later,
      "Sordu, sorar, sormak.",
      9
    );
    await card(
      ids.cards.fresh,
      ids.own,
      viewer,
      "VOCABULARY",
      fronts.fresh,
      "Okudu, okur, okumak.",
      9
    );
    await progress(ids.cards.dueA, "LEARNING", "-2 days", 1);
    await progress(ids.cards.dueB, "LEARNING", null, 0);
    await progress(ids.cards.later, "LEARNING", "3 days", 3);

    // A course's deck the viewer collected a day ago; its two cards are newer.
    await deck(ids.courseDeck, owner, titles.courseDeck, {
      courseId: ids.enrolledCourse,
    });
    await card(
      id(),
      ids.courseDeck,
      owner,
      "VOCABULARY",
      "نَصَرَ يَنْصُرُ",
      "Yardım etti.",
      0
    );
    await card(
      id(),
      ids.courseDeck,
      owner,
      "VOCABULARY",
      "ضَرَبَ يَضْرِبُ",
      "Vurdu.",
      0
    );
    await client.query(
      "insert into decks_users(user_id, deck_id, created_at) values ($1, $2, now() - interval '1 day')",
      [viewer, ids.courseDeck]
    );

    await deck(ids.publicDeck, stranger, titles.publicDeck, {
      isPublic: true,
      cardType: "HADEETH",
    });
    for (let n = 0; n < 8; n++) {
      await card(
        id(),
        ids.publicDeck,
        stranger,
        "HADEETH",
        `إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ ${n + 1}`,
        `Ameller ancak niyetlere göredir ${n + 1}.`,
        1,
        { source: "Buhârî, Müslim" }
      );
    }
    await deck(ids.strangerPrivate, stranger, titles.strangerPrivate);
    await card(
      id(),
      ids.strangerPrivate,
      stranger,
      "VOCABULARY",
      "gizli",
      "gizli anlam",
      1
    );
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
    fronts,
    remove: async () => {
      try {
        const decksIds = [
          ids.own,
          ids.courseDeck,
          ids.publicDeck,
          ids.strangerPrivate,
        ];
        const courses = [ids.enrolledCourse, ids.followedCourse];
        await client.query("begin");
        await client.query(
          "delete from flashcard_progress where flashcard_id in (select id from flashcards where deck_id = any($1))",
          [decksIds]
        );
        await client.query("delete from decks_users where deck_id = any($1)", [
          decksIds,
        ]);
        await client.query("delete from flashcards where deck_id = any($1)", [
          decksIds,
        ]);
        await client.query("delete from decks where id = any($1)", [decksIds]);
        await client.query("delete from kosk_followers where kosk_id = $1", [
          koskF,
        ]);
        await client.query("delete from lessons where week_id = $1", [weekE]);
        await client.query("delete from course_weeks where id = $1", [weekE]);
        await client.query(
          "delete from enrollments where course_id = any($1)",
          [courses]
        );
        await client.query(
          "delete from course_muderris where course_id = any($1)",
          [courses]
        );
        await client.query("delete from courses where id = any($1)", [courses]);
        await client.query("delete from kosks where id = any($1)", [
          [koskE, koskF],
        ]);
        await client.query("commit");
      } finally {
        await client.end();
      }
    },
  };
}
