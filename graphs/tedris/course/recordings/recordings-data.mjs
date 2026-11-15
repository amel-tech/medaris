// Makes what tedris.course.recordings needs and the seed has not got, and takes it away again (the flow's setup and teardown):
// a published course of its own in the second köşk, with six celses and five recordings of the kinds the tab draws, and the walk's
// talebe holding a seat in it.
//
//   node ../tedris/course/recordings/recordings-data.mjs up [--seat]   the course and its recordings (with --seat, applicantA's seat too); writes graphs/.local/course-recordings.json
//   node ../tedris/course/recordings/recordings-data.mjs down          the course and everything under it is deleted, the köşk's switch put back off (applicantA's mailbox and notifications are the binding's teardown: mail.mjs, notify.mjs)
//   node ../tedris/course/recordings/recordings-data.mjs kosk on|off  the köşk's own switch "Ders kayıtları herkese açılamaz" (recordingsNeverPublic)
//   node ../tedris/course/recordings/recordings-data.mjs list <ACCOUNT|visitor>   what GET /courses/:id/recordings answers that person: `<who> <n> rows: <titles>` (a visitor sends no token)
//
// Why a course of its own. The seeded courses are other flows' data (a recording on one of their celses changes what the visitor
// and the celse flows read), and a recording tells every enrolled talebe ("Kayıt eklendi", RECORDING_ADDED), which would leave a
// trace in the seeded talebe's notifications. The course lives in the second köşk, "Kubbealtı Köşkü", and its title is the only
// thing `up` and `down` look it up by. The recordings are written BEFORE applicantA takes the seat, so nobody is told of them.
//
// What `up` makes (the weeks are listed newest first by the tab, so W3 is on top):
//   W3 "Tekrar"     L5 "Tekrar celsesi"   2 days ago   recording ENROLLED, a Google Drive link          -> a seat's row, host chip "Google Drive"
//   W2 "Okuma"      L4 "Üçüncü okuma"     5 days ago   recording PUBLIC, set to PROCESSING by SQL        -> "Hazırlanıyor" for everyone
//                   L3 "İkinci okuma"     7 days ago   recording PUBLIC, READY, released in 3 days       -> held back: "Ders kaydı ... açılır."
//   W1 "Giriş"      L2 "Birinci okuma"    12 days ago  recording ENROLLED, a YouTube link               -> a seat's row
//                   L1 "Tanışma"          14 days ago  recording PUBLIC, a YouTube link                 -> a seat's row and a visitor's row, "Herkese açık"
//   W3              L6 "Ezber celsesi"    in 4 days    no recording
// A seat sees 5 rows, a person with no seat 3 (the public ones). The week titles are not plain ("Hafta 1" alone would be printed once).
//
// What is made with the API and what is not: the köşk's nazım makes the course (POST /kosks/{id}/courses, naming the `muderris` account as
// the hoca), the hoca adds the five recordings (POST /lessons/{id}/recordings, which is READY at once), applicantA takes the seat
// (POST /courses/{id}/enroll, the course takes anyone), the başnazım deletes the course. The ONE thing SQL does is the PROCESSING row:
// a pasted link is READY at once and a PROCESSING one is what an upload in progress is (Bunny, which the stack lacks), so the row is
// the one the API writes with its link taken away and its status put back, which the table's check allows for a link that is not
// Bunny (apps/tedrisat/src/database/schema/course.schema.ts, lesson_recordings_provider_columns).
// The ids are in graphs/.local/course-recordings.json, read by the binding as {recs.course}, {recs.l1} and so on.
// `up` and `down` are idempotent. Prints `recordings-data <mode> <what was done>`. Nothing secret is printed.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { query } from "../../../bindings/helpers/db.mjs";
import {
  API,
  accountKey,
  Fail,
  LOCAL,
  must,
  nameOf,
  run,
  seed,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const TITLE = "Ders kaydı listesi denemesi";
const FILE = resolve(LOCAL, "course-recordings.json");
const TALEBE = "applicantA";
const DAY = 86_400_000;

// An instant `days` from now at 18:00 UTC (21:00 in Istanbul), the hour the seed's own celses have.
const at = (days) => {
  const d = new Date(Date.now() + days * DAY);
  d.setUTCHours(18, 0, 0, 0);
  return d.toISOString();
};

const sample = (v) => `'${String(v).replaceAll("'", "''")}'`;

const idsOf = async () => {
  const out = await query(
    `select id from courses where title = ${sample(TITLE)} and kosk_id = ${sample(seed().kosk2)}`
  );
  return out
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l).id);
};

const remove = async () => {
  const ids = await idsOf();
  for (const id of ids)
    await must("systemAdmin", "DELETE", `/courses/${id}`, undefined, [404]);
  return ids.length;
};

