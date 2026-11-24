// The deck of tedris.decks.manageCards' walks: a private deck of the spare talebe `applicantF`, made before a walk opens its card list and taken away
// after it (the binding's setup and teardown), and the check an `effects` entry runs after each write of the walk.
//
//   node ../tedris/decks/manageCards/cards-deck.mjs make [--cards 0|1|3] [--kind vocabulary|hadith]
//   node ../tedris/decks/manageCards/cards-deck.mjs remove
//   node ../tedris/decks/manageCards/cards-deck.mjs drop
//   node ../tedris/decks/manageCards/cards-deck.mjs check add|edit|delete [--back <text>]
//
// make    `Kart yönetimi denemesi`, a private deck, as the author (POST /flashcard/decks), then its cards (POST /flashcard/decks/{id}/cards):
//         --cards 0   none (the empty state; the default)
//         --cards 1   one card, with no progress ("Yeni")
//         --cards 3   three cards, in this order: فعل / fiil with a rating EASY ("Tamamlandı"), اسم / isim with HARD ("Öğreniliyor"),
//                     harf / edat (a Latin front) with none ("Yeni"); the ratings are written as the author (PUT /flashcard/cards/progress)
//         --kind hadith   a Hadis deck (cardType HADEETH); only with --cards 0 (the faces above are Kelime cards)
//         The ids go to graphs/.local/manage-cards.json, which the binding reads as {mc.*}:
//         {"deck", "title", "kind", "cards": [ids, oldest first], "count"}. `make` first runs `remove`, so a walk that died leaves nothing in the way.
// remove  The progress rows of every card of every deck of that title and author (SQL: no route deletes a progress row, and a deleted card or deck
//         leaves them behind, the domain's progress-orphans), then each deck as its author (DELETE /flashcard/decks/{id}, which takes its cards with
//         it). The decks are found with one SELECT, so cards and decks the walk's own UI made are found too. Safe to run twice: `none`.
// drop    The same, but graphs/.local/manage-cards.json stays as it is. For the walk in which the API refuses every write: the deck is taken away
//         under the open page (a `before` of binding.refused.yaml), so the page still shows its cards and the next write answers 404; the data the
//         binding reads ({mc.count}) must stay. Prints `manage-cards dropped ...`.
// check   What the walk's last write did, read with SQL (the only place the page's request body can be seen from outside) and compared with what
//         the file remembers of the deck before it:
//           add      one card more, and the new card's type is the deck's (the e2e decks#18 asserts VOCABULARY; here HADEETH too for a Hadis deck)
//           edit     the same number of cards; with --back <text>, exactly one card has that back face
//           delete   one card less, and it was one the file knew
//         It then writes the deck's new cards and `count` to the file, which the binding reads as {mc.count} (the tab "Kartlar {count}").
//         Prints `manage-cards check <mode> ok (<n> cards)`, or fails with what differed.
//
// Why a deck of its own: the seeded deck "Kelime Defterim" belongs to the seeded talebe and other flows read it; a walk that adds, edits and
// deletes cards changes it. `applicantF` has no deck and no enrolment of its own that this flow touches.
// Prints `manage-cards <mode> <what was done>`. Nothing secret is printed. Not run in the writing phase.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { query } from "../../../bindings/helpers/db.mjs";
import {
  Fail,
  LOCAL,
  must,
  options,
  run,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const AUTHOR = "applicantF";
const TITLE = "Kart yönetimi denemesi";
const FILE = resolve(LOCAL, "manage-cards.json");

// the cards of --cards 3, oldest first: the tab's own progress is a rating each (EASY gives MASTERED, HARD gives LEARNING)
const FACES = [
  { front: "فعل", back: "fiil", rating: "EASY" },
  { front: "اسم", back: "isim", rating: "HARD" },
  { front: "harf", back: "edat", rating: null },
];

const lines = (out) =>
  out
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));

const cardsOf = async (deck) =>
  lines(
    await query(
      `select id, type, content_front, content_back from flashcards where deck_id = '${deck}' order by created_at, id`
    )
  );

async function remove(keepFile = false) {
  const sub = subOf(AUTHOR);
  const decks = lines(
    await query(
      `select id from decks where author_id = '${sub}' and title = '${TITLE}'`
    )
  ).map((r) => r.id);
  for (const id of decks) {
    const ids = (await cardsOf(id)).map((c) => `'${c.id}'`);
    if (ids.length)
      await query(
        `delete from flashcard_progress where flashcard_id in (${ids.join(", ")})`
      );
    await must(
      AUTHOR,
      "DELETE",
      `/flashcard/decks/${id}`,
      undefined,
      [403, 404]
    );
  }
  if (!keepFile && existsSync(FILE)) rmSync(FILE);
  return decks.length ? `${decks.length} deck(s)` : "none";
}

