// Makes what nizam.courses.curriculum needs and the seed has not got, and takes it away again (the flow's setup and teardown): a published course of
// its own in the seed's second köşk, with two weeks of two celses, whose one hoca is the müderris of the stack, and, where a walk needs it, one stored
// file in the course's resources.
//
//   node ../nizam/courses/curriculum/curriculum-data.mjs make <plain|withFile>
//   node ../nizam/courses/curriculum/curriculum-data.mjs remove
//
//   plain      the course has no resource
//   withFile   the same, and the course's resources hold one stored file ("Ders notu", ders-notu.pdf)
//
// Run by hand, it changes data: run it under the replay lock, as a replay does. Both commands are idempotent, so a walk that died leaves nothing the
// next one trips on. The seeded courses, their resources and every other account are never touched.
//
// What it uses. The course is made by helpers/course.mjs (`make nzcurr --kosk <seed.kosk2> --weeks 2 --lessons 2`: "Deneme dersi nzcurr", published,
// `muderris` as its hoca, anyone takes a seat, two weeks of two celses from tomorrow: the weeks are "Hafta 1" and "Hafta 2", the celses "Celse 1" to
// "Celse 4"), which writes graphs/.local/made/nzcurr.json for the binding's {made.*}. The köşk nazımı of the stack opens a course in that köşk, which no
// seeded flow reads.
//
// WHAT IS WRITTEN BY SQL, AND WHY. One row, for `withFile`: the course's stored file. The only way a file gets into a course's resources is the upload
// route, which answers 503 STORAGE_NOT_CONFIGURED on the local stack (no Bunny Storage), so there is no API to make a file with (the same as
// nazar.curriculum.resources). The row goes into `course_resources` under a storage key that starts with `walk/nizam-curriculum/`, which no object
// backs; nothing reads the object except a download, and a download is refused here before it reaches one. Removing such a file through the page (the
// Kaydet that follows the question) deletes its row and queues its key in `storage_deletions`, where it waits for a sweep that does nothing without
// storage; deleting the course does the same for a row that is left. `remove` therefore ends by deleting the `storage_deletions` rows with that prefix,
// which are ours alone. Nothing else is written by SQL.
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { query } from "../../../bindings/helpers/db.mjs";
import { Fail, run, seed } from "../../../bindings/helpers/lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const HELPERS = resolve(here, "../../../bindings/helpers");
const TAG = "nzcurr";
const PREFIX = "walk/nizam-curriculum/";
const KINDS = ["plain", "withFile"];

// a shared helper, as a child: it is a command, not a module
function helper(file, ...args) {
  const r = spawnSync(process.execPath, [resolve(HELPERS, file), ...args], {
    cwd: HELPERS,
    encoding: "utf8",
  });
  if (r.status !== 0)
    throw new Fail(
      `${file} ${args[0]}: ${(r.stderr || r.stdout).trim().split("\n").pop()}`
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

async function make(kind) {
  await remove(); // what a walk that died left, and a tag made before
  const made = JSON.parse(
    helper(
      "course.mjs",
      "make",
      TAG,
      "--kosk",
      seed().kosk2,
      "--weeks",
      "2",
      "--lessons",
      "2"
    )
      .split("\n")
      .pop()
  );
  if (kind === "withFile") {
    await write(
      `insert into course_resources (course_id, name, meta, storage_key, file_name, content_type, size_bytes, order_index)
       values ('${made.course}', 'Ders notu', 'PDF · 3 sayfa', '${PREFIX}${made.course}/resource-1.pdf', 'ders-notu.pdf', 'application/pdf', 48213, 0)`,
      1
    );
  }
  return `${kind} course ${made.course}`;
}

run("curriculum-data", async () => {
  const [verb, kind, ...rest] = process.argv.slice(2);
  const usage = "usage: curriculum-data.mjs make <plain|withFile> | remove";
  if (verb === "make") {
    if (!KINDS.includes(kind) || rest.length) throw new Fail(usage, 2);
    console.log(`curriculum-data make ${await make(kind)}`);
  } else if (verb === "remove") {
    if (kind !== undefined) throw new Fail(usage, 2);
    console.log(`curriculum-data remove ${await remove()}`);
  } else throw new Fail(usage, 2);
});
