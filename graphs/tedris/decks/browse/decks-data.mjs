// The decks of tedris.decks.browse's walks: made after `helpers/course.mjs make browse` has opened `Deneme dersi browse` (only when a course deck is
// wanted), and taken away before `helpers/course.mjs remove browse` removes the course (the binding's setup and teardown).
//
//   node ../tedris/decks/browse/decks-data.mjs make --own <none|fresh|active> --collected <none|still|grown>
//   node ../tedris/decks/browse/decks-data.mjs remove
//
// Why decks of its own: Desteler lists the decks of one person, and every deck of the seed belongs to a seeded account that other flows read and
// write (the seeded talebe studies "Kelime Defterim"). The walk reads as the spare talebe `applicantH` (no deck, no enrolment), who is given:
//   --own fresh      two private decks of three cards each, none studied                    (the context variable `own: fresh`)
//   --own active     four decks of three cards: private, waiting for review (asked today), published and refused; in each, one card mastered and one
//                    learning with no review time (so "1 kart tekrar bekliyor"), one new; `own: active`
//   --collected still  two collected decks, a course deck (`Ortak ders destesi browse`, made by MUDERRIS in the course `Deneme dersi browse`) and a
//                    public deck (`Ortak genel deste browse`, written by `applicantG`, asked for and published by the başnazım)
//   --collected grown  the same, and `applicantG` writes a fourth card in the public deck after `applicantH` collected it ("1 yeni kart")
// The titles are chosen for the search words of the binding: "browse" is in every deck, "Deneme" only in the decks of applicantH, "Ortak" only in
// the collected ones; no description holds the other group's word.
// Everything goes through the routes the people use (POST /flashcard/decks, POST /flashcard/decks/{id}/cards, PUT /flashcard/cards/progress,
// POST /flashcard/decks/{id}/publish-request, POST /nizam/deck-publish-requests/{id}/approve|reject, POST /courses/{id}/decks,
// POST /flashcard/decks/{id}/collections). The one SQL is a delete: `remove` deletes the progress rows of the cards of the decks it made (no route
// deletes a progress row, and a deleted deck leaves its cards' progress rows behind: the domain's progress-orphans), then each deck as its author
// (DELETE /flashcard/decks/{id}, which also works on a published deck). The approvals and the refusal write a notification for each author: the
// binding clears them with helpers/notify.mjs.
// The ids go to graphs/.local/decks-browse.json, which the binding reads as {br.*}: {"viewer", "first", "decks": [{id, title, author, cards}]}; `first`
// is the deck that comes first in the page (read back from the summary), the one a walk opens and studies.
// `make` first runs `remove` (a walk that died leaves nothing in the way), and then fails if the viewer still has a deck this helper did not make.
// Prints `decks-data <mode> <what was done>`. Nothing secret is printed.
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

const FILE = resolve(LOCAL, "decks-browse.json");
const MADE = resolve(LOCAL, "made", "browse.json");
const VIEWER = "applicantH";
const AUTHOR = "applicantG";
const HOCA = "MUDERRIS";
const ADMIN = "systemAdmin";

const CARDS = [
  ["كتاب", "kitap"],
  ["علم", "ilim"],
  ["قلم", "kalem"],
];
const FOURTH = ["باب", "kapı"];

const OWN_FRESH = [
  { key: "private", title: "Deneme destesi browse özel", status: "PRIVATE" },
  { key: "second", title: "Deneme destesi browse ikinci", status: "PRIVATE" },
];
// created in this order, so the page lists them the other way round: refused, published, waiting, private
const OWN_ACTIVE = [
  { key: "private", title: "Deneme destesi browse özel", status: "PRIVATE" },
  {
    key: "pending",
    title: "Deneme destesi browse bekleyen",
    status: "PENDING",
  },
  {
    key: "published",
    title: "Deneme destesi browse yayında",
    status: "PUBLISHED",
  },
  {
    key: "rejected",
    title: "Deneme destesi browse reddedilen",
    status: "REJECTED",
  },
];

const cardBody = (pairs) =>
  pairs.map(([contentFront, contentBack]) => ({
    type: "VOCABULARY",
    contentFront,
    contentBack,
  }));

const read = () =>
  existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : null;
const save = (state) => {
  mkdirSync(LOCAL, { recursive: true });
  writeFileSync(FILE, `${JSON.stringify(state)}\n`, { mode: 0o600 });
};

async function remove() {
  const state = read();
  if (!state) return "none";
  const cards = state.decks
    .filter((d) => d.author === VIEWER)
    .flatMap((d) => d.cards)
    .map((id) => `'${id}'`);
  if (cards.length)
    await query(
      `delete from flashcard_progress where flashcard_id in (${cards.join(", ")})`
    );
  for (const d of state.decks)
    await must(
      d.author,
      "DELETE",
      `/flashcard/decks/${d.id}`,
      undefined,
      [403, 404]
    );
  rmSync(FILE);
  return `${state.decks.length} deck(s) removed`;
}

