// What tedris.learn.writingGating needs on top of `helpers/course.mjs make` (the course itself is made and removed there), as the flow's setup,
// the events that take a seat away while a page is open, and its teardown:
//
//   node ../tedris/learn/writingGating/gating-data.mjs content <tag>                  homework, a recording, a cancelled celse, a hidden celse
//   node ../tedris/learn/writingGating/gating-data.mjs world <tag> <variant>          what the talebe holds in the course (below)
//   node ../tedris/learn/writingGating/gating-data.mjs lose <tag> removed|barred|passive   the seat, the standing or the scope goes
//   node ../tedris/learn/writingGating/gating-data.mjs clean <tag>                    what `course.mjs remove` does not take with the course
//   node ../tedris/learn/writingGating/gating-data.mjs seat <tag>                     what the course holds for the talebe: `seat <KEY> <course> <status>`
//
// The course is `course.mjs make <tag> --weeks 1 --lessons 4 --start -4 [--approval] [--talebe applicantD]`: four celses, four, two and zero days
// ago, then in two days, at 21:00 in Istanbul, titled "Celse 1" to "Celse 4" (programme order, and `{made.lessons.N}` in a binding). The talebe is
// applicantD, the hoca is MUDERRIS, as course.mjs makes them.
//
// content   The API, as the hoca. The first celse gets a homework (PUT /lessons/{id}/assignment, kind FILE), so that "Ödev" is drawn for a talebe
//           who may hand in; the second a recording (POST /lessons/{id}/recordings, a link to a host with no player), so that the watch page has
//           something to watch; the third is cancelled (POST /lessons/{id}/cancel, with the course's version read first); the fourth is hidden
//           (DELETE /lessons/{id}, the archive). A repeat is harmless: a recording, a cancellation and an archive that are already there answer
//           409 or 404 and are accepted.
// world     <variant> is what the walk wants the talebe to be:
//             active    nothing written (the seat is the one `course.mjs make --talebe` took)
//             pending   nothing written (the course was made with --approval, so the seat waits)
//             stranger  nothing written (the course was made with no --talebe)
//             staff     the talebe writes a note and a question on the first celse, the hoca answers the question; the talebe keeps the seat
//             removed   the same, and then the seat is taken away (POST /courses/{id}/enrollments/{userId}/remove)
//             barred    the same, and then an open ban bars the talebe from the course (POST /courses/{courseId}/bans); the seat stays
//             passive   the same, and then the course loses its last müderris: its MUDERRIS role rows are revoked, which is what makes a scope
//                       passive (the one SQL here: no route takes the last müderris out, nazar's "Müderrisleri düzenle" refuses an empty team)
// ids      `world` for a talebe who writes puts the note's and the question's ids in graphs/.local/writing-gating.json (read as {wg.note}); `clean`
//           deletes the file.
// lose      The way a seat goes while a page is open (the events SEAT_REMOVED, SEAT_BARRED, SEAT_PASSIVE of the binding); `world` uses it too.
// clean     A ban row has no foreign key to its course and so outlives it (bans.course_id is a plain uuid), and a ban tells the köşk's nazımları
//           and the Medaris nazımları with a notification that points at the köşk, which `course.mjs remove` does not clear. So: the course's
//           ban rows and the COURSE_BAN_PLACED notifications that carry its title are deleted with SQL, before the course is removed (the made
//           file is read, and `course.mjs remove` deletes it). `none` when there is no made file.
// Nothing else is written to SQL. Each mode prints `gating-data <mode> <what was done>`; `seat` prints `seat ...`. Nothing secret is printed.
// Run it under the replay lock when walks are running and you run it by hand.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { query } from "../../../bindings/helpers/db.mjs";
import {
  accountKey,
  call,
  Fail,
  LOCAL,
  must,
  run,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const HOCA = "muderris";
const TALEBE = "applicantD";
const HOMEWORK = "Yazma denemesi ödevi: bir sayfa yaz.";
const NOTE = "Yazma denemesi notu";
const QUESTION = "Yazma denemesi sorusu";
const ANSWER = "Yazma denemesi cevabi";
const RECORDING = {
  title: "Yazma denemesi kaydı",
  url: "https://video.example.test/dersler/yazma-denemesi",
  visibility: "ENROLLED",
};
const CANCEL_REASON = "Deneme: celse iptal edildi.";
const REMOVE_REASON = "Deneme: kayıt geri alındı.";
const BAN_REASON = "Deneme: yazma kapısı.";

const IDS = resolve(LOCAL, "writing-gating.json");

const made = (tag) => {
  try {
    return JSON.parse(
      readFileSync(resolve(LOCAL, "made", `${tag}.json`), "utf8")
    );
  } catch {
    return null;
  }
};
const need = (tag) => {
  const m = made(tag);
  if (!m)
    throw new Fail(`no course for the tag ${tag}: run course.mjs make first`);
  return m;
};

const content = async (tag) => {
  const m = need(tag);
  const [first, second, third, fourth] = m.lessons;
  if (!fourth)
    throw new Fail(
      "the course needs four celses: course.mjs make <tag> --weeks 1 --lessons 4"
    );
  await must(HOCA, "PUT", `/lessons/${first}/assignment`, {
    description: HOMEWORK,
    kind: "FILE",
  });
  await must(HOCA, "POST", `/lessons/${second}/recordings`, RECORDING, [409]);
  const course = (await must(HOCA, "GET", `/courses/${m.course}`)).body;
  await must(
    HOCA,
    "POST",
    `/lessons/${third}/cancel`,
    { version: course.version, reason: CANCEL_REASON },
    [409]
  );
  await must(HOCA, "DELETE", `/lessons/${fourth}`, undefined, [404]);
  return "homework on the first celse, a recording on the second, the third cancelled, the fourth hidden";
};

// the talebe writes a note and a question on the first celse, and the hoca answers the question; nothing is repeated. The two ids go to
// graphs/.local/writing-gating.json, which the binding reads as {wg.note} and {wg.question} (for the hoca's edit and delete of the note)
const write = async (tag) => {
  const m = need(tag);
  const first = m.lessons[0];
  const notes = (await must(TALEBE, "GET", `/lessons/${first}/notes`)).body;
  let note = (Array.isArray(notes) ? notes : []).find((n) => n.body === NOTE);
  if (!note)
    note = (
      await must(TALEBE, "POST", `/lessons/${first}/notes`, {
        body: NOTE,
        offsetSeconds: null,
      })
    ).body;
  const mine = (
    await must(TALEBE, "GET", `/courses/${m.course}/questions/mine`)
  ).body;
  let asked = (mine?.items ?? []).find((q) => q.body === QUESTION);
  if (!asked)
    asked = (
      await must(TALEBE, "POST", `/lessons/${first}/questions`, {
        body: QUESTION,
      })
    ).body;
  await must(HOCA, "PUT", `/questions/${asked.id}/answer`, { body: ANSWER });
  mkdirSync(LOCAL, { recursive: true });
  writeFileSync(
    IDS,
    `${JSON.stringify({ note: note.id, question: asked.id })}\n`,
    {
      mode: 0o600,
    }
  );
};

const lose = async (tag, how) => {
  const m = need(tag);
  if (how === "removed") {
    await must(
      HOCA,
      "POST",
      `/courses/${m.course}/enrollments/${subOf(TALEBE)}/remove`,
      { reason: REMOVE_REASON },
      [409]
    );
    return `${accountKey(TALEBE)} removed from the course: REVOKED`;
  }
  if (how === "barred") {
    await must(HOCA, "POST", `/courses/${m.course}/bans`, {
      userId: subOf(TALEBE),
      scope: "COURSE",
      reason: BAN_REASON,
    });
    return `${accountKey(TALEBE)} barred from the course; the seat stays`;
  }
  if (how === "passive") {
    const out = await query(
      `update role_assignments set revoked_at = now(), revoked_by = granted_by where role = 'MUDERRIS' and scope_id = '${m.course}' and revoked_at is null`
    );
    return `the course lost its müderris: ${out.trim() || "no change"}`;
  }
  throw new Fail("usage: lose <tag> removed|barred|passive", 2);
};

const world = async (tag, variant) => {
  const written = ["staff", "removed", "barred", "passive"];
  if (
    ![
      "active",
      "pending",
      "stranger",
      "staff",
      "removed",
      "barred",
      "passive",
    ].includes(variant)
  )
    throw new Fail(
      "usage: world <tag> active|pending|stranger|staff|removed|barred|passive",
      2
    );
  if (written.includes(variant)) await write(tag);
  if (["removed", "barred", "passive"].includes(variant))
    return `${variant}: ${await lose(tag, variant)}`;
  return variant;
};

const clean = async (tag) => {
  rmSync(IDS, { force: true });
  const m = made(tag);
  if (!m) return "none";
  const bans = await query(`delete from bans where course_id = '${m.course}'`);
  const told = await query(
    `delete from notifications where type = 'COURSE_BAN_PLACED' and params->>'courseTitle' = '${String(m.title).replace(/'/g, "''")}'`
  );
  return `${m.course}: bans ${bans.trim()}, notifications ${told.trim()}`;
};

const seat = async (tag) => {
  const m = need(tag);
  const r = await call(
    TALEBE,
    "GET",
    "/courses/enrolled?includePending=true&includeRevoked=true"
  );
  const list = Array.isArray(r.body) ? r.body : (r.body?.items ?? []);
  const status = list.find((c) => c.id === m.course)?.enrollment?.status;
  return `seat ${accountKey(TALEBE)} ${m.course} ${status ?? "none"}`;
};

run("gating-data", async () => {
  const [mode, tag, arg, ...more] = process.argv.slice(2);
  const usage =
    "usage: gating-data.mjs content <tag> | world <tag> <variant> | lose <tag> removed|barred|passive | clean <tag> | seat <tag>";
  if (!mode || !tag || more.length) throw new Fail(usage, 2);
  let done;
  if (mode === "content" && arg === undefined) done = await content(tag);
  else if (mode === "world" && arg) done = await world(tag, arg);
  else if (mode === "lose" && arg) done = await lose(tag, arg);
  else if (mode === "clean" && arg === undefined) done = await clean(tag);
  else if (mode === "seat" && arg === undefined) {
    console.log(await seat(tag));
    return;
  } else throw new Fail(usage, 2);
  console.log(`gating-data ${mode} ${done}`);
});
