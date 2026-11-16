// The walk data of nazar.offsite.requestCourse: a köşk of the walk's own to send the request to, made and hidden through
// tedrisat's HTTP API. It is the binding's `setup` and `events`: `node kosk.mjs <command> ...`. The way back is the shared
// helpers/remove-kosk.mjs (DELETE /kosks/:id, which takes the köşk and, by cascade, the request sent to it).
//
//   make     --handle <h> --name <n> --nazim <ACCOUNT>   removes every köşk with that short name, makes the account known to
//                                                         tedrisat (GET /me as them), opens the köşk as the başnazım with the
//                                                         account as its nazım, and checks that it is the first köşk by name
//   touch    --handle <h>                                reads the köşk: it exists and is listed; changes nothing
//   hide     --handle <h>                                hides the köşk as the başnazım (POST /kosks/:id/hide): the way a
//                                                         chosen köşk goes while the form is open (KOSK_NOT_FOUND)
//   requests --handle <h> --as <ACCOUNT>                 the köşk's waiting course requests, as its nazım reads them
//
// The form's first köşk is the first by name in Turkish order (features/offsite/offsite.ts:28), and the walk starts from it, so
// `make` fails, saying which köşk sorts before, when the walk's own is not the first. Prints one line each:
//   kosk <handle> ready <id> | ok <handle> listed | ok <handle> hidden | requests <handle> <n>: <title> | <title>
// Nothing secret is printed. Run it under the replay lock when walks are running and you run it by hand.
import {
  accountKey,
  call,
  Fail,
  must,
  options,
  run,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const usage =
  "usage: kosk.mjs make --handle <h> --name <n> --nazim <ACCOUNT> | touch --handle <h> | hide --handle <h> | requests --handle <h> --as <ACCOUNT>";

const plain = (handle) => handle.replace(/^@/, "").toLowerCase();

// every köşk the directory holds under that short name (the directory lists hidden ones too)
async function withHandle(handle) {
  const found = (
    await must(
      "SYSTEM_ADMIN",
      "GET",
      `/kosks/directory?q=${encodeURIComponent(handle)}&limit=50`
    )
  ).body;
  return (found.items ?? []).filter(
    (k) => plain(k.handle ?? "") === plain(handle)
  );
}

// the köşks the page offers, by name in Turkish order, as offsite-page.tsx reads them (fifty a page, ten pages at most)
async function listed() {
  const out = [];
  for (let page = 1; page <= 10; page += 1) {
    const answer = (
      await must("SYSTEM_ADMIN", "GET", `/kosks?page=${page}&limit=50`)
    ).body;
    out.push(...answer.items);
    if (answer.items.length === 0 || out.length >= answer.total) break;
  }
  const collator = new Intl.Collator("tr");
  return out.sort((a, b) => collator.compare(a.name, b.name));
}

run("kosk", async () => {
  const [command, ...args] = process.argv.slice(2);
  const o = options(args, { values: ["handle", "name", "nazim", "as"] });
  if (!command || o.rest.length || !o.handle) throw new Fail(usage, 2);

  if (command === "make") {
    if (!o.name || !o.nazim) throw new Fail(usage, 2);
    for (const k of await withHandle(o.handle))
      await must("SYSTEM_ADMIN", "DELETE", `/kosks/${k.id}`);
    // an account tedrisat has never seen is refused as a nazım: its first GET /me writes its row
    await must(o.nazim, "GET", "/me");
    const made = (
      await must("SYSTEM_ADMIN", "POST", "/kosks", {
        name: o.name,
        handle: plain(o.handle),
        managerUserIds: [subOf(o.nazim)],
      })
    ).body;
    const first = (await listed())[0];
    if (first?.id !== made.id)
      throw new Fail(
        `the köşk "${o.name}" is not the first by name: "${first?.name}" sorts before it, and the form would start from that one`
      );
    console.log(`kosk ${plain(o.handle)} ready ${made.id}`);
    return;
  }

  const [kosk] = await withHandle(o.handle);
  if (!kosk) throw new Fail(`no köşk has the short name ${o.handle}`);

  if (command === "touch") {
    if (!(await listed()).some((k) => k.id === kosk.id))
      throw new Fail(`the köşk ${o.handle} is not listed`);
    console.log(`ok ${plain(o.handle)} listed`);
  } else if (command === "hide") {
    await must("SYSTEM_ADMIN", "POST", `/kosks/${kosk.id}/hide`);
    console.log(`ok ${plain(o.handle)} hidden`);
  } else if (command === "requests") {
    if (!o.as) throw new Fail(usage, 2);
    const r = await call(
      o.as,
      "GET",
      `/kosks/${kosk.id}/course-requests?status=PENDING`
    );
    if (r.status !== 200)
      throw new Fail(
        `${accountKey(o.as)} GET course-requests: HTTP ${r.status}`
      );
    const titles = (r.body.items ?? []).map((i) => i.title);
    console.log(
      `requests ${plain(o.handle)} ${titles.length}: ${titles.join(" | ")}`
    );
  } else throw new Fail(usage, 2);
});
