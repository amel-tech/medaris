// The köşk decks and the hoca proposals of nizam.decks.koskDecks' own: made through tedrisat's API before a walk and taken away after it (the
// binding's setup and teardown). The seeded köşk (`seed.kosk`) and its decks are other flows' data and are never touched: everything here lives in the seed's
// second köşk (`seed.kosk2`, "Kubbealtı Köşkü"), which holds no deck and no proposal in the seed, and every title begins with a prefix of this file.
//
//   node ../nizam/decks/koskDecks/deck-data.mjs make both            a deck and two waiting proposals: the page of the main story
//   node ../nizam/decks/koskDecks/deck-data.mjs make decksOnly       a deck, no proposal: the block "Hoca önerileri" is not drawn
//   node ../nizam/decks/koskDecks/deck-data.mjs make proposalsOnly   one waiting proposal, no deck: the table says "Bu köşkün henüz destesi yok."
//   node ../nizam/decks/koskDecks/deck-data.mjs make nothing         no deck and no proposal
//   node ../nizam/decks/koskDecks/deck-data.mjs remove               everything below, and the notification a refusal wrote
//   node ../nizam/decks/koskDecks/deck-data.mjs meanwhile reject [s]   what another nazım does behind the page's back, for a binding's `before` (one of three; `s`: seconds to wait first):
//   node ../nizam/decks/koskDecks/deck-data.mjs meanwhile delete    reject: the OLDEST waiting proposal of this file is refused through the API as `koskNazim` (the one the page's first
//   node ../nizam/decks/koskDecks/deck-data.mjs meanwhile hide      "Kabul et" and "Reddet" belong to); delete: the same proposal's row is deleted (no route does it: SQL); hide: the
//                                                                    NEWEST shown deck of this file is hidden through the API (the one the page's first "Gizle" belongs to)
//
// What `make` writes, and as whom (every call is the route the page's own people use):
//   the proposals   POST /kosks/{kosk2}/deck-proposals as `muderris`, a hoca of the walk's own course `Deneme dersi kdecks` in that köşk (the binding's setup runs
//                   `helpers/course.mjs make kdecks --kosk {seed.kosk2}` first; the proposal route wants a müderris seat on a course of the köşk). Two are made, in
//                   this order, because the page lists them oldest first: `accept` ("Deneme önerisi koskDecks kabul", a vocabulary deck with a description,
//                   which the walk opens through "Kabul et") and `reject` ("Deneme önerisi koskDecks ret", a hadith deck, which the walk refuses with a reason)
//   the deck        POST /kosks/{kosk2}/decks as `koskNazim`, as the page's "Köşk destesi aç" does it, with two cards (POST /flashcard/decks/{id}/cards):
//                   "Deneme destesi koskDecks gizle" is the one the walk hides
// and prints `deck-data made <world> decks=<n> proposals=<n>`, the totals the köşk's own page will draw (GET /kosks/{kosk2}/decks/manage as `koskNazim`): the
// binding's `expect` names the numbers the walk needs, so a stack that holds another deck or proposal of that köşk stops the setup with a plain message and not
// with a page the walk cannot read.
//
// What `remove` takes away, and why SQL is used for part of it:
//   decks           every deck of the second köşk whose title begins "Deneme destesi koskDecks" or "Deneme önerisi koskDecks" (the made one, the one the walk opens
//                   from scratch, the one it opens from the proposal; a hidden one too), through DELETE /flashcard/decks/{id} as `koskNazim`, their author (the cards
//                   go with the deck). The ids are found by one SQL read, because the API lists a hidden deck nowhere
//   proposals       no route removes a proposal, so one SQL delete: every row of that köşk whose title begins "Deneme önerisi koskDecks"
//   notification    a refusal tells the proposer (DECK_PUBLISH_RESULT, no target); no route removes a notification either, so one SQL delete of the ones whose
//                   `deckTitle` begins "Deneme önerisi koskDecks"
// `make` first runs `remove`, so a walk that died leaves nothing in the way, and `remove` says `none` when there was nothing. The seeded rows are never matched: no
// seeded deck or proposal has these titles. What cannot be undone: the audit rows of the refusal and of the read of the deck's cards (the API has no route to
// remove them and nothing depends on them).
//
// The ids go to graphs/.local/kosk-decks.json ({"kosk","accept":{"id","title","description"},"reject":{"id","title"},"deck":{"id","title"},"proposer"}), which the
// binding reads as {kd.*}; a thing the world does not hold is written with empty strings, so that a placeholder never meets a missing key. Every run of this by
// hand takes the replay lock (CONVENTIONS, round R2). Nothing secret is printed.
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
  nameOf,
  run,
  seed,
} from "../../../bindings/helpers/lib.mjs";

