// Gives the seeded open course the three things a visitor can read in a course's introduction that the stack's seed leaves out,
// and takes them away again (tedris.discover.visitorPath's setup and teardown).
//
//   node ../tedris/discover/visitorPath/visitor-data.mjs up     the first celse of the course is its sample celse (agenda and source), has a public recording, and the course lists one resource
//   node ../tedris/discover/visitorPath/visitor-data.mjs down   the way back: no sample, no recording, no resource
//
// What `up` makes, and how:
//   - the sample celse: PATCH /lessons/{id} as the müderris (isPreview, kaynak, agenda) on the first celse of the first week, the
//     one that was held on 3 Nov. The title stays "Canlı ders" (the seed's). The API route is used because it exists.
//   - the public recording of that celse: SQL, not the API. POST /lessons/{id}/recordings exists, but it tells every enrolled talebe
//     ("Kayıt eklendi", notification:RECORDING_ADDED) and the seeded talebe's notifications are other flows' data, which nothing
//     here may leave a trace in. The row is what the API writes for a pasted YouTube link: provider YOUTUBE, status READY, visibility
//     PUBLIC, the celse's start as recorded_at and its length as duration.
//   - the course resource, a link: SQL, because the only API that writes a course's resources is the whole-course PUT, which would
//     rewrite the programme.
// Both commands are idempotent and print `visitor-data <up|down> <what was done>`. Nothing secret is printed.

import { query } from "../../../bindings/helpers/db.mjs";
import { Fail, must, run, seed } from "../../../bindings/helpers/lib.mjs";

const SOURCE = "Bina, ilk fasıl";
const AGENDA = [{ time: "21:00", title: "Sîgaların tekrarı" }];
const RECORDING = "Örnek celse kaydı";
const RECORDING_URL = "https://www.youtube.com/watch?v=abcdefghijk";
const RESOURCE = "Bina şerhi, ilk bölüm";
const RESOURCE_META = "PDF · 12 sayfa";
const RESOURCE_URL = "https://example.com/bina-serhi.pdf";

const sample = (v) => `'${String(v).replaceAll("'", "''")}'`;

run("visitor-data", async () => {
  const [mode, ...more] = process.argv.slice(2);
  if (!["up", "down"].includes(mode) || more.length)
    throw new Fail("usage: visitor-data.mjs up|down", 2);
  const course = seed().courses.open;
  const read = async () =>
    (await must("muderris", "GET", `/courses/${course}`)).body;
  const first = (c) => c.weeks[0].lessons[0];
  const done = [];

  if (mode === "up") {
    const c = await read();
    const lesson = first(c);
    if (lesson.isPreview !== true) {
      await must("muderris", "PATCH", `/lessons/${lesson.id}`, {
        version: c.version,
        isPreview: true,
        kaynak: SOURCE,
        agenda: AGENDA,
      });
      done.push("sample celse");
    } else done.push("sample celse already");
    const have = await query(
      `select id from lesson_recordings where lesson_id = ${sample(lesson.id)}`
    );
    if (have.trim() === "") {
      await query(
        `insert into lesson_recordings (lesson_id, title, provider, url, duration_minutes, recorded_at, visibility, status)
         values (${sample(lesson.id)}, ${sample(RECORDING)}, 'YOUTUBE', ${sample(RECORDING_URL)}, ${lesson.durationMinutes ?? 60},
                 ${lesson.scheduledAt ? sample(lesson.scheduledAt) : "now()"}, 'PUBLIC', 'READY')`
      );
      done.push("public recording");
    } else done.push("recording already");
    const res = await query(
      `select id from course_resources where course_id = ${sample(course)} and name = ${sample(RESOURCE)}`
    );
    if (res.trim() === "") {
      await query(
        `insert into course_resources (course_id, name, meta, url, order_index)
         values (${sample(course)}, ${sample(RESOURCE)}, ${sample(RESOURCE_META)}, ${sample(RESOURCE_URL)}, 0)`
      );
      done.push("resource");
    } else done.push("resource already");
    console.log(`visitor-data up ${done.join(", ")}`);
    return;
  }

  const c = await read();
  const lesson = first(c);
  const gone = await query(
    `delete from lesson_recordings where lesson_id = ${sample(lesson.id)} and title = ${sample(RECORDING)} returning 1`
  );
  done.push(gone.trim() === "" ? "recording none" : "recording removed");
  const res = await query(
    `delete from course_resources where course_id = ${sample(course)} and name = ${sample(RESOURCE)} returning 1`
  );
  done.push(res.trim() === "" ? "resource none" : "resource removed");
  if (lesson.isPreview === true) {
    await must("muderris", "PATCH", `/lessons/${lesson.id}`, {
      version: c.version,
      isPreview: false,
      kaynak: null,
      agenda: null,
    });
    done.push("sample celse removed");
  } else done.push("sample celse none");
  console.log(`visitor-data down ${done.join(", ")}`);
});
