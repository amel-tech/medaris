// The walk data of nizam.notifications.triage: ban notices for one nizam persona, written as tedrisat's ban producer writes them and
// taken away again, and ONLY those. tedrisat has no route that makes a notification (it is the side effect of a ban: BanService.announce,
// ban.service.ts:350), and a real ban would leave a ban behind that nothing deletes, so the rows are SQL, with the columns and params
// the producer fills. It is the binding's `setup`, `teardown`, `before` and `effects`: `node triage.mjs up|down|count|gone|unread ...`.
//
// Every row this helper writes carries `walk: "nizam.notifications.triage"` in its params, and every verb that deletes or counts reads
// that mark: `down` and the delete inside `up` remove the account's rows with it and no other, so a notification the walk did not
// make is never deleted, and (because the page's "Tümünü okundu say" marks every unread ban notice of the person, not only the walk's)
// `up` refuses an account that already holds a ban notice without the mark. The nizam page asks for COURSE_BAN_PLACED and
// KOSK_BAN_PLACED only, so the account's other kinds (a talebe-side notice) are neither drawn, counted nor marked, and are left alone.
//
//   node ../nizam/notifications/triage/triage.mjs up <ACCOUNT> --set triage|platform|last|allRead|empty
//         removes the walk's earlier rows of the account, checks it holds no ban notice that is not the walk's, and writes the set in one
//         transaction, so it can be run twice; prints `ready: <set> total=<n> unread=<m>`
//   node ../nizam/notifications/triage/triage.mjs sql <ACCOUNT> --set <set>
//         prints the SQL `up` would run and runs nothing
//   node ../nizam/notifications/triage/triage.mjs down <ACCOUNT>
//         removes the walk's rows of the account; prints `removed <n> <KEY>` (n may be 0)
//   node ../nizam/notifications/triage/triage.mjs count <ACCOUNT>
//         prints `triage <KEY> total=<n> unread=<m>` over the walk's rows
//   node ../nizam/notifications/triage/triage.mjs gone <ACCOUNT>
//         removes the walk's NEWEST UNREAD row, the one the page lists first: the page still shows it (it keeps its first read), the API
//         has none, so marking it is refused with 404 NOTIFICATION_NOT_FOUND; prints `gone <n> <KEY>`, n being 1, or 0 when the walk
//         has no unread row left (not a failure: a walk that comes back to the same state may ask twice)
//   node ../nizam/notifications/triage/triage.mjs unread <ACCOUNT> below|zero [--wait <seconds>]
//         for an `effects` check after a mark: `below` prints `unread fell` when fewer of the walk's rows are unread than the set made
//         unread, `zero` prints `unread zero` when none is; either exits 1 if not. A row opened by its title is marked while the browser
//         leaves, so --wait polls for that many seconds before it gives up
//
// The sets (an unread row is listed first; day = the calendar day in Europe/Istanbul, the browser's and the account's zone, so the
// rows are placed at "now less some minutes" clamped to the day's first minutes, "yesterday noon" and "N days ago noon", whatever the
// hour the walk runs at):
//   triage    scope kosk, holds several, pages several. Unread: 2 today, 1 yesterday. Read: 1 today, 2 earlier, and 20 more, a day apart
//             and older, so the person holds 26: the first page is 20 rows and "Daha fazla göster" reads the other 6.
//   platform  scope platform, holds several, pages one. Unread: 1 today, 1 yesterday. Read: 1 today, 1 earlier.
//   last      holds one, pages one. Unread: 1 today. Read: 1 today, 1 earlier.
//   allRead   holds allRead, pages one. Read: 1 today, 1 yesterday, 1 earlier.
//   empty     holds nothing: no row.
// Each set has at least one read row except `empty`, because the graph draws a read title under Tümü. Every row targets the köşk of the
// seed (graphs/.local/seed.json), so its title leads to /kosks/<id>/yasaklamalar, which exists, and names that köşk as its source. The
// names are invented; the params are the ones the producer writes (source, koskName, courseTitle, talebeName, actorName, reason) plus
// the walk's mark and `was`. Run by hand only under the replay lock. Nothing secret is printed.
import { query } from "../../../bindings/helpers/db.mjs";
import {
  accountKey,
  Fail,
  options,
  run,
  seed,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const TAG = "nizam.notifications.triage";
const BAN_TYPES = ["COURSE_BAN_PLACED", "KOSK_BAN_PLACED"];
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const ZONE = "Europe/Istanbul";
const START = `(date_trunc('day', now() at time zone '${ZONE}') at time zone '${ZONE}')`;
// the list is paged on (created_at, id) and the cursor travels as a JavaScript Date, so every value is cut to the millisecond
const ms = (expr) => `date_trunc('milliseconds', ${expr})`;
const AT = {
  // newest rows of today: minutes ago, clamped so a walk just after midnight keeps them in today, in the same order
  today: (minutesAgo) =>
    ms(
      `greatest(now() - interval '${minutesAgo} minutes', ${START} + interval '${600 - minutesAgo} seconds')`
    ),
  yesterday: () => ms(`${START} - interval '1 day' + interval '12 hours'`),
  earlier: (days) =>
    ms(`${START} - interval '${days} days' + interval '12 hours'`),
};

/** The rows of each set, newest first. `u`: unread, `r`: read. */
function setsOf() {
  const row = (type, read, at, talebeName) => ({
    type,
    read,
    at,
    talebeName,
  });
  const u = (type, at, name) => row(type, false, at, name);
  const r = (type, at, name) => row(type, true, at, name);
  const COURSE = "COURSE_BAN_PLACED";
  const KOSK = "KOSK_BAN_PLACED";
  const bulk = Array.from({ length: 20 }, (_, i) =>
    r(
      COURSE,
      AT.earlier(7 + i),
      `Eski Talebe ${String(i + 1).padStart(2, "0")}`
    )
  );
  return {
    triage: [
      u(COURSE, AT.today(5), "Mert Deneme"),
      u(KOSK, AT.today(8), "Selin Deneme"),
      u(COURSE, AT.yesterday(), "Kerem Deneme"),
      r(COURSE, AT.today(20), "Emre Deneme"),
      r(KOSK, AT.earlier(3), "Deniz Deneme"),
      r(COURSE, AT.earlier(6), "Ece Deneme"),
      ...bulk,
    ],
    platform: [
      u(COURSE, AT.today(5), "Mert Deneme"),
      u(KOSK, AT.yesterday(), "Selin Deneme"),
      r(COURSE, AT.today(30), "Emre Deneme"),
      r(KOSK, AT.earlier(4), "Deniz Deneme"),
    ],
    last: [
      u(COURSE, AT.today(5), "Mert Deneme"),
      r(COURSE, AT.today(30), "Emre Deneme"),
      r(KOSK, AT.earlier(4), "Deniz Deneme"),
    ],
    allRead: [
      r(COURSE, AT.today(5), "Mert Deneme"),
      r(KOSK, AT.yesterday(), "Selin Deneme"),
      r(COURSE, AT.earlier(5), "Emre Deneme"),
    ],
    empty: [],
  };
}

const one = async (sql) => {
  const out = await query(sql);
  const first = out.trim().split("\n")[0];
  return first ? JSON.parse(first) : null;
};
const mine = (userId) =>
  `user_id = ${lit(userId)} and params->>'walk' = ${lit(TAG)}`;
const counts = async (userId) =>
  one(
    `select count(*)::int as total, (count(*) filter (where read_at is null))::int as unread, (count(*) filter (where params->>'was' = 'unread'))::int as made from notifications where ${mine(userId)}`
  );

run("triage", async () => {
  const [verb, account, ...args] = process.argv.slice(2);
  const usage =
    "usage: triage.mjs up|sql <ACCOUNT> --set triage|platform|last|allRead|empty | down <ACCOUNT> | count <ACCOUNT> | gone <ACCOUNT> | unread <ACCOUNT> below|zero [--wait <seconds>]";
  if (!verb || !account) throw new Fail(usage, 2);
  const key = accountKey(account);
  const userId = subOf(account);

  if (verb === "up" || verb === "sql") {
    const o = options(args, { values: ["set"] });
    const rows = setsOf()[o.set];
    if (!rows || o.rest.length) throw new Fail(usage, 2);
    const S = seed();
    const statements = [`delete from notifications where ${mine(userId)}`];
    if (rows.length) {
      const values = rows.map((row) => {
        const params = {
          walk: TAG,
          was: row.read ? "read" : "unread",
          source: S.titles.kosk,
          koskName: S.titles.kosk,
          courseTitle: "Örnek ders",
          talebeName: row.talebeName,
          actorName: "Nuri Örnek",
          reason: "Tekrarlanan kural ihlali.",
        };
        return `(${lit(userId)}, ${lit(row.type)}, 'KOSK', ${lit(S.kosk)}, ${lit(JSON.stringify(params))}::jsonb, ${row.read ? "now()" : "null"}, ${row.at})`;
      });
      statements.push(
        `insert into notifications (user_id, type, target_type, target_id, params, read_at, created_at) values ${values.join(", ")}`
      );
    }
    if (verb === "sql") {
      // prints what `up` would run, and runs nothing
      console.log(`${statements.join(";\n")};`);
      return;
    }
    // the page's "Tümünü okundu say" marks every unread ban notice of the person, and the tabs count them: a notice that is not the
    // walk's would be marked, and counted, so it is a reason to stop, never a row to delete
    const foreign = await one(
      `select count(*)::int as n from notifications where user_id = ${lit(userId)} and type in (${BAN_TYPES.map(lit).join(", ")}) and coalesce(params->>'walk', '') <> ${lit(TAG)}`
    );
    if (foreign.n > 0)
      throw new Fail(
        `${key} holds ${foreign.n} ban notice(s) that this walk did not make: the page would count them and "Tümünü okundu say" would mark them; clear them in the walk that made them`
      );
    await query(statements.join(";\n"));
    const now = await counts(userId);
    console.log(`ready: ${o.set} total=${now.total} unread=${now.unread}`);
  } else if (verb === "down") {
    if (args.length) throw new Fail(usage, 2);
    const out = await one(`delete from notifications where ${mine(userId)}`);
    console.log(`removed ${out.rows} ${key}`);
  } else if (verb === "count") {
    if (args.length) throw new Fail(usage, 2);
    const now = await counts(userId);
    console.log(`triage ${key} total=${now.total} unread=${now.unread}`);
  } else if (verb === "gone") {
    if (args.length) throw new Fail(usage, 2);
    const out = await one(
      `delete from notifications where id = (select id from notifications where ${mine(userId)} and read_at is null order by created_at desc, id desc limit 1)`
    );
    console.log(`gone ${out.rows} ${key}`);
  } else if (verb === "unread") {
    const o = options(args, { values: ["wait"] });
    const [which, ...rest] = o.rest;
    if (rest.length || !["below", "zero"].includes(which))
      throw new Fail(usage, 2);
    const until = Date.now() + Number(o.wait ?? 0) * 1000;
    for (;;) {
      const now = await counts(userId);
      const ok = which === "zero" ? now.unread === 0 : now.unread < now.made;
      if (ok) {
        console.log(
          which === "zero"
            ? "unread zero"
            : `unread fell (${now.made} to ${now.unread})`
        );
        return;
      }
      if (Date.now() >= until)
        throw new Fail(
          which === "zero"
            ? `${key} still has ${now.unread} unread`
            : `${key} has ${now.unread} unread, as many as the set made (${now.made})`
        );
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  } else {
    throw new Fail(usage, 2);
  }
});
