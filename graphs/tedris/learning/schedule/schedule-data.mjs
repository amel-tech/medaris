// Gives a spare talebe two weeks of celses that show every look a Programım row has, and takes it away again
// (tedris.learning.schedule's setup and teardown, scenario `mixed`).
//
//   node ../tedris/learning/schedule/schedule-data.mjs up   <ACCOUNT>   a köşk and a course of the walk's own, fourteen celses, a seat
//   node ../tedris/learning/schedule/schedule-data.mjs down <ACCOUNT>   the way back: the seat, the celses, the course, the köşk
//
// Why a course of its own. The seeded courses hold only celses that are still ahead, no walk may change them (other walks read
// them), and a cancelled celse cannot be taken back through tedrisat. The e2e (apps/tedris/e2e/schedule-seed.ts) makes its celses
// for the same reason.
//
// Why SQL, when tedrisat's API could make it (tedris.course.readProgramme's programme-data.mjs does, in the second köşk): the rows
// here are written into a private köşk with no müderris and no medrese, which no list of any app shows, so the walk cannot disturb
// a count another walk reads (Keşfet's köşks, Hesap's roles, a course list), and it can put a celse on air now and one already over
// in today's window, which a course made through the API at a fixed clock cannot do on every run.
// Everything made has a fixed id of the form 5c4ed000-0000-4000-8000-0000000000NN, so `down` finds it again whatever happened to
// the walk, and `up` begins with `down`.
//
// The celses, in Istanbul days from today (d+N), one course, "Hafta 3". The first window (d+0 to d+6) holds the first two and the
// six kinds of the next list; the second window (d+7 to d+13) holds the six kinds again, a week later (no celse can be over or on
// air in a window that begins after today):
//   ended      d+0 00:01, 5 min, no link          "Sona erdi" (over once the clock is past 00:06; before that it is on air)
//   live       now - 5 min, 90 min, a Zoom link   "Şu an canlı", the Zoom chip and the link "Celseye katıl"
//   ahead      d+1 21:00, 60 min, a Zoom link     "Planlandı", the Zoom chip, the calendar button
//   cancelled  d+2 20:00, 45 min, a note          "İptal edildi" and "Hocanın notu: ...", its make-up is the next celse
//   makeup     d+3 21:00, 45 min, no link         "Planlandı", "Toplantı bağlantısı henüz eklenmedi."
//   exam       d+4 21:00, 60 min, an exam row     "Sınav · 4 gün kaldı" above the no-link sentence
//   inPerson   d+5 18:00, 60 min, in person       "Bu celse yüz yüze yapılır. ..."
//   bare       d+6 18:00, 30 min, no note         "İptal edildi" and "Bu celse iptal edildi."
// Both commands are idempotent. Prints `schedule-data <up|down> <ACCOUNT> <what was done>`. Nothing secret is printed.
import { query } from "../../../bindings/helpers/db.mjs";
import {
  accountKey,
  Fail,
  run,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const id = (n) =>
  `5c4ed000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const KOSK = id(1);
const COURSE = id(2);
const WEEK = id(3);
const ZOOM = "https://zoom.us/j/246813579";

// `day` days from today at `time`, Istanbul, as a timestamptz
const at = (day, time) =>
  `((date_trunc('day', now() at time zone 'Europe/Istanbul') + interval '${day} days ${time}') at time zone 'Europe/Istanbul')`;

// the kinds of one window, with their offsets from the window's first day
const KINDS = [
  {
    key: "ahead",
    title: "Yaklaşan celse",
    day: 1,
    time: "21 hours",
    minutes: 60,
    url: ZOOM,
  },
  {
    key: "cancelled",
    title: "İptal edilen celse",
    day: 2,
    time: "20 hours",
    minutes: 45,
  },
  {
    key: "makeup",
    title: "Telafi celsesi",
    day: 3,
    time: "21 hours",
    minutes: 45,
  },
  { key: "exam", title: "Yazılı sınav", day: 4, time: "21 hours", minutes: 60 },
  {
    key: "inPerson",
    title: "Yüz yüze celse",
    day: 5,
    time: "18 hours",
    minutes: 60,
  },
  {
    key: "bare",
    title: "Notsuz iptal edilen celse",
    day: 6,
    time: "18 hours",
    minutes: 30,
  },
];
const WINDOWS = [
  { first: 0, base: 21 },
  { first: 7, base: 31 },
];
const lessonId = (w, kind) =>
  id(w.base + KINDS.findIndex((k) => k.key === kind));
const ALL = [
  id(11),
  id(12),
  ...WINDOWS.flatMap((w) => KINDS.map((k) => lessonId(w, k.key))),
];

const removeAll = `
  delete from enrollments where course_id = '${COURSE}';
  delete from lesson_exams where lesson_id in (select id from lessons where week_id = '${WEEK}');
  update lessons set replacement_lesson_id = null where week_id = '${WEEK}';
  delete from lessons where week_id = '${WEEK}';
  delete from course_weeks where id = '${WEEK}';
  delete from courses where id = '${COURSE}';
  delete from kosks where id = '${KOSK}'`;

const insert = (lid, order, title, when, minutes, url, extra = {}) =>
  `insert into lessons(id, week_id, title, type, order_index, duration_minutes, scheduled_at, meeting_url, in_person)
   values ('${lid}', '${WEEK}', '${title}', 'LIVE', ${order}, ${minutes}, ${when}, ${url ? `'${url}'` : "null"}, ${extra.inPerson ? "true" : "null"})`;

run("schedule-data", async () => {
  const [mode, account, ...more] = process.argv.slice(2);
  if (!["up", "down"].includes(mode) || !account || more.length)
    throw new Fail("usage: schedule-data.mjs up|down <ACCOUNT>", 2);
  const key = accountKey(account);
  const user = subOf(account);

  if (mode === "down") {
    await query(removeAll);
    console.log(
      `schedule-data down ${key} seat, fourteen celses, course and köşk removed`
    );
    return;
  }

  const statements = [
    removeAll,
    `insert into kosks(id, owner_id, name, handle, is_private) values ('${KOSK}', '${user}', 'Programım Deneme Köşkü', 'programim-deneme', true)`,
    `insert into courses(id, kosk_id, author_id, title, status) values ('${COURSE}', '${KOSK}', '${user}', 'Programım Deneme Dersi', 'PUBLISHED')`,
    `insert into course_weeks(id, course_id, week_number, title, order_index) values ('${WEEK}', '${COURSE}', 3, 'Hafta', 0)`,
    insert(id(11), 0, "Biten celse", at(0, "1 minute"), 5, null),
    insert(
      id(12),
      1,
      "Sürmekte olan celse",
      "now() - interval '5 minutes'",
      90,
      ZOOM
    ),
  ];
  let order = 2;
  for (const w of WINDOWS)
    for (const k of KINDS)
      statements.push(
        insert(
          lessonId(w, k.key),
          order++,
          k.title,
          at(w.first + k.day, k.time),
          k.minutes,
          k.url,
          { inPerson: k.key === "inPerson" }
        )
      );
  for (const w of WINDOWS) {
    statements.push(
      `update lessons set cancelled_at = now(), cancel_reason = 'Hoca rahatsız; telafi aşağıda.', replacement_lesson_id = '${lessonId(w, "makeup")}' where id = '${lessonId(w, "cancelled")}'`,
      `update lessons set cancelled_at = now() where id = '${lessonId(w, "bare")}'`,
      `insert into lesson_exams(lesson_id) values ('${lessonId(w, "exam")}')`
    );
  }
  statements.push(
    `insert into enrollments(user_id, course_id, status) values ('${user}', '${COURSE}', 'ENROLLED')`
  );
  await query(statements.join(";\n"));
  console.log(
    `schedule-data up ${key} a seat in a course with ${ALL.length} celses`
  );
});
