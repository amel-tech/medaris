// The data nizam.moderation.reviewDeckPublication's walks need and the seed has not got: decks with a few cards that spare talebe asked to have
// published, in the state a scenario starts from, and the way back (the bindings' setup and teardown). It also does what another person would do
// behind the page's back (`elsewhere`). Run with graphs/bindings/ as the working directory, as every helper is.
//
//   node ../nizam/moderation/reviewDeckPublication/review-data.mjs up <tag> [--touch ACCOUNT] <key>:<state>:<owner>[:empty]...
//        key    a short name of the deck: its title is "İnceleme destesi <KEY>" and the walk reads its id as {made.<key>.id}
//        state  pending    the owner asked, nobody answered     (the request waits on the page)
//               published  the owner asked, the başnazım approved
//               rejected   the owner asked, the başnazım refused with a reason
//        owner  applicantD or applicantG (the two spare talebe this flow uses: the deck is theirs, the notice of every answer goes to them)
//        :empty  the deck holds no card (the request is still made: the author's page allows it)
//        --touch ACCOUNT  makes sure an account has its users row (a first GET /me), for a person who owns no deck here but is made a Medaris nazımı
//   node ../nizam/moderation/reviewDeckPublication/review-data.mjs elsewhere <tag> answered|withdrawn
//        answered   the başnazım approves every deck of the tag that still waits, as another reviewer would, so that the page's next press is a 409
//        withdrawn  the owner takes every deck of the tag that is published back to private, so that the page's "Yayından kaldır" is a 409
//   node ../nizam/moderation/reviewDeckPublication/review-data.mjs down <tag>
//
// Every deck is made through the API as its owner, the way the create page and the deck page do: POST /flashcard/decks, five cards through
// POST /flashcard/decks/{id}/cards, POST /flashcard/decks/{id}/publish-request; and `published` and `rejected` are reached the way a person reaches
// them, the başnazım (SYSTEM_ADMIN, who may answer any request) answering through the nizam routes. The decks are made in the order the specs are given,
// so the oldest request is the first spec and the answers are in the order of the specs too (the newest answer is the last answered spec). No SQL
// for the making. The ids go to graphs/.local/made/<tag>.json ({"tag":..,"<key>":{"id","title","owner","state"}}), which a binding reads as a data source.
// `down` finds every deck whose title begins "İnceleme destesi " of the two owners with one SELECT (the id file may be gone or stale) and deletes it
// through DELETE /flashcard/decks/{id}, which works on a deck of any status, then deletes the notifications the answers sent the owners (DECK_PUBLISH_RESULT
// with such a deck title: no route removes a notification, so one DELETE). `up` runs `down` first, so a walk that died half way leaves nothing in the way;
// a second `down` says `none`. What nothing can remove: the audit rows (deck.private-read of every look, deck.unpublish), which the API never deletes.
// A run by hand takes the replay lock like a replay does (CONVENTIONS, round R2): `flock <scratchpad>/replay.lock nice -n 10 node ...`.
// Prints one line of JSON with "tag" for `up`, and `review-data elsewhere <mode> <n>` / `review-data down <n|none>` otherwise. Nothing secret is printed.
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
  call,
  Fail,
  LOCAL,
  must,
  options,
  run,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const REVIEWER = "systemAdmin";
const OWNERS = ["applicantD", "applicantG"];
const PREFIX = "İnceleme destesi";
const REASON = "Kartlarda kaynak gösterilmemiş.";
const CARDS = [
  ["فعل", "fiil"],
  ["اسم", "isim"],
  ["حرف", "harf"],
  ["كلمة", "kelime"],
  ["جملة", "cümle"],
];
const STATES = ["pending", "published", "rejected"];

const madePath = (tag) => resolve(LOCAL, "made", `${tag}.json`);
const readMade = (tag) => {
  if (!existsSync(madePath(tag)))
    throw new Fail(`no ${madePath(tag)}: run \`up ${tag}\` first`);
  return JSON.parse(readFileSync(madePath(tag), "utf8"));
};

async function down(tag) {
  const subs = OWNERS.map((o) => `'${subOf(o)}'`).join(", ");
  const out = await query(
    `select id, author_id from decks where title like '${PREFIX} %' and author_id in (${subs})`
  );
  const rows = out
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  for (const row of rows) {
    const owner = OWNERS.find((o) => subOf(o) === row.author_id);
    await must(owner, "DELETE", `/flashcard/decks/${row.id}`, undefined, [404]);
  }
  await query(
    `delete from notifications where user_id in (${subs}) and type = 'DECK_PUBLISH_RESULT' and params->>'deckTitle' like '${PREFIX} %'`
  );
  if (tag && existsSync(madePath(tag))) rmSync(madePath(tag));
  return rows.length;
}

