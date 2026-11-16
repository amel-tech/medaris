// What tedris.learning.myCourses needs after its four courses are made: the rows of one spare talebe, `applicantE`, put into the four states
// Derslerim sorts into. The courses themselves are made by the shared helper (helpers/course.mjs make <tag>, four tags below), so nothing
// the seed holds is touched.
//
//   node ../tedris/learning/myCourses/mycourses-data.mjs states   after the four `course.mjs make`: progress, completion, removal
//   node ../tedris/learning/myCourses/mycourses-data.mjs down     applicantE's rows in the four courses are deleted (the rest is course.mjs remove)
//   node ../tedris/learning/myCourses/mycourses-data.mjs rows     one line: what each course holds for applicantE (read only)
//
// The four courses, each `Deneme dersi <tag>` in the seed's second köşk with the seeded müderris as its hoca, each made with applicantE applying:
//   mycourses-ongoing    anyone takes a seat: ENROLLED at once; `states` records 40 per cent as the talebe does (PUT /courses/{id}/progress)
//   mycourses-waiting    made with --approval: applying leaves a PENDING application; `states` does nothing to it
//   mycourses-completed  ENROLLED; `states` has the course team complete it (PATCH /courses/{id}/enrollments/{userId}, as the müderris)
//   mycourses-revoked    ENROLLED; `states` has the course team take the seat away (POST .../enrollments/{userId}/remove, as the müderris)
// Every status is written through the route the course team or the talebe uses; no SQL writes a status. The one SQL is `down`'s delete of
// applicantE's rows in these four courses: no route removes a COMPLETED or a REVOKED row (leaving is refused for both), and the course's
// removal should not meet them. It names the courses by their made ids and the account by its sub, so it cannot touch another person's row.
// The made courses' ids are read from graphs/.local/made/<tag>.json, which course.mjs writes.
// Taking and giving seats makes tedrisat's invitation sweep mail applicantE (Mailpit); the binding clears that mailbox.
// Run by hand only under the replay lock. Prints `mycourses-data <mode> <what was done>`. Nothing secret is printed.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { query } from "../../../bindings/helpers/db.mjs";
import {
  accountKey,
  Fail,
  LOCAL,
  must,
  run,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const TALEBE = "applicantE";
const TAGS = {
  ongoing: "mycourses-ongoing",
  waiting: "mycourses-waiting",
  completed: "mycourses-completed",
  revoked: "mycourses-revoked",
};

const madeId = (tag, required = true) => {
  const file = resolve(LOCAL, "made", `${tag}.json`);
  if (!existsSync(file)) {
    if (required)
      throw new Fail(
        `${file} does not exist: run course.mjs make ${tag} first`
      );
    return null;
  }
  return JSON.parse(readFileSync(file, "utf8")).course;
};

const states = async () => {
  const ongoing = madeId(TAGS.ongoing);
  const completed = madeId(TAGS.completed);
  const revoked = madeId(TAGS.revoked);
  const sub = subOf(TALEBE);
  await must(TALEBE, "PUT", `/courses/${ongoing}/progress`, { progress: 40 });
  await must("muderris", "PATCH", `/courses/${completed}/enrollments/${sub}`, {
    status: "COMPLETED",
  });
  await must(
    "muderris",
    "POST",
    `/courses/${revoked}/enrollments/${sub}/remove`,
    { reason: "Derslerim sayfasının denemesi için çıkarıldı." }
  );
  return `${accountKey(TALEBE)}: ongoing 40, waiting, completed, revoked`;
};

const mine = () =>
  Object.values(TAGS)
    .map((t) => madeId(t, false))
    .filter(Boolean)
    .map((id) => `'${id}'`)
    .join(", ");

const down = async () => {
  const ids = mine();
  if (!ids) return `${accountKey(TALEBE)}: no made course, nothing to delete`;
  const out = await query(
    `delete from enrollments where user_id = '${subOf(TALEBE)}' and course_id in (${ids}) returning status`
  );
  const n = out.split("\n").filter(Boolean).length;
  return `${accountKey(TALEBE)}: ${n} row(s) deleted`;
};

const rows = async () => {
  const out = await query(
    `select c.title, e.status from enrollments e join courses c on c.id = e.course_id where e.user_id = '${subOf(TALEBE)}' order by c.title`
  );
  const lines = out
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .map((r) => `${r.title}=${r.status}`);
  return lines.length ? lines.join(", ") : "no rows";
};

run("mycourses-data", async () => {
  const [mode, ...more] = process.argv.slice(2);
  if (!["states", "down", "rows"].includes(mode) || more.length)
    throw new Fail("usage: mycourses-data.mjs states | down | rows", 2);
  const done =
    mode === "states"
      ? await states()
      : mode === "down"
        ? await down()
        : await rows();
  console.log(`mycourses-data ${mode} ${done}`);
});