const FILE = resolve(LOCAL, "kosk-decks.json");
const DECKS = "Deneme destesi koskDecks";
const PROPOSALS = "Deneme önerisi koskDecks";
const NAZIM = "koskNazim";
const HOCA = "muderris";
const COURSE_TAG = "kdecks";

const ACCEPT = {
  title: `${PROPOSALS} kabul`,
  description: "Tek bir köşk destesi iki derse yeter.",
  cardType: "VOCABULARY",
};
const REJECT = {
  title: `${PROPOSALS} ret`,
  description: "Hadis metinlerinden küçük bir seçki.",
  cardType: "HADEETH",
};
const DECK = {
  title: `${DECKS} gizle`,
  description: "Sarf ve nahiv terimleri.",
  cardType: "VOCABULARY",
};
const CARDS = [
  ["فعل", "fiil"],
  ["اسم", "isim"],
];

const WORLDS = ["both", "decksOnly", "proposalsOnly", "nothing"];
const usage = `usage: deck-data.mjs make <${WORLDS.join("|")}> | remove | meanwhile <reject|delete|hide> [seconds to wait first]`;

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

/** The decks of the second köşk that this file's titles name: `{ id, author }` each, hidden ones too. */
const found = async (kosk) => {
  const out = await query(
    `select id, author_id from decks where kosk_id = ${lit(kosk)} and (title like ${lit(`${DECKS}%`)} or title like ${lit(`${PROPOSALS}%`)})`
  );
  return out
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
};

const remove = async () => {
  const kosk = seed().kosk2;
  const mine = await found(kosk);
  for (const { id } of mine)
    await must(
      NAZIM,
      "DELETE",
      `/flashcard/decks/${id}`,
      undefined,
      [403, 404]
    );
  const left = await found(kosk);
  // a deck the API would not delete: said, never left in the way of the next walk
  if (left.length)
    throw new Fail(
      `${left.length} deck(s) of the köşk begin with this file's words and could not be deleted: ${left.map((d) => d.id).join(", ")}`
    );
  const gone = await query(
    `delete from deck_proposals where kosk_id = ${lit(kosk)} and title like ${lit(`${PROPOSALS}%`)} returning id`
  );
  await query(
    `delete from notifications where type = 'DECK_PUBLISH_RESULT' and target_id is null and params->>'deckTitle' like ${lit(`${PROPOSALS}%`)}`
  );
  if (existsSync(FILE)) rmSync(FILE);
  const proposals = gone.split("\n").filter(Boolean).length;
  return mine.length || proposals
    ? `${mine.length} deck(s) and ${proposals} proposal(s) removed`
    : "none";
};

const totals = async (kosk) => {
  const r = await must(NAZIM, "GET", `/kosks/${kosk}/decks/manage`);
  return { decks: r.body.decksTotal, proposals: r.body.proposalsTotal };
};

const propose = async (kosk, course, p) =>
  (
    await must(HOCA, "POST", `/kosks/${kosk}/deck-proposals`, {
      title: p.title,
      description: p.description,
      cardType: p.cardType,
      courseId: course,
    })
  ).body.id;