// a deck of the author, with its three cards; the id and the card ids are written to the file at once
async function makeDeck(state, author, spec, make) {
  const made = await must(author, "POST", make.deckPath, {
    title: spec.title,
    description: spec.description,
    cardType: "VOCABULARY",
  });
  const entry = { id: made.body.id, title: spec.title, author, cards: [] };
  state.decks.push(entry);
  save(state);
  const cards = await must(
    author,
    "POST",
    `/flashcard/decks/${entry.id}/cards`,
    cardBody(CARDS)
  );
  entry.cards = cards.body.map((c) => c.id);
  save(state);
  return entry;
}

// asked for and answered as the başnazım does
async function publish(deck, how) {
  await must(
    deck.author,
    "POST",
    `/flashcard/decks/${deck.id}/publish-request`
  );
  if (how === "PUBLISHED")
    await must(
      ADMIN,
      "POST",
      `/nizam/deck-publish-requests/${deck.id}/approve`
    );
  if (how === "REJECTED")
    await must(
      ADMIN,
      "POST",
      `/nizam/deck-publish-requests/${deck.id}/reject`,
      {
        reason: "Deneme için reddedildi.",
      }
    );
}

async function makeOwn(state, specs, studied) {
  for (const spec of specs) {
    const deck = await makeDeck(
      state,
      VIEWER,
      {
        title: spec.title,
        description: "Deneme kelimelerinin listesi.",
      },
      { deckPath: "/flashcard/decks" }
    );
    if (studied)
      await must(VIEWER, "PUT", "/flashcard/cards/progress", [
        { flashcardId: deck.cards[0], status: "MASTERED" },
        { flashcardId: deck.cards[1], status: "LEARNING" },
      ]);
    if (spec.status !== "PRIVATE") await publish(deck, spec.status);
  }
}

async function makeCollected(state, grown) {
  if (!existsSync(MADE))
    throw new Fail(
      "no course: run helpers/course.mjs make browse first (graphs/.local/made/browse.json)"
    );
  const course = JSON.parse(readFileSync(MADE, "utf8")).course;
  const forCourse = await makeDeck(
    state,
    HOCA,
    {
      title: "Ortak ders destesi browse",
      description: "Ortak ders kelimeleri: fiil, isim.",
    },
    { deckPath: `/courses/${course}/decks` }
  );
  await must(VIEWER, "POST", `/flashcard/decks/${forCourse.id}/collections`);
  const forEveryone = await makeDeck(
    state,
    AUTHOR,
    {
      title: "Ortak genel deste browse",
      description: "Ortak genel kelimeler.",
    },
    { deckPath: "/flashcard/decks" }
  );
  await publish(forEveryone, "PUBLISHED");
  await must(VIEWER, "POST", `/flashcard/decks/${forEveryone.id}/collections`);
  if (grown) {
    // a card written after the collecting: the count is of cards created later than the collection row
    await new Promise((r) => setTimeout(r, 1100));
    const more = await must(
      AUTHOR,
      "POST",
      `/flashcard/decks/${forEveryone.id}/cards`,
      cardBody([FOURTH])
    );
    forEveryone.cards.push(...more.body.map((c) => c.id));
    save(state);
  }
}

run("decks-data", async () => {
  const o = options(process.argv.slice(2), { values: ["own", "collected"] });
  const [mode, ...more] = o.rest;
  if (!["make", "remove"].includes(mode) || more.length)
    throw new Fail(
      "usage: decks-data.mjs make --own <none|fresh|active> --collected <none|still|grown> | remove",
      2
    );
  const old = await remove();
  if (mode === "remove") {
    console.log(`decks-data remove ${old}`);
    return;
  }
  if (!["none", "fresh", "active"].includes(o.own))
    throw new Fail("--own is none, fresh or active", 2);
  if (!["none", "still", "grown"].includes(o.collected))
    throw new Fail("--collected is none, still or grown", 2);
  const there = (await must(VIEWER, "GET", "/flashcard/decks/summary")).body;
  if (!Array.isArray(there) || there.length)
    throw new Fail(
      `${VIEWER} already has ${Array.isArray(there) ? there.length : "an unreadable list of"} deck(s) that this helper did not make: nothing is made`
    );
  const state = { viewer: VIEWER, first: "", decks: [] };
  save(state);
  if (o.own === "fresh") await makeOwn(state, OWN_FRESH, false);
  if (o.own === "active") await makeOwn(state, OWN_ACTIVE, true);
  if (o.collected !== "none")
    await makeCollected(state, o.collected === "grown");
  const page = (await must(VIEWER, "GET", "/flashcard/decks/summary")).body;
  state.first = page[0]?.id ?? "";
  save(state);
  console.log(
    `decks-data made ${state.decks.length} deck(s), own ${o.own}, collected ${o.collected}${old === "none" ? "" : ` (${old} first)`}`
  );
});
