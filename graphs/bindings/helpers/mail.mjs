// Mailpit, the stack's mail catcher (http://localhost:8025, or $MAILPIT_URL): what a step mailed, and a clean start for the next.
//
//   node helpers/mail.mjs search <query> [--text] [--limit <n>] [--wait <seconds>]
//   node helpers/mail.mjs clear [query]
//
// <query> is Mailpit's own search: `to:a@b.test`, `from:`, `subject:"Davet"`, `is:unread`, or words (a query with spaces is one argument).
// search prints one line of JSON per message, newest first: {"id","created","from","to":[...],"subject","snippet"}, and with --text
// also "text", the plain-text body (a mailed link is in it). With no match it prints `no mail matches` and exits 0, so an `expect` can
// check for absence; with --wait it keeps asking for that many seconds and fails (exit 1) when nothing came, for the mail a step sends
// a moment after it ends. clear with no query empties the mailbox; with one it deletes the messages that match. Prints `clear <n>`.
import { Fail, MAILPIT, options, run } from "./lib.mjs";

const get = async (path) => {
  const res = await fetch(`${MAILPIT}${path}`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok)
    throw new Fail(
      `Mailpit answered ${res.status} to GET ${path.split("?")[0]}`
    );
  return res.json();
};
const del = async (path) => {
  const res = await fetch(`${MAILPIT}${path}`, {
    method: "DELETE",
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok)
    throw new Fail(
      `Mailpit answered ${res.status} to DELETE ${path.split("?")[0]}`
    );
};

run("mail", async () => {
  const [verb, ...args] = process.argv.slice(2);
  if (verb === "search") {
    const o = options(args, { values: ["limit", "wait"], flags: ["text"] });
    if (o.rest.length !== 1)
      throw new Fail(
        "usage: mail.mjs search <query> [--text] [--limit <n>] [--wait <seconds>]",
        2
      );
    const query = o.rest[0];
    const limit = Number(o.limit ?? 50);
    const until = Date.now() + Number(o.wait ?? 0) * 1000;
    let found;
    for (;;) {
      found =
        (
          await get(
            `/api/v1/search?query=${encodeURIComponent(query)}&limit=${limit}`
          )
        ).messages ?? [];
      if (found.length || Date.now() >= until) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    if (!found.length) {
      if (o.wait !== undefined)
        throw new Fail(`no mail matched ${query} within ${o.wait} s`);
      return console.log("no mail matches");
    }
    for (const m of found) {
      const line = {
        id: m.ID,
        created: m.Created,
        from: m.From?.Address ?? null,
        to: (m.To ?? []).map((t) => t.Address),
        subject: m.Subject,
        snippet: m.Snippet,
      };
      if (o.text) line.text = (await get(`/api/v1/message/${m.ID}`)).Text ?? "";
      console.log(JSON.stringify(line));
    }
  } else if (verb === "clear") {
    if (args.length > 1) throw new Fail("usage: mail.mjs clear [query]", 2);
    if (args.length) {
      const n =
        (
          await get(
            `/api/v1/search?query=${encodeURIComponent(args[0])}&limit=1`
          )
        ).messages_count ?? 0;
      await del(`/api/v1/search?query=${encodeURIComponent(args[0])}`);
      console.log(`clear ${n}`);
    } else {
      const n = (await get("/api/v1/messages?limit=1")).total ?? 0;
      await del("/api/v1/messages");
      console.log(`clear ${n}`);
    }
  } else {
    throw new Fail(
      "usage: mail.mjs search <query> [--text] [--limit <n>] [--wait <seconds>] | clear [query]",
      2
    );
  }
});