/** What another person does while the page is open: answers the proposal the page's first row belongs to, or hides the deck its first row belongs to. */
const meanwhile = async (what) => {
  const kosk = seed().kosk2;
  if (what === "hide") {
    const out = await query(
      `select id from decks where kosk_id = ${lit(kosk)} and archived_at is null and (title like ${lit(`${DECKS}%`)} or title like ${lit(`${PROPOSALS}%`)}) order by updated_at desc, id asc limit 1`
    );
    const deck = out
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l))[0];
    if (!deck) return "none";
    await must(NAZIM, "POST", `/decks/${deck.id}/hide`);
    return deck.id;
  }
  const out = await query(
    `select id from deck_proposals where kosk_id = ${lit(kosk)} and status = 'PENDING' and title like ${lit(`${PROPOSALS}%`)} order by created_at asc, id asc limit 1`
  );
  const proposal = out
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l))[0];
  if (!proposal) return "none";
  if (what === "reject")
    await must(
      NAZIM,
      "POST",
      `/kosks/${kosk}/deck-proposals/${proposal.id}/reject`,
      { reason: "Başka bir nazım karara bağladı." }
    );
  else
    await query(
      `delete from deck_proposals where id = ${lit(proposal.id)} returning id`
    );
  return proposal.id;
};

run("deck-data", async () => {
  const [mode, what, ...more] = process.argv.slice(2);
  if (mode === "meanwhile") {
    const wait = Number(more[0] ?? 0);
    if (
      !["reject", "delete", "hide"].includes(what) ||
      more.length > 1 ||
      !(wait >= 0 && wait <= 30)
    )
      throw new Fail(usage, 2);
    // a page the server renders (the form) is read when the walk presses the link: the answer waits a moment so that it lands after the render, not before
    if (wait) await new Promise((r) => setTimeout(r, wait * 1000));
    console.log(`deck-data meanwhile ${what} ${await meanwhile(what)}`);
    return;
  }
  if (
    !["make", "remove"].includes(mode) ||
    more.length ||
    (mode === "make" && !WORLDS.includes(what)) ||
    (mode === "remove" && what !== undefined)
  )
    throw new Fail(usage, 2);
  const old = await remove();
  if (mode === "remove") {
    console.log(`deck-data remove ${old}`);
    return;
  }
  const kosk = seed().kosk2;
  const withProposals = what === "both" || what === "proposalsOnly";
  const withDeck = what === "both" || what === "decksOnly";
  const data = {
    kosk,
    accept: { id: "", title: ACCEPT.title, description: ACCEPT.description },
    reject: { id: "", title: REJECT.title },
    deck: { id: "", title: DECK.title },
    proposer: "",
  };
  mkdirSync(LOCAL, { recursive: true });
  const write = () =>
    writeFileSync(FILE, `${JSON.stringify(data)}\n`, { mode: 0o600 });
  // written at once and again as each thing is made, so a failure below still leaves the ids `remove` could use (it finds the rows by their titles anyway)
  write();
  await must(NAZIM, "GET", "/me");
  if (withProposals) {
    const course = JSON.parse(
      readFileSync(resolve(LOCAL, "made", `${COURSE_TAG}.json`), "utf8")
    ).course;
    data.proposer = await nameOf(HOCA);
    data.accept.id = await propose(kosk, course, ACCEPT);
    write();
    if (what === "both") {
      data.reject.id = await propose(kosk, course, REJECT);
      write();
    }
  }
  if (withDeck) {
    const made = await must(NAZIM, "POST", `/kosks/${kosk}/decks`, DECK);
    data.deck.id = made.body.id;
    write();
    await must(
      NAZIM,
      "POST",
      `/flashcard/decks/${made.body.id}/cards`,
      CARDS.map(([contentFront, contentBack]) => ({
        type: "VOCABULARY",
        contentFront,
        contentBack,
      }))
    );
  }
  const n = await totals(kosk);
  console.log(
    `deck-data made ${what}${old === "none" ? "" : ` (${old} first)`} decks=${n.decks} proposals=${n.proposals}`
  );
});