const remembered = () => {
  if (!existsSync(FILE))
    throw new Fail(
      "no deck: run cards-deck.mjs make first (graphs/.local/manage-cards.json)"
    );
  return JSON.parse(readFileSync(FILE, "utf8"));
};

const write = (state) => {
  mkdirSync(LOCAL, { recursive: true });
  writeFileSync(FILE, `${JSON.stringify(state)}\n`, { mode: 0o600 });
};

run("manage-cards", async () => {
  const o = options(process.argv.slice(2), {
    values: ["cards", "kind", "back"],
  });
  const [mode, what, ...more] = o.rest;

  if (mode === "remove" && what === undefined && !more.length) {
    console.log(`manage-cards removed ${await remove()}`);
    return;
  }

  if (mode === "drop" && what === undefined && !more.length) {
    console.log(`manage-cards dropped ${await remove(true)}`);
    return;
  }

  if (mode === "make" && what === undefined && !more.length) {
    const count = Number(o.cards ?? 0);
    const kind = (o.kind ?? "vocabulary").toLowerCase();
    if (![0, 1, 3].includes(count)) throw new Fail("--cards is 0, 1 or 3", 2);
    if (!["vocabulary", "hadith"].includes(kind))
      throw new Fail("--kind is vocabulary or hadith", 2);
    if (kind === "hadith" && count !== 0)
      throw new Fail("a hadith deck is made with --cards 0", 2);
    const old = await remove();
    const cardType = kind === "hadith" ? "HADEETH" : "VOCABULARY";
    const made = await must(AUTHOR, "POST", "/flashcard/decks", {
      title: TITLE,
      description: "Kartları ekleme, düzenleme ve silme denemesi.",
      cardType,
    });
    const deck = made.body.id;
    const state = { deck, title: TITLE, kind: cardType, cards: [], count: 0 };
    // the file is written as soon as the deck exists, so a failure half way still leaves the id `remove` needs (it also finds the deck by title)
    write(state);
    if (count > 0) {
      const faces = FACES.slice(0, count === 1 ? 1 : 3);
      const created = await must(
        AUTHOR,
        "POST",
        `/flashcard/decks/${deck}/cards`,
        faces.map((f) => ({
          type: cardType,
          contentFront: f.front,
          contentBack: f.back,
        }))
      );
      const rated = faces
        .map((f, i) => ({ id: created.body[i].id, rating: f.rating }))
        .filter((c) => c.rating && count === 3);
      if (rated.length)
        await must(
          AUTHOR,
          "PUT",
          "/flashcard/cards/progress",
          rated.map((c) => ({ flashcardId: c.id, rating: c.rating }))
        );
    }
    const cards = await cardsOf(deck);
    write({ ...state, cards: cards.map((c) => c.id), count: cards.length });
    console.log(
      `manage-cards made ${deck} with ${cards.length} card(s)${old === "none" ? "" : ` (${old} removed first)`}`
    );
    return;
  }

  if (
    mode === "check" &&
    ["add", "edit", "delete"].includes(what) &&
    !more.length
  ) {
    const before = remembered();
    const rows = await cardsOf(before.deck);
    const known = new Set(before.cards);
    const fresh = rows.filter((r) => !known.has(r.id));
    const lost = before.cards.filter((id) => !rows.some((r) => r.id === id));
    if (what === "add") {
      if (rows.length !== before.count + 1 || fresh.length !== 1)
        throw new Fail(
          `add: the deck holds ${rows.length} card(s), ${before.count} before, ${fresh.length} of them new; one new card was expected`
        );
      if (fresh[0].type !== before.kind)
        throw new Fail(
          `add: the new card's type is ${fresh[0].type}, the deck's is ${before.kind}`
        );
    } else if (what === "edit") {
      if (rows.length !== before.count || fresh.length || lost.length)
        throw new Fail(
          `edit: the deck holds ${rows.length} card(s), ${before.count} before (${fresh.length} new, ${lost.length} gone); a change of faces adds and removes none`
        );
      if (o.back !== undefined) {
        const n = rows.filter((r) => r.content_back === o.back).length;
        if (n !== 1)
          throw new Fail(
            `edit: ${n} card(s) have the back face the walk typed, 1 expected`
          );
      }
    } else {
      if (rows.length !== before.count - 1 || lost.length !== 1 || fresh.length)
        throw new Fail(
          `delete: the deck holds ${rows.length} card(s), ${before.count} before (${lost.length} gone, ${fresh.length} new); one card less was expected`
        );
    }
    write({ ...before, cards: rows.map((r) => r.id), count: rows.length });
    console.log(`manage-cards check ${what} ok (${rows.length} cards)`);
    return;
  }

  throw new Fail(
    "usage: cards-deck.mjs make [--cards 0|1|3] [--kind vocabulary|hadith] | remove | drop | check add|edit|delete [--back <text>]",
    2
  );
});
