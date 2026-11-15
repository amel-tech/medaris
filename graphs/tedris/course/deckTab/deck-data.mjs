// The decks of tedris.course.deckTab's own course: made after `helpers/course.mjs make deckTab` has opened `Deneme dersi deckTab`, and taken away
// before `helpers/course.mjs remove deckTab` removes the course (the binding's setup and teardown).
//
//   node ../tedris/course/deckTab/deck-data.mjs make [--decks <1|2>]   a published deck of the course, with three cards (and a second, with two)
//   node ../tedris/course/deckTab/deck-data.mjs remove                 the progress rows of the cards, then the decks
//
// Why own decks: a walk of this flow writes marks (rating EASY or HARD) for the account that walks it, which is data of the seeded deck if the walk
// used the seeded course. The course team makes them as the tab's talebe would meet them: POST /courses/{id}/decks (published at once, no week) and
// POST /flashcard/decks/{deckId}/cards, as `MUDERRIS`, the course's one hoca. The first deck's cards are the seeded deck's: فعل/fiil, اسم/isim, حرف/harf.
// `remove` deletes the progress rows with SQL scoped to the ids of the cards it made (no route deletes a progress row, and the cards' progress rows
// stay behind when a deck is deleted: domain finding progress-orphans), then each deck as its author (DELETE /flashcard/decks/{id}).
// The ids go to graphs/.local/deck-tab.json ({"course", "decks": [{"id", "title", "cards": [ids]}]}), which the binding reads as {dt.*}.
// `make` first runs `remove` (a walk that died leaves nothing in the way), and `remove` says `none` when there is nothing to remove.
// Prints `deck-data <mode> <what was done>`. Nothing secret is printed.
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
} from "../../../bindings/helpers/lib.mjs";

const FILE = resolve(LOCAL, "deck-tab.json");
const MADE = resolve(LOCAL, "made", "deckTab.json");
const HOCA = "MUDERRIS";

const FIRST = {
  title: "Deneme destesi deckTab",
  description: "Dersin temel terimleri: fiil, isim, harf.",
  cards: [
    ["فعل", "fiil"],
    ["اسم", "isim"],
    ["حرف", "harf"],
  ],
};
const SECOND = {
  title: "Deneme destesi deckTab ikinci",
  description: "İkinci deste.",
  cards: [
    ["كتاب", "kitap"],
    ["قلم", "kalem"],
  ],
};

async function remove() {
  if (!existsSync(FILE)) return "none";
  const made = JSON.parse(readFileSync(FILE, "utf8"));
  const cards = made.decks.flatMap((d) => d.cards).map((id) => `'${id}'`);
  if (cards.length)
    await query(
      `delete from flashcard_progress where flashcard_id in (${cards.join(", ")})`
    );
  for (const d of made.decks)
    await must(
      HOCA,
      "DELETE",
      `/flashcard/decks/${d.id}`,
      undefined,
      [403, 404]
    );
  rmSync(FILE);
  return `${made.decks.length} deck(s) removed`;
}

run("deck-data", async () => {
  const o = options(process.argv.slice(2), { values: ["decks"] });
  const [mode, ...more] = o.rest;
  if (!["make", "remove"].includes(mode) || more.length)
    throw new Fail("usage: deck-data.mjs make [--decks <1|2>] | remove", 2);
  const old = await remove();
  if (mode === "remove") {
    console.log(`deck-data remove ${old}`);
    return;
  }
  if (!existsSync(MADE))
    throw new Fail(
      "no course: run helpers/course.mjs make deckTab first (graphs/.local/made/deckTab.json)"
    );
  const course = JSON.parse(readFileSync(MADE, "utf8")).course;
  const count = Number(o.decks ?? 1);
  if (![1, 2].includes(count)) throw new Fail("--decks is 1 or 2", 2);
  const decks = [];
  for (const spec of [FIRST, SECOND].slice(0, count)) {
    const made = await must(HOCA, "POST", `/courses/${course}/decks`, {
      title: spec.title,
      description: spec.description,
      cardType: "VOCABULARY",
    });
    const cards = await must(
      HOCA,
      "POST",
      `/flashcard/decks/${made.body.id}/cards`,
      spec.cards.map(([contentFront, contentBack]) => ({
        type: "VOCABULARY",
        contentFront,
        contentBack,
      }))
    );
    decks.push({
      id: made.body.id,
      title: spec.title,
      cards: cards.body.map((c) => c.id),
    });
    // the file is written deck by deck, so a failure half way still leaves the ids `remove` needs
    mkdirSync(LOCAL, { recursive: true });
    writeFileSync(FILE, `${JSON.stringify({ course, decks })}\n`, {
      mode: 0o600,
    });
  }
  console.log(
    `deck-data made ${decks.length} deck(s) in ${course}${old === "none" ? "" : ` (${old} first)`}`
  );
});
