// Makes the one thing tedris.decks.accessRefusals needs that the seed has not got: a deck that was shared with a talebe and has been hidden,
// and takes it away again (the binding's setup and teardown).
//
//   node ../tedris/decks/accessRefusals/hidden-deck.mjs make     a köşk deck of the seeded köşk, then hidden
//   node ../tedris/decks/accessRefusals/hidden-deck.mjs remove   every deck of that title in the köşk is deleted
//
// Why a köşk deck: a deck is shared with the talebe of a course, a köşk or a medrese (flashcard/deck-sharing.ts), and a talebe of the seeded
// köşk's courses (TALEBE is in three) reads a köşk deck of it. The köşk's nazım makes it (POST /kosks/{id}/decks, as `koskNazim`, who is
// then its author) and hides it (POST /decks/{id}/hide); after that the deck is shared with nobody and the talebe's read answers 404. No SQL
// for the making. `remove` deletes the deck as its author (DELETE /flashcard/decks/{id}), which also works while it is hidden; it finds the
// decks by title with one SELECT (the decks list does not show a hidden deck to anyone), because the id file may be gone or stale.
// The deck's id is written to graphs/.local/access-refusals.json ({"hidden": "<uuid>"}), which the binding reads as {ar.hidden}. `make`
// and `remove` are idempotent: `make` first deletes any deck of that title, `remove` says `none` when there is none.
// Prints `hidden-deck <mode> <what was done>`. Nothing secret is printed.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { query } from "../../../bindings/helpers/db.mjs";
import {
  Fail,
  LOCAL,
  must,
  run,
  seed,
} from "../../../bindings/helpers/lib.mjs";

const TITLE = "Gizlenen deste denemesi";
const FILE = resolve(LOCAL, "access-refusals.json");

const idsOf = async () => {
  const out = await query(
    `select id from decks where title = '${TITLE}' and kosk_id = '${seed().kosk}'`
  );
  return out
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l).id);
};

const remove = async (ids) => {
  for (const id of ids)
    await must(
      "koskNazim",
      "DELETE",
      `/flashcard/decks/${id}`,
      undefined,
      [404]
    );
};

run("hidden-deck", async () => {
  const [mode, ...more] = process.argv.slice(2);
  if (!["make", "remove"].includes(mode) || more.length)
    throw new Fail("usage: hidden-deck.mjs make|remove", 2);

  const old = await idsOf();
  await remove(old);
  if (mode === "remove") {
    console.log(`hidden-deck remove ${old.length ? old.length : "none"}`);
    return;
  }
  const made = await must("koskNazim", "POST", `/kosks/${seed().kosk}/decks`, {
    title: TITLE,
    cardType: "VOCABULARY",
  });
  const id = made.body.id;
  await must("koskNazim", "POST", `/decks/${id}/hide`);
  mkdirSync(LOCAL, { recursive: true });
  writeFileSync(FILE, `${JSON.stringify({ hidden: id })}\n`, { mode: 0o600 });
  console.log(
    `hidden-deck made ${id}${old.length ? ` (removed ${old.length} old)` : ""}`
  );
});
