// Makes what tedris.learn.homeworkHandIn needs and the seed has not got, and takes it away again (the flow's setup and teardown): a
// published course of its own with the walk's talebe in it, homework on its first celse, and, where a walk needs them, files that the
// talebe or the hoca "handed in".
//
//   node ../tedris/learn/homeworkHandIn/handin-data.mjs make <assignment> <holds>
//   node ../tedris/learn/homeworkHandIn/handin-data.mjs remove
//
//   <assignment>  none         the celse has no homework (the section is drawn only for a talebe who handed something in)
//                 text         the hoca wrote a description
//                 textAndFile  the hoca wrote a description and attached one file
//   <holds>       nothing      the talebe has handed nothing in
//                 oneFile      the talebe holds one file
//                 tenFiles     the talebe holds ten files (the quota is used up)
//
// Run by hand, it changes data: run it under the replay lock, as a replay does. Both commands are idempotent, so a walk that died leaves
// nothing the next one trips on. The seeded courses, their homework and every other account are never touched.
//
// What it uses. The course is made by helpers/course.mjs (`make handin --weeks 1 --lessons 3 --talebe applicantH`: the köşk's second
// köşk, the `muderris` account as its hoca, published, anyone takes a seat, three celses from tomorrow), which writes
// graphs/.local/made/handin.json for the binding's {made.*}. The homework is set the way nazar does it, PUT /lessons/{id}/assignment as
// the hoca. The talebe's row is made the way the page does it, PUT /lessons/{id}/submission as the talebe (a note of null makes the row).
//
// WHAT IS WRITTEN BY SQL, AND WHY. The files. The only way a file gets into a homework is the upload route, which answers 503
// STORAGE_NOT_CONFIGURED on the local stack (the stack has no Bunny Storage), so there is no API to make a file with. The rows go into
// `lesson_assignment_files` and `submission_files` under storage keys that start with `walk/homework-hand-in/`, which no object backs.
// Nothing reads the object except a download, and a download is not walked here. Removing such a file through the page deletes its row
// and queues its key in `storage_deletions`, where it waits for a sweep that does nothing without storage; deleting the course does
// the same for every row that is left. `remove` therefore ends by deleting the `storage_deletions` rows with that prefix, which are
// ours alone. Nothing else is written by SQL.
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { query } from "../../../bindings/helpers/db.mjs";
import {
  accountKey,
  Fail,
  must,
  run,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const HELPERS = resolve(here, "../../../bindings/helpers");
const TAG = "handin";
const TALEBE = "applicantH";
const HOCA = "muderris";
const PREFIX = "walk/homework-hand-in/";
const DESCRIPTION =
  "Üçüncü bâbın mâzî çekimlerini deftere yaz ve sonraki derse getir.";

const ASSIGNMENTS = ["none", "text", "textAndFile"];
const HOLDS = ["nothing", "oneFile", "tenFiles"];

// the shared course helper, as a child: it is a command, not a module
function course(...args) {
  const r = spawnSync(
    process.execPath,
    [resolve(HELPERS, "course.mjs"), ...args],
    { cwd: HELPERS, encoding: "utf8" }
  );
  if (r.status !== 0)
    throw new Fail(
      `course.mjs ${args[0]}: ${(r.stderr || r.stdout).trim().split("\n").pop()}`
    );
  return r.stdout.trim();
}

// a statement that writes: it must have changed the rows we expect
async function write(sql, rows) {
  const out = (await query(sql)).trim();
  if (out !== `{"rows":${rows}}`)
    throw new Fail(`expected ${rows} row(s) written, got: ${out}`);
}

async function remove() {
  const said = course("remove", TAG);
  await query(
    `delete from storage_deletions where storage_key like '${PREFIX}%'`
  );
  return said;
}

async function make(assignment, holds) {
  await remove(); // what a walk that died left, and a tag made before
  const made = JSON.parse(
    course("make", TAG, "--weeks", "1", "--lessons", "3", "--talebe", TALEBE)
      .split("\n")
      .pop()
  );
  const lesson = made.lessons[0];
  if (assignment !== "none") {
    await must(HOCA, "PUT", `/lessons/${lesson}/assignment`, {
      description: DESCRIPTION,
      kind: "FILE",
    });
  }
  if (assignment === "textAndFile") {
    await write(
      `insert into lesson_assignment_files (assignment_id, storage_key, file_name, content_type, size_bytes)
       select id, '${PREFIX}${lesson}/assignment-1.pdf', 'ders-notu.pdf', 'application/pdf', 48213
       from lesson_assignments where lesson_id = '${lesson}'`,
      1
    );
  }
  if (holds !== "nothing") {
    // a note of null makes the row, as the page's own first write would
    await must(TALEBE, "PUT", `/lessons/${lesson}/submission`, { note: null });
    const n = holds === "tenFiles" ? 10 : 1;
    await write(
      `insert into submission_files (submission_id, storage_key, file_name, content_type, size_bytes)
       select s.id, '${PREFIX}${lesson}/own-' || g || '.pdf', 'ödev.pdf', 'application/pdf', 20480 + g
       from lesson_submissions s, generate_series(1, ${n}) g
       where s.lesson_id = '${lesson}' and s.user_id = '${subOf(TALEBE)}'`,
      n
    );
  }
  return `${accountKey(TALEBE)} ${assignment} ${holds} course ${made.course} celse ${lesson}`;
}

run("handin-data", async () => {
  const [verb, assignment, holds, ...rest] = process.argv.slice(2);
  const usage =
    "usage: handin-data.mjs make <none|text|textAndFile> <nothing|oneFile|tenFiles> | remove";
  if (verb === "make") {
    if (
      !ASSIGNMENTS.includes(assignment) ||
      !HOLDS.includes(holds) ||
      rest.length
    )
      throw new Fail(usage, 2);
    console.log(`handin-data make ${await make(assignment, holds)}`);
  } else if (verb === "remove") {
    if (assignment !== undefined) throw new Fail(usage, 2);
    console.log(`handin-data remove ${await remove()}`);
  } else throw new Fail(usage, 2);
});
