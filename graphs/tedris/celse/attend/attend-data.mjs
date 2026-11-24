// Makes what tedris.celse.attend needs and the seed has not got, and takes it away again (the flow's setup and teardown): a published
// course of its own in the second köşk with the celses of every standing the page draws, and the walk's talebe holding a seat in it.
//
//   node ../tedris/celse/attend/attend-data.mjs up     the course, its celses, applicantE's seat; writes graphs/.local/attend-celse.json
//   node ../tedris/celse/attend/attend-data.mjs down   the course and everything under it is deleted (applicantE's mailbox is the binding's teardown: mail.mjs)
//
// Why a course of its own. The page reads the clock: "within ten minutes of the start", "running", "over" are minutes, not days, and
// the seed's celses are fixed in time (Tue and Thu 21:00, Mon and Wed 20:30), so none is ever near its start while a walk runs. Every
// celse here is placed from now: `up` is run in each scenario's `setup`, so the times are those of that walk. The seeded courses are
// other flows' data and are never touched. The title of the course is the only thing `up` and `down` look it up by.
//
// What `up` makes (all through the API; W1 holds the first eight and the exam batch adds the ninth to it):
//   opening          "Yaklaşan celse"            starts in 8 min, 90 min long, a meeting link (host meet.example.test), an agenda of three
//                                                steps, a kaynak "Mizan, sayfa 12" and one resource of its own: the join window is open
//   live             "Başlamış celse"            started 12 min ago, 90 min long, a link, an agenda whose second step (+10 min) is the one now
//   ahead            "Sonraki celse"             in 2 days, a link: the join window is closed
//   noLink           "Bağlantısız celse"         in 2 days and 2 hours, no link, no stream, not in person: "Toplantı bağlantısı henüz eklenmedi."
//   inPerson         "Yüz yüze celse"            in 3 days, no link, the celse's own in-person mark
//   over             "Biten celse"               ended 2 hours ago, no link, no recording
//   liveStream       "Yayınlı celse"             started 15 min ago, a link and a YouTube stream: the stream card with the link beside it
//   inPersonStream   "Yüz yüze yayınlı celse"    started 10 min ago, in person, a stream and no link: the stream card of a celse held face to face
//   exam             "Sınav celsesi"             in 4 days, an exam with a place (the batch marks a celse with a place in person)
// The course takes anyone (no approval), so applicantE's seat is ENROLLED at once; it is made AFTER the celses, so nobody is told of them.
// The agenda's times are on the course's clock (Europe/Istanbul), as the page reads them. The stream is set by the hoca
// (PUT /lessons/{id}/live-stream). `up` and `down` are idempotent. Prints `attend-data <mode> <what was done>`. Nothing secret is printed.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { query } from "../../../bindings/helpers/db.mjs";
import {
  accountKey,
  Fail,
  LOCAL,
  must,
  nameOf,
  run,
  seed,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const TITLE = "Celse sayfası denemesi";
const FILE = resolve(LOCAL, "attend-celse.json");
const TALEBE = "applicantE";
const MIN = 60_000;
const ZONE = "Europe/Istanbul";
const MEETING = "https://meet.example.test/";
const STREAM = "https://www.youtube.com/watch?v=Ab3dEfGh1jK";

const at = (minutes) => new Date(Date.now() + minutes * MIN).toISOString();

// "21:05" on the course's clock for an instant, the form an agenda step takes
const clock = (iso) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));

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

