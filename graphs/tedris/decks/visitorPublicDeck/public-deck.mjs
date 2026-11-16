// What tedris.decks.visitorPublicDeck needs that the seed has not got: a public deck of a known size, made the way a person gets one
// (the author makes it, asks for it to be published, and the Medaris başnazım approves the request), and the means to check that a
// closed deck's page gives a visitor nothing. It is the binding's `setup`, `teardown` and `effects`.
//
//   node ../tedris/decks/visitorPublicDeck/public-deck.mjs make [--cards N]   a public deck of N cards (default 12), as APPLICANT_B
//   node ../tedris/decks/visitorPublicDeck/public-deck.mjs remove              every deck of that title by that author is deleted
//   node ../tedris/decks/visitorPublicDeck/public-deck.mjs anon <deckId>       what the API gives a caller with no token for that deck
//   node ../tedris/decks/visitorPublicDeck/public-deck.mjs hidden <deckId> <ACCOUNT>
//                                                                              the deck's title and every card's back, read as its
//                                                                              author, are in no page a visitor is given for it
//
// make   POST /flashcard/decks (as the author, who is a spare talebe with no deck of their own), POST /flashcard/decks/{id}/cards once
//        for each card (one request a card, so that each has its own creation time and the API's order is the order written here),
//        POST /flashcard/decks/{id}/publish-request, then POST /nizam/deck-publish-requests/{id}/approve as `systemAdmin`. It then asks
//        the API as nobody for the deck and for its cards and refuses to go on unless the deck is public and has all N cards.
//        Everything goes through the API; the only SQL is one SELECT that finds an old deck by title and, in `remove`, one DELETE. Writes the deck's id to
//        graphs/.local/public-deck.json ({"id","title","cards","first":{"front","back"}}), which the binding reads as {pd.id}.
//        It makes a deck again by removing the old one first, so a walk that died half way leaves nothing behind.
//        Approving the request writes a notification (DECK_PUBLISH_RESULT) for the author; `remove` deletes the ones that point at the
//        deck, with one SQL DELETE (no route removes a notification, as course.mjs says), and no other notification of the author.
// remove Deletes the deck's notifications, then the deck as its author (the API allows it for a published deck), and the file; `none`
//        when there is no deck.
// anon   Prints `public-deck anon <status> <code or isPublic>`, a read with no token.
// hidden Reads the deck and its cards as the account that wrote it, then asks tedris-web for /decks/<id> and /decks/study/<id> with no
//        cookie and fails when the page holds the deck's title or any card's back. Prints `public-deck hidden <n> words, none in the
//        pages`. It reads only: it changes nothing.
// Nothing secret is printed: no password and no token.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { query } from "../../../bindings/helpers/db.mjs";
import {
  API,
  Fail,
  LOCAL,
  must,
  options,
  run,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const AUTHOR = process.env.PUBLIC_DECK_AUTHOR ?? "applicantB";
const REVIEWER = "systemAdmin";
const TEDRIS = (process.env.TEDRIS_URL ?? "http://localhost:4000").replace(
  /\/$/,
  ""
);
const TITLE = "Açık deste denemesi";
const FILE = resolve(LOCAL, "public-deck.json");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// twelve Arabic words with a Turkish meaning each: neutral vocabulary, in the order the cards are written
const WORDS = [
  ["كتاب", "kitap"],
  ["قلم", "kalem"],
  ["باب", "kapı"],
  ["بيت", "ev"],
  ["ماء", "su"],
  ["شمس", "güneş"],
  ["قمر", "ay"],
  ["نجم", "yıldız"],
  ["طريق", "yol"],
  ["مدرسة", "okul"],
  ["معلم", "öğretmen"],
  ["طالب", "öğrenci"],
];

const idsOf = async () => {
  const out = await query(
    `select id from decks where title = '${TITLE}' and author_id = '${subOf(AUTHOR)}'`
  );
  return out
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l).id);
};

const removeAll = async () => {
  const ids = await idsOf();
  if (ids.length)
    await query(
      `delete from notifications where target_id in (${ids.map((id) => `'${id}'`).join(", ")})`
    );
  for (const id of ids)
    await must(AUTHOR, "DELETE", `/flashcard/decks/${id}`, undefined, [404]);
  rmSync(FILE, { force: true });
  return ids.length;
};