run("review-data", async () => {
  const { rest, touch } = options(process.argv.slice(2), { values: ["touch"] });
  const [mode, tag, ...specs] = rest;
  if (!["up", "down", "elsewhere"].includes(mode) || !tag)
    throw new Fail(
      "usage: review-data.mjs up <tag> [--touch ACCOUNT] <key>:<state>:<owner>... | elsewhere <tag> answered|withdrawn | down <tag>",
      2
    );

  if (mode === "down") {
    if (specs.length) throw new Fail("down takes a tag only", 2);
    const n = await down(tag);
    console.log(`review-data down ${n || "none"}`);
    return;
  }

  if (mode === "elsewhere") {
    const [what, ...more] = specs;
    if (!["answered", "withdrawn"].includes(what) || more.length)
      throw new Fail(
        "usage: review-data.mjs elsewhere <tag> answered|withdrawn",
        2
      );
    const made = readMade(tag);
    let n = 0;
    for (const [key, deck] of Object.entries(made)) {
      if (key === "tag") continue;
      if (what === "answered") {
        // a request that was answered already is a 409 and is left alone; the walk may come here again
        if (deck.state !== "pending") continue;
        const r = await call(
          REVIEWER,
          "POST",
          `/nizam/deck-publish-requests/${deck.id}/approve`
        );
        if (r.status === 204) n++;
      } else {
        const now = await call(
          deck.owner,
          "GET",
          `/flashcard/decks/${deck.id}`
        );
        if (now.body?.publishStatus !== "PUBLISHED") continue;
        const r = await call(
          deck.owner,
          "DELETE",
          `/flashcard/decks/${deck.id}/publish-request`
        );
        if (r.status >= 200 && r.status < 300) n++;
      }
    }
    console.log(`review-data elsewhere ${what} ${n}`);
    return;
  }

  // up
  const decks = specs.map((spec) => {
    const m = /^([a-z][a-z0-9]*):([a-z]+):([A-Za-z]+)(?::(empty))?$/.exec(spec);
    if (!m || !STATES.includes(m[2]) || !OWNERS.includes(m[3]))
      throw new Fail(
        `${spec}: want <key>:<${STATES.join("|")}>:<${OWNERS.join("|")}>[:empty]`,
        2
      );
    return { key: m[1], state: m[2], owner: m[3], empty: m[4] === "empty" };
  });
  if (new Set(decks.map((d) => d.key)).size !== decks.length)
    throw new Fail("two decks with one key", 2);

  const old = await down(tag);
  // the first call of an account that has never been asked gives it its users row (GET /me), which a deck needs for its author
  for (const account of new Set(
    [...decks.map((d) => d.owner), touch].filter(Boolean)
  ))
    await must(account, "GET", "/me");

  const made = { tag };
  try {
    for (const d of decks) {
      const title = `${PREFIX} ${d.key.toUpperCase()}`;
      const deck = await must(d.owner, "POST", "/flashcard/decks", {
        title,
        cardType: "VOCABULARY",
      });
      const id = deck.body.id;
      made[d.key] = { id, title, owner: d.owner, state: d.state };
      if (!d.empty)
        await must(
          d.owner,
          "POST",
          `/flashcard/decks/${id}/cards`,
          CARDS.map(([contentFront, contentBack]) => ({
            type: "VOCABULARY",
            contentFront,
            contentBack,
          }))
        );
      await must(d.owner, "POST", `/flashcard/decks/${id}/publish-request`);
      if (d.state === "published")
        await must(
          REVIEWER,
          "POST",
          `/nizam/deck-publish-requests/${id}/approve`
        );
      if (d.state === "rejected")
        await must(
          REVIEWER,
          "POST",
          `/nizam/deck-publish-requests/${id}/reject`,
          { reason: REASON }
        );
    }
  } catch (e) {
    await down(tag); // a half-made set is not left for the next walk to find
    throw e;
  }
  mkdirSync(resolve(LOCAL, "made"), { recursive: true });
  writeFileSync(madePath(tag), `${JSON.stringify(made)}\n`, { mode: 0o600 });
  console.log(
    JSON.stringify({
      tag,
      decks: decks.map((d) => `${d.key}:${d.state}${d.empty ? ":empty" : ""}`),
      removedOld: old,
    })
  );
});
