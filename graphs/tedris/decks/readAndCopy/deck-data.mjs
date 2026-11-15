// The decks of tedris.decks.readAndCopy's walks: a deck somebody else wrote, the reader's own decks to copy into, and the way back. Made by the
// binding's `setup`, taken away by its `teardown`. Nothing seeded is touched.
//
//   node ../tedris/decks/readAndCopy/deck-data.mjs make public|shared [--cards <n>] [--own both|other|none] [--collected] [--mastered <n>] [--reader <ACCOUNT>]
//   node ../tedris/decks/readAndCopy/deck-data.mjs fault <given> <wanted>
//   node ../tedris/decks/readAndCopy/deck-data.mjs remove
//
// make public   A deck of the müderris `MUDERRIS`, a Hadis deck "Hadis okuma denemesi readAndCopy" with `--cards` cards (default 8; each one has the
//               source "Buhârî, Müslim" in its meta, an Arabic front and a Turkish back), published the way the app publishes: the author asks
//               (POST /flashcard/decks/{id}/publish-request) and the başnazım answers (POST /nizam/deck-publish-requests/{id}/approve). No route
//               makes a public deck any other way, and the approval is the only writer of isPublic (the domain's deck-born-private).
// make shared   A deck of the course that `helpers/course.mjs make readAndCopy --talebe <reader>` opened first (graphs/.local/made/readAndCopy.json),
//               "Ders hadisleri denemesi readAndCopy", a Hadis deck of the course team (POST /courses/{course}/decks, as `MUDERRIS`, published at
//               once, no week). The reader is enrolled in that course, so the deck is shared with them and not public.
//   --cards       how many cards the deck gets (0 gives an empty deck).
//   --own         the reader's own decks, which "Kendi desteme kopyala" offers: `both` a Hadis deck "Kendi hadis destem readAndCopy" and a Kelime deck
//                 "Kendi kelime destem readAndCopy" (the dialog offers the first only); `other` the Kelime deck alone (no deck of the same kind, so
//                 the dialog sends the reader to "Deste oluştur"); `none` nothing. Default both.
//   --collected   the reader has put the deck in their collection.
//   --mastered    the reader has rated that many of the first cards EASY (PUT /flashcard/cards/progress), so the page says "Tamamlanan: n / m kart".
//   --reader      the account that reads; default APPLICANT_C.
// fault <given> <wanted>   a no-op unless the two words are the same, so a binding can run it with its scenario's `{fault}` and be done by one word:
//               `collect`  the author takes the publication back (DELETE /flashcard/decks/{id}/publish-request), so the deck stops being readable
//                          and the reader's "Koleksiyona ekle" is refused 404 (the page was drawn before); the stale page is the only way to
//                          make tedrisat refuse that write on the stack;
//               `copy`     the reader deletes their own Hadis deck, so the dialog still lists it and "Kopyala" is refused 404.
//               Both may be run twice (a withdrawn publication answers 409, a deleted deck 404: tolerated).
// remove        the progress rows of the cards (no route deletes a progress row, and a deleted deck leaves its cards' rows behind: the domain's
//               progress-orphans), then the reader's own decks (the copies go with them), then the deck as its author, then the notification the
//               approval wrote to the author (no route deletes a notification). Prints `none` when there is nothing to remove.
//
// The ids go to graphs/.local/read-and-copy.json, which the binding reads as {rc.*}: kind, reader, author, deck, title, description, count, mastered,
// cards (ids), course, ownHadith, ownHadithTitle, ownVocab, ownVocabTitle. The file is written after each thing is made, so a failure half way still
// leaves the ids `remove` needs. `make` begins by running `remove`, so a walk that died leaves nothing in the way.
// SQL (helpers/db.mjs, the stack's own Postgres container) is used for the two deletes the API has no route for. Nothing secret is printed.
// Run it under the replay lock when walks are running and you run it by hand.
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

const FILE = resolve(LOCAL, "read-and-copy.json");
const COURSE = resolve(LOCAL, "made", "readAndCopy.json");
const AUTHOR = "MUDERRIS";
const ADMIN = "SYSTEM_ADMIN";
const SOURCE = "Buhârî, Müslim";
const TITLES = {
  public: "Hadis okuma denemesi readAndCopy",
  shared: "Ders hadisleri denemesi readAndCopy",
  hadith: "Kendi hadis destem readAndCopy",
  vocab: "Kendi kelime destem readAndCopy",
};
const DESCRIPTION = "Niyet ve amel üzerine seçme hadisler.";
const usage =
  "usage: deck-data.mjs make public|shared [--cards <n>] [--own both|other|none] [--collected] [--mastered <n>] [--reader <ACCOUNT>] | fault <given> <wanted> | remove";

const read = () => JSON.parse(readFileSync(FILE, "utf8"));
const keep = (made) => {
  mkdirSync(LOCAL, { recursive: true });
  writeFileSync(FILE, `${JSON.stringify(made)}\n`, { mode: 0o600 });
};

async function remove() {
  if (!existsSync(FILE)) return "none";
  const made = read();
  const cards = (made.cards ?? []).map((id) => `'${id}'`);
  if (cards.length)
    await query(
      `delete from flashcard_progress where flashcard_id in (${cards.join(", ")})`
    );
  // the reader's own decks go first, with the copies in them; one already gone (the walk of the refused copy deletes one) is fine
  for (const id of [made.ownHadith, made.ownVocab].filter(Boolean))
    await must(
      made.reader,
      "DELETE",
      `/flashcard/decks/${id}`,
      undefined,
      [403, 404]
    );
  if (made.deck) {
    await must(
      made.author,
      "DELETE",
      `/flashcard/decks/${made.deck}`,
      undefined,
      [403, 404]
    );
    // the approval wrote DECK_PUBLISH_RESULT to the author, which points at a deck that is gone now
    await query(`delete from notifications where target_id = '${made.deck}'`);
  }
  rmSync(FILE);
  return `${made.deck ?? "no deck"} removed`;
}

