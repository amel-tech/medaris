// Makes what tedris.decks.explore needs that the stack's seed has not got: three published decks, and takes them away again (the binding's setup and
// teardown).
//
//   node ../tedris/decks/explore/public-decks.mjs make     three decks are made, each with one card, asked for publication and published
//   node ../tedris/decks/explore/public-decks.mjs remove   every deck of those names, written by the same people, is deleted
//
// The three (invented names; the words in them are the ones the flow's search types):
//   "Zümrüt hadis seçkisi"   Hadis, written by the medrese nazırı: the deck the walk adds to the collection and takes out. Its name holds a word, "zümrüt",
//                            that no other deck on the stack has, so typing it leaves this one deck in the lists.
//   "Yakut kelime seçkisi"   Kelime, written by the medrese nazırı: a second published deck, of the other type, so that each chip leaves something.
//   "Lâl kelime defteri"     Kelime, written by the talebe: the person's own published deck on the page of `talebe`, marked "Senin desten".
// Why these people: `talebe` is the seeded person enrolled in the courses (so Keşfet has the course deck for them) and `medreseNazir` holds no deck of
// their own and no part in any flow that reads decks. Everything goes through tedrisat's own API, as the people themselves: POST /flashcard/decks, POST
// /flashcard/decks/{id}/cards, POST /flashcard/decks/{id}/publish-request, and, as the başnazım (`systemAdmin`, the only one the seed holds that may
// answer), POST /nizam/deck-publish-requests/{id}/approve. A published deck can be deleted by its author (DELETE /flashcard/decks/{id}), which takes the
// deck's collection rows with it (the table cascades). No SQL for the making.
//
// The two SQL statements are one read and one delete: `decks` is read for the ids of decks of those names (the API gives a person only their own list,
// and a deck of `medreseNazir` is not on `talebe`'s), and the approval's notification, DECK_PUBLISH_RESULT to the author, is deleted by the deck's id
// because no route removes a notification (the same as helpers/course.mjs does for a course).
// The ids go to graphs/.local/explore-decks.json ({"hadith","vocab","own"}), which the binding reads as {explore.hadith}. `make` first removes what an
// earlier walk that died left, so it can run twice; `remove` says `none` when there is nothing. A deck is touched only when its author is the one named here.
// Prints `public-decks <mode> <what was done>`. Nothing secret is printed.
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { query } from "../../../bindings/helpers/db.mjs";
import {
  Fail,
  LOCAL,
  must,
  run,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const FILE = resolve(LOCAL, "explore-decks.json");

// made in this order, so that the first one is the oldest; the Hadis deck, the one the walk acts on, is the newest
const DECKS = [
  {
    key: "own",
    author: "talebe",
    cardType: "VOCABULARY",
    title: "Lâl kelime defteri",
    front: "كتاب",
    back: "kitap",
  },
  {
    key: "vocab",
    author: "medreseNazir",
    cardType: "VOCABULARY",
    title: "Yakut kelime seçkisi",
    front: "مدرسة",
    back: "medrese",
  },
  {
    key: "hadith",
    author: "medreseNazir",
    cardType: "HADEETH",
    title: "Zümrüt hadis seçkisi",
    front: "إنما الأعمال بالنيات",
    back: "Ameller ancak niyetlere göredir. Buhârî, Müslim",
  },
];

const quoted = (list) => list.map((x) => `'${x}'`).join(", ");

/** The decks of those names that were written by the people named here: `{ deck, id }` each. */
const found = async () => {
  const out = await query(
    `select id, title, author_id from decks where title in (${quoted(DECKS.map((d) => d.title))})`
  );
  const rows = out
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  const mine = [];
  for (const row of rows) {
    const deck = DECKS.find(
      (d) => d.title === row.title && subOf(d.author) === row.author_id
    );
    if (deck) mine.push({ deck, id: row.id });
  }
  return mine;
};

const remove = async () => {
  const mine = await found();
  for (const { deck, id } of mine)
    await must(
      deck.author,
      "DELETE",
      `/flashcard/decks/${id}`,
      undefined,
      [404]
    );
  if (mine.length)
    await query(
      `delete from notifications where target_id in (${quoted(mine.map((m) => m.id))})`
    );
  if (existsSync(FILE)) rmSync(FILE);
  return mine.length;
};

run("public-decks", async () => {
  const [mode, ...more] = process.argv.slice(2);
  if (!["make", "remove"].includes(mode) || more.length)
    throw new Fail("usage: public-decks.mjs make|remove", 2);

  const old = await remove();
  if (mode === "remove") {
    console.log(`public-decks remove ${old ? old : "none"}`);
    return;
  }
  const ids = {};
  for (const d of DECKS) {
    const made = await must(d.author, "POST", "/flashcard/decks", {
      title: d.title,
      cardType: d.cardType,
    });
    const id = made.body.id;
    ids[d.key] = id;
    await must(d.author, "POST", `/flashcard/decks/${id}/cards`, [
      { type: d.cardType, contentFront: d.front, contentBack: d.back },
    ]);
    await must(d.author, "POST", `/flashcard/decks/${id}/publish-request`);
    await must(
      "systemAdmin",
      "POST",
      `/nizam/deck-publish-requests/${id}/approve`
    );
  }
  mkdirSync(LOCAL, { recursive: true });
  writeFileSync(FILE, `${JSON.stringify(ids)}\n`, { mode: 0o600 });
  console.log(
    `public-decks made ${DECKS.length}${old ? ` (removed ${old} old)` : ""}`
  );
});
