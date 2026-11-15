// What tedris.decks.create's walk made, read and taken away, through tedrisat's own HTTP API (no SQL):
//
//   node ../tedris/decks/create/own-decks.mjs show   <ACCOUNT> <title>   what the account's own decks of that exact title hold
//   node ../tedris/decks/create/own-decks.mjs remove <ACCOUNT> <title>   deletes them, as their author
//
// The decks are found in GET /flashcard/decks/summary (the caller's own, `isMine`, newest first), by their exact title, and read
// one by one with GET /flashcard/decks/{id}, which gives the author the tags; `remove` is DELETE /flashcard/decks/{id}. Nothing
// but the account's decks of that one title is touched, so a walk's setup, teardown and effects cannot reach another flow's data.
//
// `show` prints one line of JSON, in this order, so that an `expect` can match a substring of it:
//   {"count":0}
//   {"count":1,"isPublic":false,"publishStatus":"PRIVATE","tags":["sarf","nahiv"],"description":"...","cardType":"VOCABULARY"}
// (the fields of the first deck when there are several). `remove` prints `own-decks remove <n>` or `own-decks remove none`.
// Both are idempotent. Nothing secret is printed.
import { Fail, must, run } from "../../../bindings/helpers/lib.mjs";

const idsOf = async (account, title) => {
  const r = await must(account, "GET", "/flashcard/decks/summary");
  const rows = Array.isArray(r.body) ? r.body : (r.body?.items ?? []);
  return rows.filter((d) => d.isMine && d.title === title).map((d) => d.id);
};

run("own-decks", async () => {
  const [mode, account, title, ...more] = process.argv.slice(2);
  if (!["show", "remove"].includes(mode) || !account || !title || more.length)
    throw new Fail("usage: own-decks.mjs show|remove <ACCOUNT> <title>", 2);
  const ids = await idsOf(account, title);
  if (mode === "remove") {
    for (const id of ids)
      await must(account, "DELETE", `/flashcard/decks/${id}`, undefined, [404]);
    console.log(`own-decks remove ${ids.length ? ids.length : "none"}`);
    return;
  }
  if (!ids.length) return console.log(JSON.stringify({ count: 0 }));
  const d = (await must(account, "GET", `/flashcard/decks/${ids[0]}`)).body;
  console.log(
    JSON.stringify({
      count: ids.length,
      isPublic: d.isPublic,
      publishStatus: d.publishStatus,
      tags: d.tags,
      description: d.description ?? null,
      cardType: d.cardType,
    })
  );
});
