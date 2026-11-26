// What tedris.celse.watchRecording needs on top of a course of its own: a recording on each of the six celses of the course that
// `helpers/course.mjs make watchrec` made, of the kinds the watch page tells apart. The course itself, its seat for a talebe and its
// removal are the shared helper's (the binding's setup and teardown run it); this script only adds the recordings, and reads them.
//
//   node ../tedris/celse/watchRecording/watch-recording-data.mjs recordings   adds the six recordings to made/watchrec.json's course; writes graphs/.local/watch-recording.json
//   node ../tedris/celse/watchRecording/watch-recording-data.mjs page <ACCOUNT|visitor> <l1..l6>   what GET /courses/:id/sessions/:id tells that person about the celse's recording
//
// The course is made with `--weeks 2 --lessons 3 --start -14`, so its six celses are over, 14, 12, 10, 7, 5 and 3 days ago at 21:00
// (Istanbul), and takes anyone. The seat of the walk's talebe is taken AFTER `recordings`, so nobody is told "Kayıt eklendi"
// (RECORDING_ADDED goes to every enrolled seat when a recording opens).
//
//   L1  14 days ago  recording ENROLLED, a YouTube link, released                       -> plays in a YouTube frame (the main story)
//   L2  12 days ago  recording PUBLIC, a link at a host that cannot be framed (OTHER)   -> no frame: the placeholder and "Ders kaydını aç"
//   L3  10 days ago  recording ENROLLED, a YouTube link, release time 3 days AHEAD      -> held: a talebe is given no link, the course team plays it
//   L4   7 days ago  recording PUBLIC, a YouTube link put back to PROCESSING by SQL     -> being prepared: no link for anyone
//   L5   5 days ago  recording ENROLLED, READY, a BUNNY row written by SQL              -> what a Bunny recording is when tedrisat has no Bunny keys (this stack): no link
//   L6   3 days ago  a sample celse (is_preview, by SQL), recording PUBLIC, released    -> the one recording a person with no seat is sent
// No celse has a stream link (a stream link is tedris.celse.watchStream's).
//
// What is made with the API and what is not: the hoca adds the recordings (POST /lessons/{id}/recordings, READY at once, with the release time
// of L3 in the same call). SQL does three things only: the PROCESSING row (a pasted link is READY at once and a PROCESSING one is what an upload
// in progress is, which needs Bunny), the BUNNY row (a pasted Bunny link is refused while no library is configured, bunny-foreign-library, so
// the row is the one the API would write with a made-up video id, as e2e lesson-writing-seed.ts does) and the sample mark of L6 (no route
// sets it on a celse that exists but the whole-course save).
// `recordings` is idempotent: it takes the six recordings away first. Prints `watch-recording-data <mode> <what was done>`. Nothing secret.
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { query } from "../../../bindings/helpers/db.mjs";
import { API, Fail, LOCAL, must, run } from "../../../bindings/helpers/lib.mjs";

const TAG = "watchrec";
const MADE = resolve(LOCAL, "made", `${TAG}.json`);
const FILE = resolve(LOCAL, "watch-recording.json");
const DAY = 86_400_000;

const at = (days) => {
  const d = new Date(Date.now() + days * DAY);
  d.setUTCHours(18, 0, 0, 0);
  return d.toISOString();
};
const sample = (v) => `'${String(v).replaceAll("'", "''")}'`;

const made = () => {
  if (!existsSync(MADE))
    throw new Fail(
      `${MADE} does not exist: run helpers/course.mjs make ${TAG} first`
    );
  const m = JSON.parse(readFileSync(MADE, "utf8"));
  if ((m.lessons ?? []).length !== 6)
    throw new Fail(
      `the course ${TAG} has ${(m.lessons ?? []).length} celses, six are needed (--weeks 2 --lessons 3)`
    );
  return m;
};

const recordings = async () => {
  const m = made();
  const [l1, l2, l3, l4, l5, l6] = m.lessons;
  await query(
    `delete from lesson_recordings where lesson_id in (${m.lessons.map(sample).join(", ")})`
  );
  const record = (lesson, body) =>
    must("muderris", "POST", `/lessons/${lesson}/recordings`, body);
  await record(l1, {
    title: "Birinci okuma kaydı",
    url: "https://www.youtube.com/watch?v=Ab3dEfGh1jK",
    visibility: "ENROLLED",
  });
  await record(l2, {
    title: "İkinci okuma kaydı",
    url: "https://video.example.test/dersler/ikinci-okuma",
    visibility: "PUBLIC",
  });
  await record(l3, {
    title: "Üçüncü okuma kaydı",
    url: "https://www.youtube.com/watch?v=Cd4eFgHi2kL",
    visibility: "ENROLLED",
    availableAt: at(3),
  });
  await record(l4, {
    title: "Dördüncü okuma kaydı",
    url: "https://www.youtube.com/watch?v=Ef5gHiJk3lM",
    visibility: "PUBLIC",
  });
  await query(
    `update lesson_recordings set status = 'PROCESSING', url = null where lesson_id = ${sample(l4)}`
  );
  await query(
    `insert into lesson_recordings(lesson_id, title, provider, url, bunny_video_id, upload_expires_at, duration_minutes, recorded_at, visibility, status)
     values (${sample(l5)}, 'Beşinci okuma kaydı', 'BUNNY', null, ${sample(randomUUID())}, now(), 60, now() - interval '5 days', 'ENROLLED', 'READY')`
  );
  await record(l6, {
    title: "Altıncı okuma kaydı",
    url: "https://www.youtube.com/watch?v=Gh6iJkLm4nO",
    visibility: "PUBLIC",
  });
  await query(`update lessons set is_preview = true where id = ${sample(l6)}`);
  mkdirSync(LOCAL, { recursive: true });
  writeFileSync(
    FILE,
    `${JSON.stringify({ course: m.course, title: m.title, l1, l2, l3, l4, l5, l6 })}\n`,
    { mode: 0o600 }
  );
  return `6 recordings on course ${m.course}`;
};

// what the celse's own read says about its recording to one person, the way the page reads it
const page = async (who, which) => {
  const file = JSON.parse(readFileSync(FILE, "utf8"));
  const lesson = file[which];
  if (!lesson) throw new Fail(`no celse ${which}`, 2);
  const path = `/courses/${file.course}/sessions/${lesson}`;
  const read =
    who === "visitor"
      ? await fetch(`${API}${path}`).then(async (r) => ({
          status: r.status,
          body: await r.json().catch(() => undefined),
        }))
      : await must(who, "GET", path);
  const rec = read.body?.recording;
  return `${who} ${which} ${rec ? rec.status : "no-recording"} url=${rec?.url ? "yes" : "no"} availableAt=${rec?.availableAt ? "yes" : "no"} locked=${read.body?.contentLocked ? "yes" : "no"}`;
};

run("watch-recording-data", async () => {
  const [mode, ...args] = process.argv.slice(2);
  let done;
  if (mode === "recordings" && args.length === 0) done = await recordings();
  else if (mode === "page" && args.length === 2) done = await page(...args);
  else
    throw new Fail(
      "usage: watch-recording-data.mjs recordings | page <ACCOUNT|visitor> <l1..l6>",
      2
    );
  console.log(`watch-recording-data ${mode} ${done}`);
});
