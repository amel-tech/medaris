// The deck of tedris.decks.study's walks: made for the spare talebe that studies it, and taken away again (the binding's setup and teardown).
//
//   node ../tedris/decks/study/study-data.mjs make <ACCOUNT> <waiting|unstarted|single|nothing>   a private deck "Deneme destesi study" of that kind
//   node ../tedris/decks/study/study-data.mjs drop-card <ACCOUNT> <n>                              the author deletes the n-th card (0 is the first), as a person
//                                                                                                  would do in another tab while the round is open
//   node ../tedris/decks/study/study-data.mjs remove <ACCOUNT>                                     the progress rows of its cards, then the deck
//
// What each kind gives the page (the study round of GET /flashcard/decks/{id}/due: the cards waiting for a repeat, then the cards never studied):
//   waiting    three cards: the first two have a progress row with a bare status LEARNING (a row written without a rating has no due time, and a
//              LEARNING row with no due time is due now: invariant card-review-due), the third has none. The round is all three, the repeats first.
//              This is e2e learn#7's fixture, a round of "2 waiting, 1 new" ("Bu tur: 0 / 3 kart").
//   unstarted  three cards, none with a progress row: "3 yeni kart"
//   single     one card, none studied
//   nothing    a deck with no card at all: "Bugün için bitti" (DCK-27)
// Why one card a request: the round orders the repeats by `due_at` (null first), then by the card's `created_at`, then by its id. Three cards written in
// one request share one `created_at` and so come back in the order of their random ids; written one request each, they come back in the order they were
// written, so the first card of the round is the first one made and a walk can know it. The ids and the faces go to graphs/.local/study.json
// ({"account", "deck", "title", "kind", "cards": [{"id", "front", "back"}]}), which the binding reads as {study.*}.
//
// `remove` deletes the progress rows with SQL scoped to the ids of the walk's own cards (no route deletes a progress row, and a deck deleted through
// the API leaves its cards' rows behind: the domain's progress-orphans), then the deck as its author. It finds the deck by the file, and by its title in
// the person's own private decks, so a walk that died before the file was written leaves nothing the next `make` trips on. `make` first runs `remove`.
// The seeded decks and every other deck of the person are never touched. Nothing secret is printed.
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
  accountKey,
  call,
  Fail,
  LOCAL,
  must,
  run,
} from "../../../bindings/helpers/lib.mjs";

const FILE = resolve(LOCAL, "study.json");
const TITLE = "Deneme destesi study";
const FACES = [
  ["فعل", "fiil"],
  ["اسم", "isim"],
  ["حرف", "harf"],
];
const KINDS = { waiting: 3, unstarted: 3, single: 1, nothing: 0 };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const read = () =>
  existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : null;
const save = (made) => {
  mkdirSync(LOCAL, { recursive: true });
  writeFileSync(FILE, `${JSON.stringify(made)}\n`, { mode: 0o600 });
};
const list = (r) => (Array.isArray(r.body) ? r.body : (r.body?.items ?? []));

async function remove(account) {
  const made = read();
  const decks = new Set();
  const cards = new Set();
  if (made?.account === accountKey(account)) {
    if (made.deck) decks.add(made.deck);
    for (const c of made.cards ?? []) cards.add(c.id);
  }
  const own = await must(account, "GET", "/flashcard/decks?isPublic=false");
  for (const d of list(own).filter((x) => x.title === TITLE)) decks.add(d.id);
  for (const id of decks) {
    const r = await call(account, "GET", `/flashcard/cards?deckId=${id}`);
    if (r.status === 200) for (const c of list(r)) cards.add(c.id);
  }
  const ids = [...cards].filter((id) => UUID.test(id));
  if (ids.length)
    await query(
      `delete from flashcard_progress where flashcard_id in (${ids.map((id) => `'${id}'`).join(", ")})`
    );
  for (const id of decks)
    await must(
      account,
      "DELETE",
      `/flashcard/decks/${id}`,
      undefined,
      [403, 404]
    );
  if (existsSync(FILE)) rmSync(FILE);
  return decks.size ? `${decks.size} deck(s) removed` : "none";
}

run("study-data", async () => {
  const [mode, account, arg, ...more] = process.argv.slice(2);
  const usage =
    "usage: study-data.mjs make <ACCOUNT> <waiting|unstarted|single|nothing> | drop-card <ACCOUNT> <n> | remove <ACCOUNT>";
  if (
    !["make", "drop-card", "remove"].includes(mode) ||
    !account ||
    more.length
  )
    throw new Fail(usage, 2);
  const key = accountKey(account);

  if (mode === "remove") {
    if (arg !== undefined) throw new Fail(usage, 2);
    console.log(`study-data remove ${key} ${await remove(account)}`);
    return;
  }

  if (mode === "drop-card") {
    const made = read();
    const card = made?.cards?.[Number(arg)];
    if (!made || made.account !== key)
      throw new Fail(
        `no deck of ${key} in graphs/.local/study.json: run make first`
      );
    if (!card) throw new Fail(`the deck has no card ${arg}`, 2);
    const r = await must(
      account,
      "DELETE",
      `/flashcard/cards/${card.id}`,
      undefined,
      [403, 404]
    );
    console.log(
      `study-data drop-card ${key} ${arg} ${r.status === 404 ? "already gone" : "deleted"}`
    );
    return;
  }

  const kind = arg;
  if (!(kind in KINDS)) throw new Fail(usage, 2);
  const old = await remove(account);
  const deck = (
    await must(account, "POST", "/flashcard/decks", {
      title: TITLE,
      cardType: "VOCABULARY",
    })
  ).body;
  const made = { account: key, deck: deck.id, title: TITLE, kind, cards: [] };
  save(made);
  for (const [front, back] of FACES.slice(0, KINDS[kind])) {
    const r = await must(account, "POST", `/flashcard/decks/${deck.id}/cards`, [
      { type: "VOCABULARY", contentFront: front, contentBack: back },
    ]);
    made.cards.push({ id: r.body[0].id, front, back });
    save(made); // a failure half way still leaves the ids `remove` needs
  }
  if (kind === "waiting")
    await must(
      account,
      "PUT",
      "/flashcard/cards/progress",
      made.cards
        .slice(0, 2)
        .map((c) => ({ flashcardId: c.id, status: "LEARNING" }))
    );
  const round = await must(account, "GET", `/flashcard/decks/${deck.id}/due`);
  console.log(
    `study-data make ${key} ${kind} deck ${deck.id}: ${made.cards.length} card(s), round of ${round.body.cards.length} (${round.body.dueCount} waiting, ${round.body.newCount} new)${old === "none" ? "" : `, ${old} first`}`
  );
});
