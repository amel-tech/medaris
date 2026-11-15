// What the walks of nazar.bans.courseBans need that ../decide/bans.mjs has no command for. Run by a binding's `setup`, `teardown` and
// `events` with graphs/bindings/ as the working directory: `node ../nazar/bans/courseBans/cbans.mjs <command> ...`. No password is ever on
// a command line or printed. The rest of the walks' data (open bans on spare accounts, taking them away, lifting one behind the page's back,
// reading what a write left) is ../decide/bans.mjs, which this file does not copy.
//
//   ban <tag> --who KEY --as ACCOUNT [--reason TEXT]
//        <tag> is the tag of a course made by `helpers/course.mjs make <tag>` (graphs/.local/made/<tag>.json). ACCOUNT places a COURSE ban on
//        the person through POST /courses/:courseId/bans, the route the page's own "Yasakla" uses (decide's `up` places by the medrese's
//        route, which a course with no medrese does not have). The köşk course of the scenario `kosk` has its ban placed here by SYSTEM_ADMIN.
//        Prints `banned <KEY> by <ACCOUNT>`.
//   forget <tag>
//        Deletes the COURSE_BAN_PLACED notices that a ban placed through the course route sent to the köşk's nazımları and the Medaris
//        nazımları (target the köşk, so `helpers/course.mjs remove` does not clear them: its notifications are the ones that point at the
//        course). No route deletes a notice, so this is SQL, and it only names this walk's course by its title. Prints `forgot <n>`.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { query } from "../../../bindings/helpers/db.mjs";
import {
  accountKey,
  Fail,
  LOCAL,
  must,
  options,
  run,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TAG = /^[A-Za-z0-9][A-Za-z0-9_-]{0,40}$/;
const usage =
  "usage: cbans.mjs ban <tag> --who KEY --as ACCOUNT [--reason TEXT] | forget <tag>";

function madeCourse(tag) {
  const file = resolve(LOCAL, "made", `${tag}.json`);
  let made;
  try {
    made = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new Fail(
      `${file} does not exist: make the course first (helpers/course.mjs make ${tag})`
    );
  }
  if (!UUID.test(made.course ?? ""))
    throw new Fail(`${file} holds no course id`);
  return made.course;
}

run("cbans", async () => {
  const [command, tag, ...rest] = process.argv.slice(2);
  if (!command || !TAG.test(tag ?? "")) throw new Fail(usage, 2);
  const o = options(rest, { values: ["who", "as", "reason"] });
  if (o.rest.length) throw new Fail(usage, 2);

  if (command === "ban") {
    if (!o.who || !o.as) throw new Fail(usage, 2);
    const course = madeCourse(tag);
    await must(o.as, "POST", `/courses/${course}/bans`, {
      userId: subOf(o.who),
      scope: "COURSE",
      reason: o.reason ?? "Celselerde ders dışı reklam yaptı",
    });
    console.log(`banned ${accountKey(o.who)} by ${accountKey(o.as)}`);
    return;
  }

  if (command === "forget") {
    if (rest.length) throw new Fail(usage, 2);
    const out = await query(
      `delete from notifications where type = 'COURSE_BAN_PLACED' and params->>'courseTitle' = 'Deneme dersi ${tag}' returning id`
    );
    const n = out.split("\n").filter((l) => l.trim().startsWith("{")).length;
    console.log(`forgot ${n}`);
    return;
  }

  throw new Fail(usage, 2);
});
