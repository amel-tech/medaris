// Gives a spare talebe everything Ana sayfa can show, and takes it away again (tedris.shell.home's setup and teardown).
//
//   node ../tedris/shell/home/home-data.mjs up   <ACCOUNT>   the account is in the köşk's own course, follows the köşk, and has a deck with two cards waiting
//   node ../tedris/shell/home/home-data.mjs down <ACCOUNT>   the way back: no seat, no follow, no deck
//
// What `up` makes, through tedrisat's own API as that account (no SQL):
//   - a seat in the standalone course `seed.courses.standalone` (it takes anyone: POST /courses/{id}/enroll gives ENROLLED at once),
//     so GET /me/upcoming-lessons has the course's celses and GET /courses/enrolled has the course;
//   - a follow of `seed.kosk` (POST /kosks/{id}/follow). The account is in only one of that köşk's three courses, so the other two are
//     what "Takip ettiğin köşklerden" lists;
//   - a private deck "Tekrar Defteri" with two cards, each given a progress row with a bare status LEARNING (PUT /flashcard/cards/progress):
//     a row written without a rating has no due time, and a LEARNING row with no due time is due now (invariant card-review-due), so
//     GET /flashcard/decks/due lists the deck with "2 kart tekrar bekliyor".
// Both commands are idempotent: `up` finds what is already there, `down` removes what is there and says `none` for the rest.
// Prints `home-data <up|down> <ACCOUNT> <what was done>`. Nothing secret is printed.
import {
  accountKey,
  call,
  Fail,
  must,
  refusal,
  run,
  seed,
} from "../../../bindings/helpers/lib.mjs";

const TITLE = "Tekrar Defteri";

const decksOf = async (account) => {
  const r = await must(account, "GET", "/flashcard/decks?isPublic=false");
  return (Array.isArray(r.body) ? r.body : []).filter((d) => d.title === TITLE);
};

run("home-data", async () => {
  const [mode, account, ...more] = process.argv.slice(2);
  if (!["up", "down"].includes(mode) || !account || more.length)
    throw new Fail("usage: home-data.mjs up|down <ACCOUNT>", 2);
  const key = accountKey(account);
  const course = seed().courses.standalone;
  const kosk = seed().kosk;

  if (mode === "up") {
    const done = [];
    const enrol = await must(account, "POST", `/courses/${course}/enroll`);
    done.push(`seat ${enrol.body?.status ?? "ok"}`);
    await must(account, "POST", `/kosks/${kosk}/follow`);
    done.push("follows");
    let deck = (await decksOf(account))[0];
    if (!deck) {
      deck = (
        await must(account, "POST", "/flashcard/decks", {
          title: TITLE,
          cardType: "VOCABULARY",
        })
      ).body;
      await must(account, "POST", `/flashcard/decks/${deck.id}/cards`, [
        { type: "VOCABULARY", contentFront: "kitâb", contentBack: "kitap" },
        {
          type: "VOCABULARY",
          contentFront: "kalem",
          contentBack: "yazı aracı",
        },
      ]);
    }
    const cards = await must(
      account,
      "GET",
      `/flashcard/cards?deckId=${deck.id}`
    );
    const list = Array.isArray(cards.body)
      ? cards.body
      : (cards.body?.items ?? []);
    if (list.length < 2)
      throw new Fail(
        `${key}: the deck ${deck.id} has ${list.length} cards, not 2`
      );
    await must(
      account,
      "PUT",
      "/flashcard/cards/progress",
      list.map((c) => ({ flashcardId: c.id, status: "LEARNING" }))
    );
    done.push(`deck ${list.length} cards waiting`);
    console.log(`home-data up ${key} ${done.join(", ")}`);
    return;
  }

  const done = [];
  const left = await call(account, "DELETE", `/courses/${course}/enrollment`);
  done.push(
    left.status === 404
      ? "seat none"
      : left.status < 300
        ? "seat removed"
        : `seat ${refusal(left)}`
  );
  if (left.status >= 300 && left.status !== 404)
    throw new Fail(`${key}: ${refusal(left)}`);
  await must(account, "DELETE", `/kosks/${kosk}/follow`, undefined, [404]);
  done.push("follow removed");
  const decks = await decksOf(account);
  for (const d of decks)
    await must(account, "DELETE", `/flashcard/decks/${d.id}`);
  done.push(decks.length ? `deck removed (${decks.length})` : "deck none");
  console.log(`home-data down ${key} ${done.join(", ")}`);
});
