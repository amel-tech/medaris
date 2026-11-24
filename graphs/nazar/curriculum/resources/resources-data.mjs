// Makes what nazar.curriculum.resources needs and the seed has not got, and takes it away again (the flow's setup and teardown): a
// published course of its own with two weeks of two celses, whose one hoca is the müderris of the stack, and, where a walk needs
// them, a stored file in the course's resources or a ders nazırı with only some of the permissions of Müfredat.
//
//   node ../nazar/curriculum/resources/resources-data.mjs make <rights>
//   node ../nazar/curriculum/resources/resources-data.mjs remove
//
//   <rights>  full        the course has no resource; the walk is the müderris
//             withFile    the same, and the course's resources hold one stored file ("Ders notu", ders-notu.pdf)
//             noSessions  the course has no resource; the walk is DERS_NAZIR, who holds course.edit and not session.manage
//             readOnly    the course has no resource; the walk is DERS_NAZIR, who holds session.manage and not course.edit
//
// Run by hand, it changes data: run it under the replay lock, as a replay does. Both commands are idempotent, so a walk that died
// leaves nothing the next one trips on. The seeded courses, their resources and every other account are never touched.
//
// What it uses. The course is made by helpers/course.mjs (`make resources --weeks 2 --lessons 2`: the second köşk, `muderris` as its
// hoca, published, anyone takes a seat, two weeks of two celses from tomorrow), which writes graphs/.local/made/resources.json for the
// binding's {made.*}. The ders nazırı's post is made the way the hoca makes it on Ders nazırları (helpers/course-nazir-grants.mjs).
//
// WHAT IS WRITTEN BY SQL, AND WHY. One row, for `withFile`: the course's stored file. The only way a file gets into a course's
// resources is the upload route, which answers 503 STORAGE_NOT_CONFIGURED on the local stack (no Bunny Storage), so there is no API to
// make a file with. The row goes into `course_resources` under a storage key that starts with `walk/curriculum-resources/`, which no
// object backs; nothing reads the object except a download, and a download is not walked here. Removing such a file through the page
// (the save that follows the question) deletes its row and queues its key in `storage_deletions`, where it waits for a sweep that does
// nothing without storage; deleting the course does the same for a row that is left. `remove` therefore ends by deleting the
// `storage_deletions` rows with that prefix, which are ours alone. Nothing else is written by SQL.
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { query } from "../../../bindings/helpers/db.mjs";
import { Fail, run } from "../../../bindings/helpers/lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const HELPERS = resolve(here, "../../../bindings/helpers");
const TAG = "resources";
const PREFIX = "walk/curriculum-resources/";
const RIGHTS = ["full", "withFile", "noSessions", "readOnly"];
// what the ders nazırı holds in the walk's own course, as the hoca grants it
const GRANTS = { noSessions: "course.edit", readOnly: "session.manage" };

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

async function make(rights) {
  await remove(); // what a walk that died left, and a tag made before
  const made = JSON.parse(
    helper("course.mjs", "make", TAG, "--weeks", "2", "--lessons", "2")
      .split("\n")
      .pop()
  );
  if (rights === "withFile") {
    await write(
      `insert into course_resources (course_id, name, meta, storage_key, file_name, content_type, size_bytes, order_index)
       values ('${made.course}', 'Ders notu', 'PDF · 3 sayfa', '${PREFIX}${made.course}/resource-1.pdf', 'ders-notu.pdf', 'application/pdf', 48213, 0)`,
      1
    );
  }
  if (GRANTS[rights]) {
    helper(
      "course-nazir-grants.mjs",
      "--course",
      made.course,
      "--nazir",
      "DERS_NAZIR",
      "--codes",
      GRANTS[rights]
    );
  }
  return `${rights} course ${made.course}`;
}

run("resources-data", async () => {
  const [verb, rights, ...rest] = process.argv.slice(2);
  const usage =
    "usage: resources-data.mjs make <full|withFile|noSessions|readOnly> | remove";
  if (verb === "make") {
    if (!RIGHTS.includes(rights) || rest.length) throw new Fail(usage, 2);
    console.log(`resources-data make ${await make(rights)}`);
  } else if (verb === "remove") {
    if (rights !== undefined) throw new Fail(usage, 2);
    console.log(`resources-data remove ${await remove()}`);
  } else throw new Fail(usage, 2);
});
