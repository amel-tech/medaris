// The decks of nizam.decks.legacyCards' own: made through tedrisat's API before a walk and taken away after it (the binding's setup and teardown). The seeded
// decks ("Kelime Defterim", "Sarf Kavramları") are other flows' data and are never touched: every deck here has a title that begins "Deneme destesi legacy",
// and `remove` touches no deck of another title, nor one of that title written by someone this file does not name.
//
//   node ../nizam/decks/legacyCards/deck-data.mjs make mine [--cards <n>]   a köşk deck of the seed's second köşk, opened by the köşk nazımı (`koskNazim`) as the
//                                                                          köşk decks page does it (POST /kosks/{kosk2}/decks), with <n> cards (default 3, 0 for
//                                                                          none). It is the nazım's own private deck, so /decks lists it and every write is theirs
//   node ../nizam/decks/legacyCards/deck-data.mjs make foreign              a public deck of someone else: `dersNazir` writes it with one card, asks for its
//                                                                          publication, and the başnazım (`systemAdmin`) approves it. /decks lists it for everyone
//   node ../nizam/decks/legacyCards/deck-data.mjs make none                 nothing: the person who opens /decks as `applicantF` has no deck
//   node ../nizam/decks/legacyCards/deck-data.mjs remove                    every deck of those titles written by those people, and what its approval wrote
//
// `make` first runs `remove`, so a walk that died leaves nothing in the way, and it ends by reading what the person who will open /decks sees (GET
// /flashcard/decks as `koskNazim` for mine and foreign, as `applicantF` for none) and printing `rows=<n>`: the binding's `expect` names the number the
// walk needs (1, 1 and 0), so a stack that holds another public deck, or another deck of the nazım, stops the setup with a plain message instead of a
// table the walk cannot read by position.
//
// Why these people. `koskNazim` is the persona that comes from the köşk decks page ("Kartları düzenle"); the second köşk is the one `helpers/course.mjs` also
// uses and no seeded flow reads. `applicantF` is a spare talebe with a full profile and no role, deck or enrolment: the person with no role at all who opens
// /decks, and who makes the deck of the dialog. `dersNazir` holds a post in one course and no deck; the başnazım is the only account that may answer a
// publication request. Everything goes through the API as the people themselves: no SQL for the making.
//
// The ids go to graphs/.local/legacy-cards.json ({"mode","deck","title","kosk"}), which the binding reads as {lc.*}. The two SQL statements are one read
// (the ids of the decks of those titles: the API gives a person only their own list, and a deck of `dersNazir` is not on the nazım's) and one delete (the
// approval's notification DECK_PUBLISH_RESULT to the author, because no route removes a notification: the same as tedris.decks.explore's helper). A deck is
// deleted by its author through DELETE /flashcard/decks/{id}, which also takes its cards with it; a published one too. Every run of this by hand takes the
// replay lock (CONVENTIONS, round R2). Prints `deck-data <mode> <what was done> rows=<n>`. Nothing secret is printed.
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { query } from "../../../bindings/helpers/db.mjs";
import {
  Fail,
  LOCAL,
  must,
  options,
  run,
  seed,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const FILE = resolve(LOCAL, "legacy-cards.json");
const PREFIX = "Deneme destesi legacy";
const MINE = { author: "koskNazim", title: PREFIX };
const FOREIGN = { author: "dersNazir", title: `${PREFIX} herkese açık` };
const NONE_VIEWER = "applicantF";
const REVIEWER = "systemAdmin";
// every account this file writes decks as: the made decks and the deck the binding's walk makes in the dialog (as `applicantF`)
const AUTHORS = ["koskNazim", "applicantF", "dersNazir"];

const CARDS = [
  ["فعل", "fiil"],
  ["اسم", "isim"],
  ["حرف", "harf"],
];
const DESCRIPTION = "Bilgi kartı destesi denemesi.";

const quoted = (list) => list.map((x) => `'${x}'`).join(", ");

/** The decks that begin with the prefix and were written by one of the people above: `{ id, author }` each. A deck of anyone else is left alone. */
const found = async () => {
  const out = await query(
    `select id, author_id from decks where title like '${PREFIX}%'`
  );
  const rows = out
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  const mine = [];
  for (const row of rows) {
    const author = AUTHORS.find((a) => subOf(a) === row.author_id);
    if (author) mine.push({ id: row.id, author });
  }
  return mine;
};

const remove = async () => {
  const mine = await found();
  for (const { id, author } of mine)
    await must(author, "DELETE", `/flashcard/decks/${id}`, undefined, [404]);
  if (mine.length)
    await query(
      `delete from notifications where target_id in (${quoted(mine.map((m) => m.id))})`
    );
  if (existsSync(FILE)) rmSync(FILE);
  return mine.length;
};

const addCards = async (author, id, n) => {
  if (n > 0)
    await must(
      author,
      "POST",
      `/flashcard/decks/${id}/cards`,
      CARDS.slice(0, n).map(([contentFront, contentBack]) => ({
        type: "VOCABULARY",
        contentFront,
        contentBack,
      }))
    );
};

const rowsFor = async (viewer) => {
  const r = await must(viewer, "GET", "/flashcard/decks");
  return Array.isArray(r.body) ? r.body.length : -1;
};

run("deck-data", async () => {
  const o = options(process.argv.slice(2), { values: ["cards"] });
  const [mode, what, ...more] = o.rest;
  if (
    !["make", "remove"].includes(mode) ||
    more.length ||
    (mode === "make" && !["mine", "foreign", "none"].includes(what))
  )
    throw new Fail(
      "usage: deck-data.mjs make mine [--cards <n>] | make foreign | make none | remove",
      2
    );
  const old = await remove();
  if (mode === "remove") {
    console.log(`deck-data remove ${old ? `${old} deck(s) removed` : "none"}`);
    return;
  }
  const n = Number(o.cards ?? 3);
  if (!Number.isInteger(n) || n < 0 || n > CARDS.length)
    throw new Fail(`--cards is a number from 0 to ${CARDS.length}`, 2);
  mkdirSync(LOCAL, { recursive: true });
  const write = (data) =>
    writeFileSync(FILE, `${JSON.stringify(data)}\n`, { mode: 0o600 });

  let viewer = "koskNazim";
  if (what === "mine") {
    const kosk = seed().kosk2;
    await must(MINE.author, "GET", "/me");
    const made = await must(MINE.author, "POST", `/kosks/${kosk}/decks`, {
      title: MINE.title,
      description: DESCRIPTION,
      cardType: "VOCABULARY",
    });
    // written at once, so a failure below still leaves what `remove` needs (it finds the deck by title and author anyway)
    write({ mode: "mine", deck: made.body.id, title: MINE.title, kosk });
    await addCards(MINE.author, made.body.id, n);
  } else if (what === "foreign") {
    await must(FOREIGN.author, "GET", "/me");
    const made = await must(FOREIGN.author, "POST", "/flashcard/decks", {
      title: FOREIGN.title,
      description: DESCRIPTION,
      cardType: "VOCABULARY",
    });
    write({ mode: "foreign", deck: made.body.id, title: FOREIGN.title });
    await addCards(FOREIGN.author, made.body.id, 1);
    await must(
      FOREIGN.author,
      "POST",
      `/flashcard/decks/${made.body.id}/publish-request`
    );
    await must(
      REVIEWER,
      "POST",
      `/nizam/deck-publish-requests/${made.body.id}/approve`
    );
  } else {
    viewer = NONE_VIEWER;
    await must(NONE_VIEWER, "GET", "/me");
    write({ mode: "none", deck: "", title: "" });
  }
  const rows = await rowsFor(viewer);
  console.log(
    `deck-data made ${what}${what === "mine" ? ` with ${n} card(s)` : ""}${old ? ` (${old} old removed first)` : ""} rows=${rows}`
  );
});
