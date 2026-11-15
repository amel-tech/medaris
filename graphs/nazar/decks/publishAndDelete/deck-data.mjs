// The deck of nazar.decks.publishAndDelete's own course: made after `helpers/course.mjs make pubDel` has opened `Deneme dersi pubDel`, and taken away before
// `helpers/course.mjs remove pubDel` removes the course (the binding's setup and teardown).
//
//   node ../nazar/decks/publishAndDelete/deck-data.mjs make [--published]   one deck of the course, with three cards: a draft, or with --published a published one
//   node ../nazar/decks/publishAndDelete/deck-data.mjs remove               the deck, if it is still there
//
// The course team makes the deck as the page's own reader would, through the course routes: POST /courses/{id}/decks (draft or published, no week) and
// POST /flashcard/decks/{deckId}/cards, as `MUDERRIS`, the course's one hoca. The first card is the one the seeded deck opens with (فعل / fiil).
// `remove` first takes a published deck back to a draft (PATCH /courses/{id}/decks/{deckId}, the only way the course route allows a delete) and then
// deletes it (DELETE /courses/{id}/decks/{deckId}); a 403 or 404 on either is fine, because the walk deletes it itself in some scenarios and the course may
// already be gone. Nothing here writes a progress row, so none is left behind (the domain's progress-orphans).
// The ids go to graphs/.local/pub-del.json ({"course", "deck", "title"}), which the binding reads as {pd.*}. `make` first runs `remove` (a walk that died
// leaves nothing in the way), and `remove` says `none` when there is nothing to remove.
// Prints `deck-data <mode> <what was done>`. Nothing secret is printed.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import {
  call,
  Fail,
  LOCAL,
  must,
  options,
  run,
} from "../../../bindings/helpers/lib.mjs";

const FILE = resolve(LOCAL, "pub-del.json");
const MADE = resolve(LOCAL, "made", "pubDel.json");
const HOCA = "MUDERRIS";

const TITLE = "Deneme destesi pubDel";
const DESCRIPTION = "Dersin temel terimleri: fiil, isim, harf.";
const CARDS = [
  ["فعل", "fiil"],
  ["اسم", "isim"],
  ["حرف", "harf"],
];

async function remove() {
  if (!existsSync(FILE)) return "none";
  const made = JSON.parse(readFileSync(FILE, "utf8"));
  const path = `/courses/${made.course}/decks/${made.deck}`;
  // a published deck is refused with 409 COURSE_DECK_NOT_DRAFT: the way back is to a draft first
  await call(HOCA, "PATCH", path, { draft: true });
  await call(HOCA, "DELETE", path);
  rmSync(FILE);
  return "deck removed";
}

run("deck-data", async () => {
  const o = options(process.argv.slice(2), { flags: ["published"] });
  const [mode, ...more] = o.rest;
  if (!["make", "remove"].includes(mode) || more.length)
    throw new Fail("usage: deck-data.mjs make [--published] | remove", 2);
  const old = await remove();
  if (mode === "remove") {
    console.log(`deck-data remove ${old}`);
    return;
  }
  if (!existsSync(MADE))
    throw new Fail(
      "no course: run helpers/course.mjs make pubDel first (graphs/.local/made/pubDel.json)"
    );
  const course = JSON.parse(readFileSync(MADE, "utf8")).course;
  const made = await must(HOCA, "POST", `/courses/${course}/decks`, {
    title: TITLE,
    description: DESCRIPTION,
    cardType: "VOCABULARY",
    draft: o.published !== true,
  });
  // written at once, so a failure below still leaves the id `remove` needs
  mkdirSync(LOCAL, { recursive: true });
  writeFileSync(
    FILE,
    `${JSON.stringify({ course, deck: made.body.id, title: TITLE })}\n`,
    { mode: 0o600 }
  );
  await must(
    HOCA,
    "POST",
    `/flashcard/decks/${made.body.id}/cards`,
    CARDS.map(([contentFront, contentBack]) => ({
      type: "VOCABULARY",
      contentFront,
      contentBack,
    }))
  );
  console.log(
    `deck-data made 1 deck (${o.published === true ? "published" : "draft"}) in ${course}${old === "none" ? "" : ` (${old} first)`}`
  );
});
