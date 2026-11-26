// The deck of tedris.decks.editOrDelete's own: made through the API as the spare talebe `applicantA` before a walk and taken away again after it
// (the binding's setup and teardown). The seeded decks are other flows' data and are never touched.
//
//   node ../tedris/decks/editOrDelete/deck.mjs make [--pending] [--cards <n>]   a private deck "Deneme destesi: düzenleme" of applicantA with <n> cards
//                                                                              (default 3); with --pending the author also asks for its publication
//   node ../tedris/decks/editOrDelete/deck.mjs remove                          every deck of applicantA whose name starts "Deneme destesi: düzen"
//
// Why applicantA: a talebe with a full profile and no enrolment, whom none of the deck flows written so far takes as the author of a deck (they
// take C to H, and some count the list of decks); tedris.shell.home also uses A, with a deck of another title that it removes itself. A deck needs no
// seat. The account's own deck list holds nothing but this deck, so the "Desteler" page of the walk has one card.
// What `make` does, all through tedrisat's HTTP API and in this order: the first call as the account (GET /me, which gives the account its users row
// if it has none), POST /flashcard/decks {title, description, cardType: VOCABULARY}, POST /flashcard/decks/{id}/cards (one array of cards, the seeded
// deck's three words), and with --pending POST /flashcard/decks/{id}/publish-request. The ids go to graphs/.local/edit-or-delete.json
// ({"deck": "<uuid>", "title": "<the title>"}), which the binding reads as {eod.deck}. `make` first runs `remove`, so a walk that died leaves nothing
// in the way, and `remove` finds the decks by author and by the title's beginning with one SELECT (a walk renames the deck, so the id file alone
// is not enough) and deletes each as its author (DELETE /flashcard/decks/{id}, which also takes the cards, the collection rows and the label rows
// with it); it says `none` when there is nothing. The cards' progress rows stay behind when a deck is deleted (the domain's progress-orphans), but
// this walk never studies the deck, so it writes none.
// Prints `deck <mode> <what was done>`. Nothing secret is printed.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
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

const AUTHOR = "applicantA";
const FILE = resolve(LOCAL, "edit-or-delete.json");
const TITLE = "Deneme destesi: düzenleme";
const DESCRIPTION = "Düzenlemeden önceki açıklama.";
const CARDS = [
  ["فعل", "fiil"],
  ["اسم", "isim"],
  ["حرف", "harf"],
  ["كتاب", "kitap"],
  ["قلم", "kalem"],
];

const remove = async () => {
  const out = await query(
    `select id from decks where author_id = '${subOf(AUTHOR)}' and title like 'Deneme destesi: düzen%'`
  );
  const ids = out
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l).id);
  for (const id of ids)
    await must(AUTHOR, "DELETE", `/flashcard/decks/${id}`, undefined, [404]);
  rmSync(FILE, { force: true });
  return ids.length;
};

run("deck", async () => {
  const o = options(process.argv.slice(2), {
    values: ["cards"],
    flags: ["pending"],
  });
  const [mode, ...more] = o.rest;
  if (!["make", "remove"].includes(mode) || more.length)
    throw new Fail(
      "usage: deck.mjs make [--pending] [--cards <n>] | remove",
      2
    );
  const old = await remove();
  if (mode === "remove") {
    console.log(`deck remove ${old ? `${old} deck(s) removed` : "none"}`);
    return;
  }
  const n = Number(o.cards ?? 3);
  if (!Number.isInteger(n) || n < 0 || n > CARDS.length)
    throw new Fail(`--cards is a number from 0 to ${CARDS.length}`, 2);
  await must(AUTHOR, "GET", "/me");
  const made = await must(AUTHOR, "POST", "/flashcard/decks", {
    title: TITLE,
    description: DESCRIPTION,
    cardType: "VOCABULARY",
  });
  const id = made.body.id;
  // the id is written before anything else is added, so a failure half way still leaves what `remove` needs
  mkdirSync(LOCAL, { recursive: true });
  writeFileSync(FILE, `${JSON.stringify({ deck: id, title: TITLE })}\n`, {
    mode: 0o600,
  });
  if (n > 0)
    await must(
      AUTHOR,
      "POST",
      `/flashcard/decks/${id}/cards`,
      CARDS.slice(0, n).map(([contentFront, contentBack]) => ({
        type: "VOCABULARY",
        contentFront,
        contentBack,
      }))
    );
  if (o.pending)
    await must(AUTHOR, "POST", `/flashcard/decks/${id}/publish-request`);
  console.log(
    `deck made ${id} with ${n} card(s)${o.pending ? ", publication asked" : ""}${old ? ` (${old} old removed first)` : ""}`
  );
});
