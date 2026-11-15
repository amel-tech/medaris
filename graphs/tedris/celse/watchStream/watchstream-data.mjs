// Makes what tedris.celse.watchStream needs and the seed has not got, and takes it away again (the flow's setup and teardown): a published
// course of its own in the second köşk with six celses, each in the state one page of the flow is about, and the walk's talebe holding a
// seat in it.
//
//   node ../tedris/celse/watchStream/watchstream-data.mjs up [--seat]   the course and its celses (with --seat, applicantA's seat too); writes graphs/.local/watch-stream.json
//   node ../tedris/celse/watchStream/watchstream-data.mjs show          prints the ids that `up` wrote
//   (the way back is the shared helper: `node helpers/course.mjs remove watchstream`, which has the talebe leave, deletes the course,
//    clears its notifications and the invitation mails; `up` writes the record graphs/.local/made/watchstream.json that it reads)
//
// Why not `course.mjs make` alone: its celses are at 21:00 on whole days, and this flow's celses must start at minutes from now (one
// that began 14 minutes ago, one that ended 10 minutes ago), carry stream links and recordings, and one link is replaced by SQL. So
// this helper opens the course itself, but in the shape course.mjs knows (title `Deneme dersi watchstream`, the made/ record), so the
// shared `remove` is the way back.
//
// Why a course of its own. A stream link on a seeded celse, and a recording on it, are what the celse flows read (attend, locked, the
// recordings tab): they must find the seed as it is. The course lives in the second köşk, "Kubbealtı Köşkü", and its title is the only thing
// `up` and `down` look it up by. The recordings are written BEFORE applicantA takes the seat, so nobody is told of them ("Kayıt eklendi").
//
// What `up` makes (all celses are LIVE lessons of one week; `at` is minutes from now):
//   live      "Yayın celsesi"             started 14 min ago, 60 min long   the link of the stream is set -> the watch page with the stream, the chat and the notes
//   ahead     "Yarınki yayın"             starts in 26 h                    a link is set, the celse has not begun -> tedrisat sends none, /izle goes back to the celse page
//   recorded  "Kaydı eklenmiş celse"     3 days ago                        a link is set AND a READY recording that is open (ENROLLED visibility) -> the recording wins
//   held      "Kaydı bekleyen yayın"      40 min ago, 30 min long           a link is set and a READY recording that opens in 2 days (availableAt) -> the stream stays, "Ders kaydı ... açılır."
//   unframed  "Tanınmayan bağlantı"       started 20 min ago, 60 min long   a link is set, then replaced by SQL with one that is not YouTube's (see below) -> the placeholder and "Yayını aç"
//   bare      "Bağlantısız celse"         started 10 min ago                no link at all -> nothing to watch, /izle goes back to the celse page
//
// What is made with the API and what is not: the köşk's nazım makes the course (POST /kosks/{id}/courses, naming the `muderris` account as
// the hoca), the hoca sets the links (PUT /lessons/{id}/live-stream) and adds the two recordings (POST /lessons/{id}/recordings, READY at
// once), applicantA takes the seat (POST /courses/{id}/enroll, the course takes anyone), the başnazım deletes the course. The ONE thing SQL
// does is the unframed link: the route stores only a YouTube video link, normalised (live-stream.service.ts), so a link the page cannot frame
// is not made by the API; the row is the one the API wrote with its column replaced (lessons.live_stream_url, a plain text column).
// `up` and `down` are idempotent. Prints `watchstream-data <mode> <what was done>`. Nothing secret is printed.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

const TAG = "watchstream";
const TITLE = `Deneme dersi ${TAG}`; // course.mjs's own title for a tag, so its `remove` finds the invitation mails
const MADE = resolve(LOCAL, "made", `${TAG}.json`);
const FILE = resolve(LOCAL, "watch-stream.json");
const TALEBE = "applicantC";
const MIN = 60_000;
const VIDEO = "jNQXAC9IVRw";
const STREAM = `https://www.youtube.com/watch?v=${VIDEO}`; // a 19 second video that exists. On this stack the replay's browser frames it but never starts it (measured 15 Nov 2026), so the end of a stream is not reached
const OTHER = "https://www.youtube.com/watch?v=Zj4kLm9PqRs";
const NOT_YOUTUBE = "https://yayin.example.test/canli/ornek";

const at = (minutes) => new Date(Date.now() + minutes * MIN).toISOString();
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
  // what a crashed `up` left under the record, by the shared helper; then anything with the title that has no record
  spawnSync("node", ["helpers/course.mjs", "remove", TAG], {
    cwd: resolve(LOCAL, "../bindings"),
    stdio: "ignore",
  });
  const ids = await idsOf();
  for (const id of ids)
    await must("systemAdmin", "DELETE", `/courses/${id}`, undefined, [404]);
  return ids.length;
};