const asNobody = async (path) => {
  const res = await fetch(`${API}${path}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }
  return { status: res.status, body, text };
};

const make = async (count) => {
  if (!Number.isInteger(count) || count < 0 || count > WORDS.length)
    throw new Fail(`--cards is a whole number from 0 to ${WORDS.length}`, 2);
  const old = await removeAll();
  const deck = (
    await must(AUTHOR, "POST", "/flashcard/decks", {
      title: TITLE,
      cardType: "VOCABULARY",
    })
  ).body;
  const id = deck?.id;
  if (!UUID.test(id ?? ""))
    throw new Fail("the API did not give the new deck's id");
  for (const [front, back] of WORDS.slice(0, count))
    await must(AUTHOR, "POST", `/flashcard/decks/${id}/cards`, [
      { type: "VOCABULARY", contentFront: front, contentBack: back },
    ]);
  await must(AUTHOR, "POST", `/flashcard/decks/${id}/publish-request`);
  await must(REVIEWER, "POST", `/nizam/deck-publish-requests/${id}/approve`);

  const seen = await asNobody(`/flashcard/decks/${id}`);
  if (seen.status !== 200 || seen.body?.isPublic !== true)
    throw new Fail(
      `a caller with no token gets HTTP ${seen.status} for the deck, not a public deck`
    );
  const cards = await asNobody(`/flashcard/cards?deckId=${id}`);
  if (cards.status !== 200 || cards.body?.length !== count)
    throw new Fail(
      `a caller with no token gets HTTP ${cards.status} and ${Array.isArray(cards.body) ? cards.body.length : "no"} cards, not ${count}`
    );
  const first = cards.body[0];
  mkdirSync(LOCAL, { recursive: true });
  writeFileSync(
    FILE,
    `${JSON.stringify({
      id,
      title: TITLE,
      cards: count,
      first: first
        ? { front: first.contentFront, back: first.contentBack }
        : null,
    })}\n`,
    { mode: 0o600 }
  );
  console.log(
    `public-deck made ${id} ${count} cards${old ? ` (removed ${old} old)` : ""}`
  );
};

const anon = async (id) => {
  if (!UUID.test(id ?? ""))
    throw new Fail("usage: public-deck.mjs anon <deckId>", 2);
  const r = await asNobody(`/flashcard/decks/${id}`);
  const what =
    r.body?.code ?? (r.body?.isPublic === true ? "isPublic" : "not public");
  console.log(`public-deck anon ${r.status} ${what}`);
};

const hidden = async (id, account) => {
  if (!UUID.test(id ?? "") || !account)
    throw new Fail("usage: public-deck.mjs hidden <deckId> <ACCOUNT>", 2);
  const deck = (await must(account, "GET", `/flashcard/decks/${id}`)).body;
  const rows = (await must(account, "GET", `/flashcard/cards?deckId=${id}`))
    .body;
  const words = [deck.title, ...rows.map((c) => c.contentBack)].filter(
    (w) => typeof w === "string" && w.length >= 3
  );
  for (const path of [`/decks/${id}`, `/decks/study/${id}`]) {
    const res = await fetch(`${TEDRIS}${path}`, {
      redirect: "manual",
      signal: AbortSignal.timeout(60_000),
    });
    const page = await res.text();
    for (const word of words)
      if (page.includes(word))
        throw new Fail(
          `${path} (HTTP ${res.status}) holds "${word}" for a visitor`
        );
  }
  console.log(`public-deck hidden ${words.length} words, none in the pages`);
};

run("public-deck", async () => {
  const [mode, ...rest] = process.argv.slice(2);
  if (mode === "make") {
    const o = options(rest, { values: ["cards"] });
    if (o.rest.length)
      throw new Fail("usage: public-deck.mjs make [--cards N]", 2);
    return make(o.cards === undefined ? 12 : Number(o.cards));
  }
  if (mode === "remove") {
    if (rest.length) throw new Fail("usage: public-deck.mjs remove", 2);
    const n = await removeAll();
    console.log(`public-deck remove ${n ? n : "none"}`);
    return undefined;
  }
  if (mode === "anon") return anon(rest[0]);
  if (mode === "hidden") return hidden(rest[0], rest[1]);
  throw new Fail(
    "usage: public-deck.mjs make [--cards N] | remove | anon <deckId> | hidden <deckId> <ACCOUNT>",
    2
  );
});
