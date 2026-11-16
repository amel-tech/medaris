// What tedris.account.notifications needs: the notifications of one spare talebe, `applicantH`, written as tedrisat's producers write them.
// tedrisat has no route that makes a notification (a notification is the side effect of what somebody else does: NotificationService.notify),
// so the rows are written with SQL, the same columns the producers fill (notification.repository.ts:38-46) and the same params they put in
// (course-notifier.ts:200-215, deck-review.service.ts:127-180, kosk-application-review.service.ts:180-210, ban.service.ts:399-407). The one
// thing a producer decides that a walk must decide too is `created_at`: the page groups by calendar day in the viewer's zone, so the rows
// are placed at "today", "yesterday noon" and "N days ago noon" in Europe/Istanbul, whatever the hour the walk runs at.
//
//   node ../tedris/account/notifications/notifications-data.mjs up <variant> --course <id> --lesson <id> --deck <id> --kosk <id>
//   node ../tedris/account/notifications/notifications-data.mjs down      every notification of applicantH is deleted
//   node ../tedris/account/notifications/notifications-data.mjs gone      the same, for the walk that makes a mark be refused: the page was
//                                                                         drawn from rows that are gone (POST /notifications/<id>/read answers 404)
//   node ../tedris/account/notifications/notifications-data.mjs count     one line: how many rows applicantH has, and how many are unread
//   node ../tedris/account/notifications/notifications-data.mjs sql <variant> ...   prints the SQL `up` would run and runs nothing
//
// Variants (each starts by deleting applicantH's rows, so `up` is idempotent and a walk that died leaves nothing in the way):
//   triage   seven rows, six unread and one read, in the three day groups, each of the five kinds of target:
//              today       ENROLLMENT_APPROVED  (course)  "Başvurun onaylandı"        unread
//              today       SESSION_CANCELLED    (celse)   "Celse iptal edildi"        unread, with a make-up time and the hoca's note
//              yesterday   DECK_PUBLISH_RESULT  (deck)    "Deste yayınlandı"          unread
//              yesterday   KOSK_APPLICATION_RESULT (no target)  "Köşk başvurun reddedildi"  unread, with a reason: plain text, only its menu
//              earlier     ENROLLMENT_REJECTED  (course)  "Başvurun reddedildi"       unread, with a reason
//              earlier     KOSK_BAN_PLACED      (köşk)    "Bildirim", no sentence     unread: a type tedris has no words for (ACC-06)
//              earlier     EXAM_SCHEDULED       (celse)   "Sınav planlandı"           read
//   one      two rows, one unread (ENROLLMENT_APPROVED, today) and one read (EXAM_SCHEDULED, yesterday): marking the one leaves nothing
//   allRead  three rows, all read, in the three groups
//   long     twenty-five unread rows, ENROLLMENT_APPROVED, a minute apart: the first page holds twenty and "Daha fazla göster" reads five
//   empty    no row at all
// The targets are the seed's own ids, only read: a course, one of its celses, a deck and a köşk of the seed (the notification is applicantH's
// row; the course, the celse, the deck and the köşk are not touched). The names in the params are invented.
// A walk that starts in the first minutes after midnight in Istanbul has its "today" rows clamped to the first seconds of the day, which
// keeps them in Bugün and in order. Run by hand only under the replay lock. Prints `notifications-data <mode> ...`. Nothing secret is printed.
import { query } from "../../../bindings/helpers/db.mjs";
import {
  accountKey,
  Fail,
  options,
  run,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const TALEBE = "applicantH";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

// "today" and "a day at noon" in Istanbul, as timestamptz; every value is cut to the millisecond, because the list is paged on
// (created_at, id) and its cursor is a JavaScript Date
const START =
  "(date_trunc('day', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul')";
const ms = (expr) => `date_trunc('milliseconds', ${expr})`;
const today = (minutesAgo, rank) =>
  ms(
    `greatest(now() - interval '${minutesAgo} minutes', ${START} + interval '${rank} seconds')`
  );
const dayNoon = (daysAgo, rank) =>
  ms(
    `${START} - interval '${daysAgo} days' + interval '12 hours' + interval '${rank} minutes'`
  );

const usage =
  "usage: notifications-data.mjs up|sql <triage|one|allRead|long|empty> --course <id> --lesson <id> --deck <id> --kosk <id> | down | gone | count";

const row = (sub, type, at, { target, params = {}, read = false }) =>
  `(${lit(sub)}, ${lit(type)}, ${target ? lit(target[0]) : "null"}, ${target ? lit(target[1]) : "null"}, ${lit(JSON.stringify(params))}::jsonb, ${read ? `${at}` : "null"}, ${at})`;

const COLUMNS =
  "(user_id, type, target_type, target_id, params, read_at, created_at)";

const variantRows = (variant, sub, ids) => {
  const course = ["COURSE", ids.course];
  const celse = ["SESSION", ids.lesson];
  const deck = ["DECK", ids.deck];
  const kosk = ["KOSK", ids.kosk];
  const named = { courseTitle: "Örnek ders", source: "Örnek köşk" };
  const inCourse = { ...named, courseId: ids.course };
  switch (variant) {
    case "triage":
      return [
        row(sub, "ENROLLMENT_APPROVED", today(5, 20), {
          target: course,
          params: named,
        }),
        row(sub, "SESSION_CANCELLED", today(20, 10), {
          target: celse,
          params: {
            ...inCourse,
            sessionAt: "2026-11-18T18:00:00.000Z",
            makeupAt: "2026-11-21T18:00:00.000Z",
            reason: "Hoca hasta.",
          },
        }),
        row(sub, "DECK_PUBLISH_RESULT", dayNoon(1, 20), {
          target: deck,
          params: { outcome: "approved", deckTitle: "Örnek deste" },
        }),
        row(sub, "KOSK_APPLICATION_RESULT", dayNoon(1, 10), {
          params: {
            outcome: "rejected",
            koskName: "Örnek köşk",
            reason: "Başvuru eksik.",
          },
        }),
        row(sub, "ENROLLMENT_REJECTED", dayNoon(4, 20), {
          target: course,
          params: { ...named, reason: "Başvuru bilgileri eksikti." },
        }),
        row(sub, "KOSK_BAN_PLACED", dayNoon(5, 20), {
          target: kosk,
          params: { source: "Örnek köşk" },
        }),
        row(sub, "EXAM_SCHEDULED", dayNoon(6, 20), {
          target: celse,
          read: true,
          params: { ...inCourse, sessionAt: "2026-11-25T18:00:00.000Z" },
        }),
      ];
    case "one":
      return [
        row(sub, "ENROLLMENT_APPROVED", today(5, 20), {
          target: course,
          params: named,
        }),
        row(sub, "EXAM_SCHEDULED", dayNoon(1, 20), {
          target: celse,
          read: true,
          params: { ...inCourse, sessionAt: "2026-11-25T18:00:00.000Z" },
        }),
      ];
    case "allRead":
      return [
        row(sub, "ENROLLMENT_APPROVED", today(5, 20), {
          target: course,
          read: true,
          params: named,
        }),
        row(sub, "DECK_PUBLISH_RESULT", dayNoon(1, 20), {
          target: deck,
          read: true,
          params: { outcome: "approved", deckTitle: "Örnek deste" },
        }),
        row(sub, "SESSION_CANCELLED", dayNoon(4, 20), {
          target: celse,
          read: true,
          params: { ...inCourse, sessionAt: "2026-11-18T18:00:00.000Z" },
        }),
      ];
    default:
      return [];
  }
};

const counts = async (sub) => {
  const out = await query(
    `select count(*) filter (where read_at is null) as unread, count(*) as total from notifications where user_id = ${lit(sub)}`
  );
  const line = out.trim().split("\n").pop();
  const { unread, total } = JSON.parse(line);
  return `${unread} unread of ${total}`;
};

run("notifications-data", async () => {
  const [mode, ...args] = process.argv.slice(2);
  if (!mode) throw new Fail(usage, 2);
  const key = accountKey(TALEBE);
  const sub = subOf(TALEBE);

  if (mode === "down" || mode === "gone") {
    if (args.length) throw new Fail(usage, 2);
    await query(`delete from notifications where user_id = ${lit(sub)}`);
    console.log(`notifications-data ${mode} ${key} ${await counts(sub)}`);
    return;
  }
  if (mode === "count") {
    if (args.length) throw new Fail(usage, 2);
    console.log(`notifications-data count ${key} ${await counts(sub)}`);
    return;
  }
  if (mode !== "up" && mode !== "sql") throw new Fail(usage, 2);

  const [variant, ...rest] = args;
  if (!["triage", "one", "allRead", "long", "empty"].includes(variant))
    throw new Fail(usage, 2);
  const o = options(rest, { values: ["course", "lesson", "deck", "kosk"] });
  if (o.rest.length) throw new Fail(usage, 2);
  const ids = {};
  for (const name of ["course", "lesson", "deck", "kosk"]) {
    if (variant !== "empty" && !UUID.test(o[name] ?? ""))
      throw new Fail(`--${name} is not a uuid`, 2);
    ids[name] = o[name];
  }

  const sql = [`delete from notifications where user_id = ${lit(sub)}`];
  if (variant === "long") {
    // a minute apart and a second of rank apart, so that the order does not depend on the clock
    sql.push(
      `insert into notifications ${COLUMNS} select ${lit(sub)}, 'ENROLLMENT_APPROVED', 'COURSE', ${lit(ids.course)}, jsonb_build_object('courseTitle', 'Örnek ders ' || g, 'source', 'Örnek köşk'), null, ${ms(
        `greatest(now() - g * interval '1 minute', ${START} + (100 - g) * interval '1 second')`
      )} from generate_series(1, 25) g`
    );
  } else if (variant !== "empty") {
    sql.push(
      `insert into notifications ${COLUMNS} values ${variantRows(variant, sub, ids).join(", ")}`
    );
  }
  if (mode === "sql") {
    console.log(sql.join(";\n"));
    return;
  }
  await query(sql.join(";\n"));
  console.log(`notifications-data up ${variant} ${key} ${await counts(sub)}`);
});
