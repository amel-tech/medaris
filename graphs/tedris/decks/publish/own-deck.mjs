// Makes the one thing tedris.decks.publish needs that the seed has not got: a deck of its own, in the status a scenario starts from, and takes it
// away again (the binding's setup and teardown).
//
//   node ../tedris/decks/publish/own-deck.mjs make [--status private|pending|published|rejected]   (default private)
//   node ../tedris/decks/publish/own-deck.mjs flip     the author in another tab: a private deck is asked for, any other is taken back to private
//   node ../tedris/decks/publish/own-deck.mjs remove
//
// The deck belongs to a spare talebe, APPLICANT_E, so nothing of the seeded talebe's is touched and the Desteler page of the walk shows one new
// deck. It is made through the API as its author (POST /flashcard/decks), the way the create page does, with no cards; the status is then reached
// the way a person reaches it: the author asks (POST /flashcard/decks/{id}/publish-request), and for `published` and `rejected` the Medaris
// başnazım (SYSTEM_ADMIN, who may answer any request but his own) answers it through the nizam routes (POST /nizam/deck-publish-requests/{id}/approve
// or /reject with a reason). No SQL for the making.
// `remove` deletes every deck of that title of that author (DELETE /flashcard/decks/{id}, which works on a deck of any status), found with one
// SELECT because the id file may be gone or stale, and deletes the notifications the answers wrote (DECK_PUBLISH_RESULT with that deck title in its
// params: no route removes a notification, and the deck's id is not needed, so a walk that died after deleting the deck still leaves nothing).
// The deck's id is written to graphs/.local/publish-deck.json ({"deck": "<uuid>"}), which the binding reads as {pd.deck}. `make` and `remove` are
// idempotent: `make` first removes what an earlier walk left, `remove` says `none` when there is nothing.
// `flip` is the event MOVED_ON of the flow, the author's own change made where the open page cannot see it: it reads the deck's status as the API holds it
// and does the one thing that makes the page's next press a 409 (a private deck is asked for, so "Yayın iste" is refused; a waiting, published or refused
// deck is withdrawn, so "İsteği geri çek" and "Özele çek" are refused). It prints the status it found and the one it made.
// Prints `own-deck made <id> <status>`, `own-deck flipped <from> to <to>` or `own-deck removed <n|none>`. Nothing secret is printed.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

const OWNER = "applicantE";
const REVIEWER = "systemAdmin";
const TITLE = "Yayın denemesi destesi";
const REASON = "Kartlar yetersiz; sayıları artınca yeniden iste.";
const FILE = resolve(LOCAL, "publish-deck.json");

const idsOf = async () => {
  const out = await query(
    `select id from decks where title = '${TITLE}' and author_id = '${subOf(OWNER)}'`
  );
  return out
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l).id);
};

const remove = async () => {
  const ids = await idsOf();
  for (const id of ids)
    await must(OWNER, "DELETE", `/flashcard/decks/${id}`, undefined, [404]);
  await query(
    `delete from notifications where user_id = '${subOf(OWNER)}' and type = 'DECK_PUBLISH_RESULT' and params->>'deckTitle' = '${TITLE}'`
  );
  return ids.length;
};

run("own-deck", async () => {
  const { rest, status = "private" } = options(process.argv.slice(2), {
    values: ["status"],
  });
  const [mode, ...more] = rest;
  if (
    !["make", "remove", "flip"].includes(mode) ||
    more.length ||
    !["private", "pending", "published", "rejected"].includes(status)
  )
    throw new Fail(
      "usage: own-deck.mjs make [--status private|pending|published|rejected] | flip | remove",
      2
    );

  if (mode === "flip") {
    const id = JSON.parse(readFileSync(FILE, "utf8")).deck;
    const was = (await must(OWNER, "GET", `/flashcard/decks/${id}`)).body
      .publishStatus;
    const to = was === "PRIVATE" ? "PENDING" : "PRIVATE";
    await must(
      OWNER,
      was === "PRIVATE" ? "POST" : "DELETE",
      `/flashcard/decks/${id}/publish-request`
    );
    console.log(`own-deck flipped ${was} to ${to}`);
    return;
  }

  const old = await remove();
  if (mode === "remove") {
    console.log(`own-deck removed ${old || "none"}`);
    return;
  }
  // the first call of an account that has never been asked gives it its users row (GET /me), which a deck needs for its author
  await must(OWNER, "GET", "/me");
  const made = await must(OWNER, "POST", "/flashcard/decks", {
    title: TITLE,
    cardType: "VOCABULARY",
  });
  const id = made.body.id;
  try {
    if (status !== "private") {
      await must(OWNER, "POST", `/flashcard/decks/${id}/publish-request`);
      if (status === "published")
        await must(
          REVIEWER,
          "POST",
          `/nizam/deck-publish-requests/${id}/approve`
        );
      if (status === "rejected")
        await must(
          REVIEWER,
          "POST",
          `/nizam/deck-publish-requests/${id}/reject`,
          { reason: REASON }
        );
    }
  } catch (e) {
    await remove(); // a half-made deck is not left for the next walk to find
    throw e;
  }
  mkdirSync(LOCAL, { recursive: true });
  writeFileSync(FILE, `${JSON.stringify({ deck: id, title: TITLE })}\n`, {
    mode: 0o600,
  });
  console.log(
    `own-deck made ${id} ${status}${old ? ` (removed ${old} old)` : ""}`
  );
});
