// The walk data of nazar.notifications.inbox: the notifications of one account, made and removed with SQL on tedrisat's database,
// because no route writes a notification (it is the side effect of what somebody else does) and the stack's accounts that work in
// Nazar hold none. It is the binding's `setup`, `teardown` and `effects`: `node inbox.mjs up|down|count|unread ...`.
//
//   up    <ACCOUNT> --set triage|openLink|last|allRead|empty
//         deletes every notification of the account and makes the set's rows, in one transaction, so it can be run twice; prints
//         `ready: <set> total=<n> unread=<m>` and keeps the unread count in graphs/.local/made/inbox-<KEY>.json
//   down  <ACCOUNT>                      deletes every notification of the account; prints `restored: none left`
//   count <ACCOUNT>                      prints `inbox <KEY> total=<n> unread=<m>`
//   drop  <ACCOUNT> <TYPE>               deletes the account's rows of that type; prints `dropped <n> <TYPE>`. It is how a walk makes
//                                        the next mark of such a row refused (404): the page still shows the row, the API has none
//   unread <ACCOUNT> below|zero          for an `effects` check after a mark: `below` prints `unread fell` when the account has fewer
//                                        unread than `up` made, `zero` prints `unread zero` when it has none; either exits 1 if not
//
// The sets (an unread row is listed first; a row's age is its place in the set, in minutes, the bulk rows a day or more):
//   triage    row: button, holds: several, pages: several. Unread: three rows that lead nowhere (a course ban notice, a köşk
//             application's answer, a köşk ban notice). Read: three links (an application's answer, a cancelled celse, a deck) and a
//             plain-text row, and 24 more read links, so the list is longer than twenty rows.
//   openLink  row: link, holds: several, pages: one. Unread: four links, one of a kind the page does not word (EXAM_SCHEDULED:
//             F-E-20). Read: one link and one plain-text row.
//   last      row: button, holds: one, pages: one. Unread: one row that leads nowhere. Read: two links and a plain-text row.
//   allRead   row: link, holds: allRead, pages: one. Read: two links and a plain-text row.
//   empty     holds: nothing. No row.
// The targets are the seed's own course, celse, deck and köşk (graphs/.local/seed.json), so a link opens a page that exists. A row's
// words are the page's own (Notifications.types.*); nothing here is a person's real name.
//
// ACCOUNT is a role key of graphs/.local/accounts.env or the name a binding gives (medreseNazir). The account must hold no
// notification that matters: `up` and `down` delete them all. The stack seeds none for MEDRESE_NAZIR, MEDRESE_BASMUDERRIS, MUDERRIS
// and DERS_NAZIR, the accounts that have a seat in Nazar. Nothing secret is printed.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { query } from "../../../bindings/helpers/db.mjs";
import {
  accountKey,
  Fail,
  LOCAL,
  options,
  run,
  seed,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const KEEP = (key) => resolve(LOCAL, "made", `inbox-${key}.json`);

/** Rows of a set, newest first. u = unread, r = read; the target is `[type, id]` or null. */
function setsOf(S) {
  const course = ["COURSE", S.courses.open];
  const session = ["SESSION", S.sessions.open.next];
  const deck = ["DECK", S.decks.course];
  const kosk = ["KOSK", S.kosk];
  const u = (type, target = null, params = {}) => ({
    type,
    target,
    params,
    read: false,
  });
  const r = (type, target = null, params = {}) => ({
    type,
    target,
    params,
    read: true,
  });
  const cancelled = (read) => ({
    type: "SESSION_CANCELLED",
    target: session,
    params: { courseId: S.courses.open },
    read,
  });
  return {
    triage: {
      rows: [
        u("COURSE_BAN_PLACED", course),
        u("KOSK_APPLICATION_RESULT", null, { outcome: "approved" }),
        u("KOSK_BAN_PLACED", kosk),
        r("ENROLLMENT_APPROVED", course),
        cancelled(true),
        r("DECK_PUBLISH_RESULT", deck, { outcome: "unpublished" }),
        r("KOSK_APPLICATION_RESULT", null, { outcome: "rejected" }),
      ],
      bulk: 24,
    },
    openLink: {
      rows: [
        u("ENROLLMENT_APPROVED", course),
        cancelled(false),
        u("EXAM_SCHEDULED", course),
        u("DECK_PUBLISH_RESULT", deck, { outcome: "approved" }),
        r("ENROLLMENT_REJECTED", course),
        r("KOSK_APPLICATION_RESULT", null, { outcome: "rejected" }),
      ],
      bulk: 0,
    },
    last: {
      rows: [
        u("KOSK_APPLICATION_RESULT", null, { outcome: "approved" }),
        r("ENROLLMENT_APPROVED", course),
        r("RECORDING_ADDED", course),
        r("KOSK_BAN_PLACED"),
      ],
      bulk: 0,
    },
    allRead: {
      rows: [
        r("ENROLLMENT_APPROVED", course),
        r("SESSION_RESCHEDULED", session, { courseId: S.courses.open }),
        r("KOSK_BAN_PLACED"),
      ],
      bulk: 0,
    },
    empty: { rows: [], bulk: 0 },
  };
}

const counts = async (userId) => {
  const out = await query(
    `select count(*)::int as total, (count(*) filter (where read_at is null))::int as unread from notifications where user_id = ${lit(userId)}`
  );
  return JSON.parse(out.trim().split("\n")[0]);
};

run("inbox", async () => {
  const [verb, account, ...args] = process.argv.slice(2);
  const usage =
    "usage: inbox.mjs up <ACCOUNT> --set triage|openLink|last|allRead|empty | down <ACCOUNT> | count <ACCOUNT> | drop <ACCOUNT> <TYPE> | unread <ACCOUNT> below|zero";
  if (!verb || !account) throw new Fail(usage, 2);
  const key = accountKey(account);
  const userId = subOf(account);

  if (verb === "up") {
    const o = options(args, { values: ["set"] });
    const sets = setsOf(seed());
    const chosen = sets[o.set];
    if (!chosen || o.rest.length) throw new Fail(usage, 2);
    const statements = [
      `delete from notifications where user_id = ${lit(userId)}`,
    ];
    if (chosen.rows.length) {
      const values = chosen.rows.map((row, i) => {
        const [targetType, targetId] = row.target ?? [null, null];
        return `(${lit(userId)}, ${lit(row.type)}, ${targetType ? lit(targetType) : "null"}, ${targetId ? lit(targetId) : "null"}, ${lit(JSON.stringify(row.params))}::jsonb, ${row.read ? "now()" : "null"}, now() - interval '${i + 1} minutes')`;
      });
      statements.push(
        `insert into notifications (user_id, type, target_type, target_id, params, read_at, created_at) values ${values.join(", ")}`
      );
    }
    if (chosen.bulk) {
      // old, read, with a course to open: they fill the second page and no more
      statements.push(
        `insert into notifications (user_id, type, target_type, target_id, params, read_at, created_at) select ${lit(userId)}, 'RECORDING_ADDED', 'COURSE', ${lit(seed().courses.open)}, '{}'::jsonb, now(), now() - (g * interval '1 hour') - interval '1 day' from generate_series(1, ${chosen.bulk}) g`
      );
    }
    await query(statements.join(";\n"));
    const now = await counts(userId);
    mkdirSync(resolve(LOCAL, "made"), { recursive: true });
    writeFileSync(KEEP(key), `${JSON.stringify({ set: o.set, ...now })}\n`);
    console.log(`ready: ${o.set} total=${now.total} unread=${now.unread}`);
  } else if (verb === "down") {
    if (args.length) throw new Fail(usage, 2);
    await query(`delete from notifications where user_id = ${lit(userId)}`);
    console.log("restored: none left");
  } else if (verb === "count") {
    if (args.length) throw new Fail(usage, 2);
    const now = await counts(userId);
    console.log(`inbox ${key} total=${now.total} unread=${now.unread}`);
  } else if (verb === "drop") {
    const [type, ...rest] = args;
    if (!type || rest.length || !/^[A-Z][A-Z_]+$/.test(type))
      throw new Fail(usage, 2);
    const out = await query(
      `delete from notifications where user_id = ${lit(userId)} and type = ${lit(type)}`
    );
    console.log(
      `dropped ${JSON.parse(out.trim().split("\n")[0]).rows} ${type}`
    );
  } else if (verb === "unread") {
    const [which, ...rest] = args;
    if (rest.length || !["below", "zero"].includes(which))
      throw new Fail(usage, 2);
    const now = await counts(userId);
    if (which === "zero") {
      if (now.unread !== 0)
        throw new Fail(`${key} still has ${now.unread} unread`);
      console.log("unread zero");
    } else {
      let before;
      try {
        before = JSON.parse(readFileSync(KEEP(key), "utf8"));
      } catch {
        throw new Fail(`no ${KEEP(key)}: run up first`);
      }
      if (!(now.unread < before.unread))
        throw new Fail(
          `${key} has ${now.unread} unread, as many as the set made (${before.unread})`
        );
      console.log(`unread fell (${before.unread} to ${now.unread})`);
    }
  } else {
    throw new Fail(usage, 2);
  }
});