const up = async (seat) => {
  await remove();
  const lesson = (title, minutes, durationMinutes = 60) => ({
    title,
    type: "LIVE",
    durationMinutes,
    scheduledAt: at(minutes),
  });
  const created = (
    await must("koskNazim", "POST", `/kosks/${seed().kosk2}/courses`, {
      title: TITLE,
      description:
        "Canlı yayın izleme sayfasını görmek için yazılmış deneme dersi.",
      status: "PUBLISHED",
      requiresApproval: false,
      muderris: [{ userId: subOf("muderris"), name: await nameOf("muderris") }],
      weeks: [
        {
          weekNumber: 1,
          title: "Yayınlar",
          lessons: [
            lesson("Yayın celsesi", -14),
            lesson("Yarınki yayın", 26 * 60),
            lesson("Kaydı eklenmiş celse", -3 * 24 * 60),
            lesson("Kaydı bekleyen yayın", -40, 30),
            lesson("Tanınmayan bağlantı", -20),
            lesson("Bağlantısız celse", -10),
          ],
        },
      ],
    })
  ).body;
  const course = (await must("koskNazim", "GET", `/courses/${created.id}`))
    .body;
  const lessons = course.weeks.flatMap((w) => w.lessons);
  // the record course.mjs's `remove` reads, written before anything else can fail
  mkdirSync(resolve(LOCAL, "made"), { recursive: true });
  writeFileSync(
    MADE,
    `${JSON.stringify({
      tag: TAG,
      title: TITLE,
      course: created.id,
      kosk: seed().kosk2,
      weeks: course.weeks.map((w) => w.id),
      lessons: lessons.map((l) => l.id),
      talebe: seat ? { [accountKey(TALEBE)]: "ENROLLED" } : {},
    })}\n`,
    { mode: 0o600 }
  );
  const byTitle = (t) => {
    const found = lessons.find((l) => l.title === t);
    if (!found) throw new Fail(`the course has no celse called ${t}`);
    return found;
  };
  const [live, ahead, recorded, held, unframed, bare] = [
    "Yayın celsesi",
    "Yarınki yayın",
    "Kaydı eklenmiş celse",
    "Kaydı bekleyen yayın",
    "Tanınmayan bağlantı",
    "Bağlantısız celse",
  ].map(byTitle);

  const link = (lesson, url) =>
    must("muderris", "PUT", `/lessons/${lesson.id}/live-stream`, {
      liveStreamUrl: url,
    });
  await link(live, STREAM);
  await link(ahead, OTHER);
  await link(recorded, OTHER);
  await link(held, OTHER);
  await link(unframed, OTHER);
  await query(
    `update lessons set live_stream_url = ${sample(NOT_YOUTUBE)} where id = ${sample(unframed.id)}`
  );

  const record = (lesson, body) =>
    must("muderris", "POST", `/lessons/${lesson.id}/recordings`, body);
  await record(recorded, {
    title: "Kaydı eklenmiş celse kaydı",
    url: "https://www.youtube.com/watch?v=Ab3dEfGh1jK",
    visibility: "ENROLLED",
  });
  await record(held, {
    title: "Kaydı bekleyen yayının kaydı",
    url: "https://www.youtube.com/watch?v=Cd4eFgHi2kL",
    visibility: "ENROLLED",
    availableAt: at(2 * 24 * 60),
  });

  // the seat comes after the recordings, so no "Kayıt eklendi" is sent to it
  if (seat) await must(TALEBE, "POST", `/courses/${created.id}/enroll`);

  mkdirSync(LOCAL, { recursive: true });
  writeFileSync(
    FILE,
    `${JSON.stringify({
      course: created.id,
      title: TITLE,
      live: live.id,
      liveTitle: live.title,
      video: VIDEO,
      ahead: ahead.id,
      recorded: recorded.id,
      held: held.id,
      unframed: unframed.id,
      bare: bare.id,
    })}\n`,
    { mode: 0o600 }
  );
  return `course ${created.id}, 4 links, 2 recordings${seat ? `, ${accountKey(TALEBE)} seated` : ""}`;
};

run("watchstream-data", async () => {
  const [mode, ...args] = process.argv.slice(2);
  const usage = "usage: watchstream-data.mjs up [--seat] | show";
  let done;
  if (mode === "up" && args.every((a) => a === "--seat") && args.length <= 1)
    done = await up(args.length === 1);
  else if (mode === "show" && args.length === 0)
    done = readFileSync(FILE, "utf8").trim();
  else throw new Fail(usage, 2);
  console.log(`watchstream-data ${mode} ${done}`);
});
