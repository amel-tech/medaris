// What nizam.courses.manageSessions needs besides a course of its own (helpers/course.mjs makes that), run as the `before` of a state of the
// stale and gone-elsewhere walks, so that "Kaydet" or the confirmation asks about a course that is no longer as the page read it:
//
//   node ../nizam/courses/manageSessions/sessions.mjs bump <0|1>
//   node ../nizam/courses/manageSessions/sessions.mjs gone <0|1>
//
// Both read the course the walk made, graphs/.local/made/nmSessions.json (course.mjs make nmSessions --weeks 1 --lessons 2 --start -1: the first
// celse is over, the second is ahead), and act through tedrisat's HTTP API as the course's hoca (MUDERRIS), a second person who saves the course
// while the köşk's nazımı has the page open. `0` does nothing, so a binding can run the verb in every scenario and let a variable say whether
// anything happens. Every verb is safe to run twice. No SQL.
//
//   bump 1   someone else saves the course: the first celse (the one that is over) gets a source line (PATCH /lessons/:id with `kaynak`, a field
//            no screen of Celseler shows), which raises the course's version, so that a link, a time, an in-person mark or a cancel written at the
//            version the page holds is refused with COURSE_VERSION_CONFLICT. The celse ahead is left as it was, so no row of the page changes.
//   gone 1   someone else cancels the celse that is ahead (POST /lessons/:id/cancel at the current version, no note), so that a stream link
//            written for it is refused with LESSON_CANCELLED (the stream write carries no version). If it is cancelled already, nothing is done.
//
// Prints `bump <n>` or `gone <n>`. Nothing is removed here: course.mjs remove deletes the course and with it everything these write. Run it under
// the replay lock when walks are running and you run it by hand: it changes data.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  Fail,
  LOCAL,
  must,
  options,
  run,
} from "../../../bindings/helpers/lib.mjs";

const TAG = "nmSessions";
const FILE = resolve(LOCAL, "made", `${TAG}.json`);
const WHO = "MUDERRIS";
const usage = "usage: sessions.mjs bump|gone <0|1>";

const made = () => {
  try {
    return JSON.parse(readFileSync(FILE, "utf8"));
  } catch {
    throw new Fail(
      `${FILE} does not exist: run helpers/course.mjs make ${TAG} first, in this walk's setup`
    );
  }
};

const courseOf = async (id) => (await must(WHO, "GET", `/courses/${id}`)).body;
const lessonOf = (course, id) =>
  course.weeks.flatMap((w) => w.lessons).find((l) => l.id === id);

run("sessions", async () => {
  const o = options(process.argv.slice(2));
  const [verb, on] = o.rest;
  if (
    !["bump", "gone"].includes(verb) ||
    !["0", "1"].includes(on) ||
    o.rest.length !== 2
  )
    throw new Fail(usage, 2);
  if (on === "1") {
    const { course: id, lessons } = made();
    const course = await courseOf(id);
    if (verb === "bump") {
      await must(WHO, "PATCH", `/lessons/${lessons[0]}`, {
        version: course.version,
        kaynak: "Başka bir sayfadan kaydedildi.",
      });
    } else if (!lessonOf(course, lessons[1])?.cancelledAt) {
      await must(WHO, "POST", `/lessons/${lessons[1]}/cancel`, {
        version: course.version,
      });
    }
  }
  console.log(`${verb} ${on}`);
});