const up = async (seat) => {
  await remove();
  const week = (n, title, lessons) => ({ weekNumber: n, title, lessons });
  const lesson = (title, days) => ({
    title,
    type: "LIVE",
    durationMinutes: 60,
    scheduledAt: at(days),
  });
  const created = (
    await must("koskNazim", "POST", `/kosks/${seed().kosk2}/courses`, {
      title: TITLE,
      description:
        "Ders kayıtları sekmesini görmek için yazılmış deneme dersi.",
      status: "PUBLISHED",
      requiresApproval: false,
      muderris: [{ userId: subOf("muderris"), name: await nameOf("muderris") }],
      weeks: [
        week(1, "Giriş", [
          lesson("Tanışma", -14),
          lesson("Birinci okuma", -12),
        ]),
        week(2, "Okuma", [
          lesson("İkinci okuma", -7),
          lesson("Üçüncü okuma", -5),
        ]),
        week(3, "Tekrar", [
          lesson("Tekrar celsesi", -2),
          lesson("Ezber celsesi", 4),
        ]),
      ],
    })
  ).body;
  const course = (await must("koskNazim", "GET", `/courses/${created.id}`))
    .body;
  const byTitle = (t) => {
    const found = course.weeks
      .flatMap((w) => w.lessons)
      .find((l) => l.title === t);
    if (!found) throw new Fail(`the course has no celse called ${t}`);
    return found;
  };
  const [l1, l2, l3, l4, l5, l6] = [
    "Tanışma",
    "Birinci okuma",
    "İkinci okuma",
    "Üçüncü okuma",
    "Tekrar celsesi",
    "Ezber celsesi",
  ].map(byTitle);

  const record = (lesson, body) =>
    must("muderris", "POST", `/lessons/${lesson.id}/recordings`, body);
  await record(l1, {
    title: "Tanışma celsesi kaydı",
    url: "https://www.youtube.com/watch?v=Ab3dEfGh1jK",
    visibility: "PUBLIC",
  });
  await record(l2, {
    title: "Birinci okuma kaydı",
    url: "https://www.youtube.com/watch?v=Cd4eFgHi2kL",
    visibility: "ENROLLED",
  });
  await record(l3, {
    title: "İkinci okuma kaydı",
    url: "https://www.youtube.com/watch?v=Ef5gHiJk3lM",
    visibility: "PUBLIC",
    availableAt: at(3),
  });
  await record(l4, {
    title: "Üçüncü okuma kaydı",
    url: "https://www.youtube.com/watch?v=Gh6iJkLm4nO",
    visibility: "PUBLIC",
  });
  await record(l5, {
    title: "Tekrar celsesi kaydı",
    url: "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQr/view",
    visibility: "ENROLLED",
  });
  await query(
    `update lesson_recordings set status = 'PROCESSING', url = null where lesson_id = ${sample(l4.id)}`
  );

  // the seat comes after the recordings, so no "Kayıt eklendi" is sent to it
  if (seat) await must(TALEBE, "POST", `/courses/${created.id}/enroll`);

  mkdirSync(LOCAL, { recursive: true });
  writeFileSync(
    FILE,
    `${JSON.stringify({
      course: created.id,
      title: TITLE,
      l1: l1.id,
      l2: l2.id,
      l3: l3.id,
      l4: l4.id,
      l5: l5.id,
      l6: l6.id,
    })}\n`,
    { mode: 0o600 }
  );
  return `course ${created.id}, 5 recordings${seat ? `, ${accountKey(TALEBE)} seated` : ""}`;
};

const kosk = async (on) => {
  await must(
    "koskNazim",
    "PATCH",
    `/kosks/${seed().kosk2}`,
    { recordingsNeverPublic: on },
    []
  );
  return on ? "recordingsNeverPublic on" : "recordingsNeverPublic off";
};

// What the API answers one person, the way the page reads it: a person with no token (`visitor`) or an account's own.
const list = async (who) => {
  const [id] = await idsOf();
  if (!id) throw new Fail("no course: run up first");
  const read =
    who === "visitor"
      ? await fetch(`${API}/courses/${id}/recordings`).then(async (r) => ({
          status: r.status,
          body: await r.json().catch(() => undefined),
        }))
      : await must(who, "GET", `/courses/${id}/recordings`);
  if (!Array.isArray(read.body))
    throw new Fail(`GET /courses/${id}/recordings answered ${read.status}`);
  return `${who} ${read.body.length} rows: ${read.body.map((r) => r.title).join(" | ")}`;
};

run("recordings-data", async () => {
  const [mode, ...args] = process.argv.slice(2);
  const usage =
    "usage: recordings-data.mjs up [--seat] | down | kosk on|off | list <ACCOUNT|visitor>";
  let done;
  if (mode === "up" && args.every((a) => a === "--seat") && args.length <= 1)
    done = await up(args.length === 1);
  else if (mode === "down" && args.length === 0) {
    const n = await remove();
    await kosk(false).catch(() => {});
    done = `${n} course(s) removed`;
  } else if (
    mode === "kosk" &&
    ["on", "off"].includes(args[0]) &&
    args.length === 1
  )
    done = await kosk(args[0] === "on");
  else if (mode === "list" && args.length === 1) done = await list(args[0]);
  else throw new Fail(usage, 2);
  console.log(`recordings-data ${mode} ${done}`);
});
