// The deck of nazar.decks.openAndFill's own course, made after `helpers/course.mjs make deck-fill` has opened `Deneme dersi deck-fill`, read back
// by the binding's `effects`, and taken away before `helpers/course.mjs remove deck-fill` removes the course (the binding's setup and teardown).
//
//   node ../nazar/decks/openAndFill/decks-data.mjs make --title <T> [--draft]     a deck of the course, written by MUDERRIS, with no card
//   node ../nazar/decks/openAndFill/decks-data.mjs remove                         every deck of the course, then the file below
//   node ../nazar/decks/openAndFill/decks-data.mjs check [--title <T>] [--delta <n>] [--front <t>] [--back <t>] [--gone <t>] [--state draft|published]
//
// Why own decks. A walk of this flow writes a deck and its cards for the account that walks it. The seeded course is other flows' data, so the walk
// makes its course (helpers/course.mjs) and this file makes and removes what the course holds. A deleted course does not take its decks with it
// (decks.course_id is `on delete set null`, so they would stay behind as private decks of their author): `remove` therefore runs first, and `make`
// in setup begins with it, so a walk that died half way leaves nothing in the way.
//
// make    POST /courses/{id}/decks as MUDERRIS (the course's one hoca): the author of the deck, which the `others` scenario needs, since a colleague
//         who holds deck.manage_course is refused every edit and delete of its cards (OPENFILL-1). Prints `deck-data made <deckId> in <courseId>`.
// remove  GET /courses/{id}/decks/manage as MUDERRIS, then DELETE /flashcard/decks/{deckId} for each (the generic route, which the author and the
//         course staff may use on a published deck too, the domain's deck-manage-private-reaches-course-decks; a 403 or 404 is let by). The deck's
//         cards go with it (flashcards.deck_id cascades); no card of this flow has progress. A course already gone is `none`. Prints
//         `deck-data remove <n> deck(s)`.
// check   Reads the deck (by --title, else the title `make` recorded) and its cards as MUDERRIS, and compares: the number of cards with what the
//         last check saw plus --delta (the file starts at 0), a card with this front (and, with --back, this back), no card with the --gone front,
//         the deck's state. Writes what it saw to the file, so the next check counts from it. Prints `deck-data check ok <n> card(s)`.
// The ids go to graphs/.local/deck-fill.json ({"course", "deck", "title", "count"}); the course's own id is read from graphs/.local/made/deck-fill.json.
// Run it under the replay lock when walks are running and you run it by hand. Nothing secret is printed.
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

const FILE = resolve(LOCAL, "deck-fill.json");
const MADE = resolve(LOCAL, "made", "deck-fill.json");
const HOCA = "MUDERRIS";
const usage =
  "usage: decks-data.mjs make --title <T> [--draft] | remove | check [--title <T>] [--delta <n>] [--front <t>] [--back <t>] [--gone <t>] [--state draft|published]";

const courseOf = () => {
  if (!existsSync(MADE))
    throw new Fail(
      "no course: run helpers/course.mjs make deck-fill first (graphs/.local/made/deck-fill.json)"
    );
  return JSON.parse(readFileSync(MADE, "utf8")).course;
};
const remembered = () =>
  existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : null;
const keep = (what) => {
  mkdirSync(LOCAL, { recursive: true });
  writeFileSync(FILE, `${JSON.stringify(what)}\n`, { mode: 0o600 });
};

async function removeAll() {
  if (!existsSync(MADE)) {
    rmSync(FILE, { force: true });
    return "none";
  }
  const course = courseOf();
  const list = await call(HOCA, "GET", `/courses/${course}/decks/manage`);
  const decks =
    list.status === 200 && Array.isArray(list.body) ? list.body : [];
  for (const d of decks)
    await must(
      HOCA,
      "DELETE",
      `/flashcard/decks/${d.id}`,
      undefined,
      [403, 404]
    );
  rmSync(FILE, { force: true });
  return decks.length ? `${decks.length} deck(s)` : "none";
}

async function deckOf(course, title) {
  const list = await must(HOCA, "GET", `/courses/${course}/decks/manage`);
  const deck = (list.body ?? []).find((d) => d.title === title);
  if (!deck)
    throw new Fail(
      `the course holds no deck titled "${title}" (it holds: ${(list.body ?? []).map((d) => d.title).join(", ") || "none"})`
    );
  return deck;
}

run("deck-data", async () => {
  const o = options(process.argv.slice(2), {
    values: ["title", "delta", "front", "back", "gone", "state"],
    flags: ["draft"],
  });
  const [verb, ...more] = o.rest;
  if (more.length) throw new Fail(usage, 2);

  if (verb === "remove") {
    console.log(`deck-data remove ${await removeAll()}`);
    return;
  }

  if (verb === "make") {
    if (!o.title) throw new Fail(usage, 2);
    await removeAll();
    const course = courseOf();
    const draft = o.draft === true;
    const made = await must(HOCA, "POST", `/courses/${course}/decks`, {
      title: o.title,
      cardType: "VOCABULARY",
      draft,
    });
    keep({ course, deck: made.body.id, title: o.title, count: 0 });
    console.log(`deck-data made ${made.body.id} in ${course}`);
    return;
  }

  if (verb === "check") {
    const course = courseOf();
    const before = remembered();
    const title = o.title ?? before?.title;
    if (!title) throw new Fail("check needs --title (no deck made yet)", 2);
    const deck = await deckOf(course, title);
    const cards = (
      await must(HOCA, "GET", `/flashcard/cards?deckId=${deck.id}`)
    ).body;
    const base = before?.deck === deck.id ? before.count : 0;
    const want = base + Number(o.delta ?? 0);
    if (cards.length !== want)
      throw new Fail(
        `the deck holds ${cards.length} card(s), expected ${want} (${base} before, ${o.delta ?? 0} more)`
      );
    if (o.state !== undefined && deck.draft !== (o.state === "draft"))
      throw new Fail(
        `the deck is ${deck.draft ? "a draft" : "published"}, expected ${o.state}`
      );
    if (
      o.front !== undefined &&
      !cards.some(
        (c) =>
          c.contentFront === o.front &&
          (o.back === undefined || c.contentBack === o.back)
      )
    )
      throw new Fail(
        `no card with the front "${o.front}"${o.back === undefined ? "" : ` and the back "${o.back}"`}`
      );
    if (
      o.front === undefined &&
      o.back !== undefined &&
      !cards.some((c) => c.contentBack === o.back)
    )
      throw new Fail(`no card with the back "${o.back}"`);
    if (o.gone !== undefined && cards.some((c) => c.contentFront === o.gone))
      throw new Fail(`a card with the front "${o.gone}" is still there`);
    keep({ course, deck: deck.id, title, count: cards.length });
    console.log(`deck-data check ok ${cards.length} card(s)`);
    return;
  }

  throw new Fail(usage, 2);
});