const up = async () => {
  await remove();
  const step = (start, offset, title) => ({
    time: clock(new Date(Date.parse(start) + offset * MIN).toISOString()),
    title,
  });
  const openingAt = at(8);
  const liveAt = at(-12);
  const created = (
    await must("koskNazim", "POST", `/kosks/${seed().kosk2}/courses`, {
      title: TITLE,
      description:
        "Celse sayfasını her durumunda görmek için yazılmış deneme dersi.",
      status: "PUBLISHED",
      requiresApproval: false,
      muderris: [{ userId: subOf("muderris"), name: await nameOf("muderris") }],
      weeks: [
        {
          weekNumber: 1,
          title: "Bugün",
          lessons: [
            {
              title: "Yaklaşan celse",
              type: "LIVE",
              durationMinutes: 90,
              scheduledAt: openingAt,
              meetingUrl: `${MEETING}yaklasan`,
              kaynak: "Mizan, sayfa 12",
              agenda: [
                step(openingAt, 0, "Giriş ve yoklama"),
                step(openingAt, 20, "Metnin okunması"),
                step(openingAt, 60, "Sorular"),
              ],
              resources: [
                {
                  name: "Ders notları",
                  url: "https://example.test/ders-notlari",
                },
              ],
            },
            {
              title: "Başlamış celse",
              type: "LIVE",
              durationMinutes: 90,
              scheduledAt: liveAt,
              meetingUrl: `${MEETING}baslamis`,
              agenda: [
                step(liveAt, 0, "Giriş ve yoklama"),
                step(liveAt, 10, "Metnin okunması"),
                step(liveAt, 50, "Sorular"),
              ],
            },
            {
              title: "Yayınlı celse",
              type: "LIVE",
              durationMinutes: 90,
              scheduledAt: at(-15),
              meetingUrl: `${MEETING}yayinli`,
            },
            {
              title: "Yüz yüze yayınlı celse",
              type: "LIVE",
              durationMinutes: 90,
              scheduledAt: at(-10),
              inPersonOverride: true,
            },
            {
              title: "Biten celse",
              type: "LIVE",
              durationMinutes: 60,
              scheduledAt: at(-180),
            },
            {
              title: "Sonraki celse",
              type: "LIVE",
              durationMinutes: 60,
              scheduledAt: at(2 * 1440),
              meetingUrl: `${MEETING}sonraki`,
            },
            {
              title: "Bağlantısız celse",
              type: "LIVE",
              durationMinutes: 60,
              scheduledAt: at(2 * 1440 + 120),
            },
            {
              title: "Yüz yüze celse",
              type: "LIVE",
              durationMinutes: 60,
              scheduledAt: at(3 * 1440),
              inPersonOverride: true,
            },
          ],
        },
      ],
    })
  ).body;
  const course = (await must("koskNazim", "GET", `/courses/${created.id}`))
    .body;
  const lesson = (title) => {
    const found = course.weeks
      .flatMap((w) => w.lessons)
      .find((l) => l.title === title);
    if (!found) throw new Fail(`the course has no celse called ${title}`);
    return found;
  };
  const ids = {
    opening: lesson("Yaklaşan celse").id,
    live: lesson("Başlamış celse").id,
    liveStream: lesson("Yayınlı celse").id,
    inPersonStream: lesson("Yüz yüze yayınlı celse").id,
    over: lesson("Biten celse").id,
    ahead: lesson("Sonraki celse").id,
    noLink: lesson("Bağlantısız celse").id,
    inPerson: lesson("Yüz yüze celse").id,
  };

  // the stream is the hoca's to set, on the two celses that have one
  for (const id of [ids.liveStream, ids.inPersonStream])
    await must("muderris", "PUT", `/lessons/${id}/live-stream`, {
      liveStreamUrl: STREAM,
    });

  // the exam: one celse four days ahead at 18:00 in Istanbul, with a place, so the batch marks it in person
  const day = new Date(Date.now() + 4 * 1440 * MIN);
  const local = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(day);
  const weekday = new Date(`${local}T12:00:00Z`).getUTCDay() || 7;
  const batch = (
    await must("koskNazim", "POST", `/courses/${created.id}/sessions/batch`, {
      weekdays: [weekday],
      startTime: "18:00",
      startDate: local,
      count: 1,
      title: "Sınav celsesi",
      durationMinutes: 60,
      exam: {
        format: "WRITTEN",
        maxScore: 100,
        topics: "Mâzî ve muzârî çekimleri; ikinci bâbın ezberi.",
        location: "Medrese binası, zemin kat",
      },
    })
  ).body;
  ids.exam = batch.lessons?.[0]?.id;
  if (!ids.exam) throw new Fail("the exam batch made no celse");

  // the seat comes after the celses, so no invitation names them one by one
  await must(TALEBE, "POST", `/courses/${created.id}/enroll`);

  mkdirSync(LOCAL, { recursive: true });
  writeFileSync(
    FILE,
    `${JSON.stringify({ course: created.id, title: TITLE, ...ids })}\n`,
    { mode: 0o600 }
  );
  return `course ${created.id}, ${Object.keys(ids).length} celses, ${accountKey(TALEBE)} seated`;
};

run("attend-data", async () => {
  const [mode, ...more] = process.argv.slice(2);
  if (!["up", "down"].includes(mode) || more.length)
    throw new Fail("usage: attend-data.mjs up | down", 2);
  const done =
    mode === "up" ? await up() : `${await remove()} course(s) removed`;
  console.log(`attend-data ${mode} ${done}`);
});
