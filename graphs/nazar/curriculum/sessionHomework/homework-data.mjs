// Makes what nazar.curriculum.sessionHomework needs and takes it away again (the flow's setup and teardown): a published course of its
// own with one celse, and, where a scenario says so, the homework that celse already holds when the page opens.
//
//   node ../nazar/curriculum/sessionHomework/homework-data.mjs make <none|file|recital> [--nazir <code,code>]
//   node ../nazar/curriculum/sessionHomework/homework-data.mjs remove
//
//   <none>      the celse has no homework: the hoca turns it on in the walk
//   <file>      a FILE homework with a description and one file ("ders-notu.pdf")
//   <recital>   a MEMORIZE homework with no description and no file, and one talebe (applicantF) whose recital the hoca has marked "Tam"
//   --nazir     also gives the ders nazırı account (`dersNazir`) a post in the course with exactly these permission codes, as the hoca does
//               on Ders nazırları (helpers/course-nazir-grants.mjs), for the scenarios whose reader is not the hoca
//
// Run by hand, it changes data: run it under the replay lock, as a replay does. Both commands are idempotent, so a walk that died leaves
// nothing the next one trips on. The seeded courses, their homework and every other account are never touched.
//
// What it uses. The course is made by helpers/course.mjs (`make sess-homework --weeks 1 --lessons 1`, in the seed's second köşk, the
// `muderris` account as its one hoca, published, anyone takes a seat, one celse from tomorrow at 21:00 Istanbul), which writes
// graphs/.local/made/sess-homework.json for the binding's {made.*}. The homework is set the way nazar does it, PUT /lessons/{id}/assignment
// as the hoca; the mark the way the course team does, PUT /lessons/{id}/evaluations/{userId}.
//
// WHAT IS WRITTEN BY SQL, AND WHY. The one file of `file`. The only way a file gets into a homework is the upload route, which answers 503
// STORAGE_NOT_CONFIGURED on the local stack (the stack has no Bunny Storage), so there is no API to make a file with. The row goes into
// `lesson_assignment_files` under a storage key that starts with `walk/session-homework/`, which no object backs; nothing reads the
// object except a download, and a download is not walked here. Removing such a file through the page deletes its row and queues its key in
// `storage_deletions`, where it waits for a sweep that does nothing without storage; deleting the course does the same for every row
// that is left. `remove` therefore ends by deleting the `storage_deletions` rows with that prefix, which are ours alone. Nothing else is
// written by SQL.
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { query } from "../../../bindings/helpers/db.mjs";
import {
  Fail,
  must,
  options,
  run,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const HELPERS = resolve(here, "../../../bindings/helpers");
const TAG = "sess-homework";
const HOCA = "muderris";
const TALEBE = "applicantF";
const PREFIX = "walk/session-homework/";
const DESCRIPTION =
  "Üçüncü bâbın mâzî çekimlerini deftere yaz ve sonraki derse getir.";
const STARTS = ["none", "file", "recital"];
const usage =
  "usage: homework-data.mjs make <none|file|recital> [--nazir <code,code>] | remove";

// a shared helper, as a child: they are commands, not modules
function helper(script, ...args) {
  const r = spawnSync(process.execPath, [resolve(HELPERS, script), ...args], {
    cwd: HELPERS,
    encoding: "utf8",
  });
  if (r.status !== 0)
    throw new Fail(
      `${script} ${args[0]}: ${(r.stderr || r.stdout).trim().split("\n").pop()}`
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
  const said = helper("course.mjs", "remove", TAG);
  await query(
    `delete from storage_deletions where storage_key like '${PREFIX}%'`
  );
  return said;
}

async function make(start, nazir) {
  await remove(); // what a walk that died left, and a tag made before
  const args = ["make", TAG, "--weeks", "1", "--lessons", "1"];
  if (start === "recital") args.push("--talebe", TALEBE);
  const made = JSON.parse(
    helper("course.mjs", ...args)
      .split("\n")
      .pop()
  );
  const lesson = made.lessons[0];
  if (start === "file") {
    await must(HOCA, "PUT", `/lessons/${lesson}/assignment`, {
      description: DESCRIPTION,
      kind: "FILE",
    });
    await write(
      `insert into lesson_assignment_files (assignment_id, storage_key, file_name, content_type, size_bytes)
       select id, '${PREFIX}${lesson}/assignment-1.pdf', 'ders-notu.pdf', 'application/pdf', 48213
       from lesson_assignments where lesson_id = '${lesson}'`,
      1
    );
  }
  if (start === "recital") {
    await must(HOCA, "PUT", `/lessons/${lesson}/assignment`, {
      description: null,
      kind: "MEMORIZE",
    });
    await must(HOCA, "PUT", `/lessons/${lesson}/evaluations/${subOf(TALEBE)}`, {
      status: "FULL",
      note: null,
    });
  }
  if (nazir)
    helper(
      "course-nazir-grants.mjs",
      "--course",
      made.course,
      "--nazir",
      "dersNazir",
      "--codes",
      nazir
    );
  return `${start} course ${made.course} celse ${lesson}${nazir ? ` nazir ${nazir}` : ""}`;
}

run("homework-data", async () => {
  const { rest, nazir } = options(process.argv.slice(2), {
    values: ["nazir"],
  });
  const [verb, start, ...more] = rest;
  if (verb === "make") {
    if (!STARTS.includes(start) || more.length) throw new Fail(usage, 2);
    console.log(`homework-data make ${await make(start, nazir)}`);
  } else if (verb === "remove") {
    if (start !== undefined || nazir !== undefined) throw new Fail(usage, 2);
    console.log(`homework-data remove ${await remove()}`);
  } else throw new Fail(usage, 2);
});