// a hadith in the shape the seeded deck's cards have: an Arabic front, a Turkish back, the source in the meta
const card = (n) => ({
  type: "HADEETH",
  contentFront: `إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ ${n}`,
  contentBack: `Ameller niyetlere göredir (${n}).`,
  contentMeta: { source: SOURCE },
});

async function make(kind, o) {
  const reader = o.reader ?? "APPLICANT_C";
  const count = Number(o.cards ?? 8);
  const own = o.own ?? "both";
  const mastered = Number(o.mastered ?? 0);
  if (!Number.isInteger(count) || count < 0 || count > 12)
    throw new Fail("--cards is a whole number from 0 to 12", 2);
  if (!["both", "other", "none"].includes(own))
    throw new Fail("--own is both, other or none", 2);
  if (!Number.isInteger(mastered) || mastered < 0 || mastered > count)
    throw new Fail("--mastered is a whole number, at most --cards", 2);
  const made = {
    kind,
    reader,
    author: AUTHOR,
    title: TITLES[kind],
    description: DESCRIPTION,
    count: String(count),
    mastered: String(mastered),
    cards: [],
    // always there, so that a binding can name them (as a sample) in a walk that made neither
    ownHadithTitle: TITLES.hadith,
    ownVocabTitle: TITLES.vocab,
  };

  // the deck somebody else wrote
  if (kind === "public") {
    const deck = await must(AUTHOR, "POST", "/flashcard/decks", {
      title: made.title,
      description: made.description,
      cardType: "HADEETH",
    });
    made.deck = deck.body.id;
  } else {
    if (!existsSync(COURSE))
      throw new Fail(
        "no course: run helpers/course.mjs make readAndCopy first (graphs/.local/made/readAndCopy.json)"
      );
    made.course = JSON.parse(readFileSync(COURSE, "utf8")).course;
    const deck = await must(AUTHOR, "POST", `/courses/${made.course}/decks`, {
      title: made.title,
      description: made.description,
      cardType: "HADEETH",
    });
    made.deck = deck.body.id;
  }
  keep(made);
  if (count > 0) {
    const rows = await must(
      AUTHOR,
      "POST",
      `/flashcard/decks/${made.deck}/cards`,
      Array.from({ length: count }, (_, i) => card(i + 1))
    );
    made.cards = rows.body.map((c) => c.id);
    keep(made);
  }
  if (kind === "public") {
    await must(AUTHOR, "POST", `/flashcard/decks/${made.deck}/publish-request`);
    await must(
      ADMIN,
      "POST",
      `/nizam/deck-publish-requests/${made.deck}/approve`
    );
  }

  // the reader's own decks, to copy into
  if (own !== "none") {
    const vocab = await must(reader, "POST", "/flashcard/decks", {
      title: TITLES.vocab,
      cardType: "VOCABULARY",
    });
    made.ownVocab = vocab.body.id;
    keep(made);
  }
  if (own === "both") {
    const hadith = await must(reader, "POST", "/flashcard/decks", {
      title: TITLES.hadith,
      cardType: "HADEETH",
    });
    made.ownHadith = hadith.body.id;
    keep(made);
  }

  if (o.collected)
    await must(reader, "POST", `/flashcard/decks/${made.deck}/collections`);
  if (mastered > 0)
    await must(
      reader,
      "PUT",
      "/flashcard/cards/progress",
      made.cards.slice(0, mastered).map((flashcardId) => ({
        flashcardId,
        rating: "EASY",
      }))
    );
  return `made ${kind} deck ${made.deck} with ${count} card(s), own ${own}${o.collected ? ", collected" : ""}${mastered ? `, ${mastered} mastered` : ""}`;
}

async function fault(given, wanted) {
  if (given !== wanted) return `fault ${wanted} not wanted (${given})`;
  if (!existsSync(FILE)) throw new Fail("no deck: run make first");
  const made = read();
  if (wanted === "collect")
    await must(
      made.author,
      "DELETE",
      `/flashcard/decks/${made.deck}/publish-request`,
      undefined,
      [404, 409]
    );
  else if (wanted === "copy") {
    if (!made.ownHadith) throw new Fail("no own Hadis deck to take away");
    await must(
      made.reader,
      "DELETE",
      `/flashcard/decks/${made.ownHadith}`,
      undefined,
      [403, 404]
    );
  } else throw new Fail(`no fault ${wanted}: ${usage}`, 2);
  return `fault ${wanted} done`;
}

run("deck-data", async () => {
  const o = options(process.argv.slice(2), {
    values: ["cards", "own", "mastered", "reader"],
    flags: ["collected"],
  });
  const [verb, a, b, ...more] = o.rest;
  if (verb === "make" && ["public", "shared"].includes(a) && !b) {
    const old = await remove();
    const said = await make(a, o);
    console.log(`deck-data ${said}${old === "none" ? "" : ` (${old} first)`}`);
  } else if (verb === "fault" && a && b && !more.length) {
    console.log(`deck-data ${await fault(a, b)}`);
  } else if (verb === "remove" && !a) {
    console.log(`deck-data remove ${await remove()}`);
  } else throw new Fail(usage, 2);
});
