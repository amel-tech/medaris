// What nazar.sessions.cancel needs besides a course of its own (helpers/course.mjs makes that), run as the binding's `setup` and as the
// "meanwhile" of a refusal walk:
//
//   node ../nazar/sessions/cancel/cancel.mjs link [--as <ACCOUNT>]
//   node ../nazar/sessions/cancel/cancel.mjs meanwhile none|moved|cancelled|revoke [--as <ACCOUNT>] [--nazir <ACCOUNT>]
//
// Both read the course the walk made, graphs/.local/made/cancelCelse.json (course.mjs make cancelCelse ...), and act through tedrisat's HTTP
// API as the course's hoca (--as, default MUDERRIS; the başmüderris for a course of the medrese).
//
//   link        gives the first celse a meeting link (PATCH /lessons/:id at the course's version). course.mjs makes celses with none, and
//               the make-up this flow adds has none either (CANCEL-1): with a link on the celse that is cancelled, the walk can see that
//               the make-up does not get it. Prints `cancel link <lesson>`.
//   meanwhile   what somebody else does while the dialog is open, so that "Celseyi iptal et" asks about a course that is no longer as the
//               page read it. Every mode is safe to run twice. Prints `meanwhile <mode>`.
//                 none       nothing (the walks that have no race: a binding's `before` runs it all the same)
//                 moved      the course is saved: the second celse gets another meeting link, which bumps the course's version, so a
//                            cancel with no make-up is refused with COURSE_VERSION_CONFLICT (a cancel with a make-up is not: CANCEL-2)
//                 cancelled  the same celse is cancelled by the hoca elsewhere (POST /lessons/:id/cancel at the current version, no
//                            make-up): the page's cancel is refused with the same COURSE_VERSION_CONFLICT when it names no make-up, and,
//                            with one, the make-up is made and the cancel is refused with LESSON_ALREADY_CANCELLED
//                 revoke     the ders nazırı's post loses every permission (PATCH /courses/:id/nazirs/:postId with an empty set, as the
//                            hoca does on Ders nazırları), so the next write is refused with AUTHZ_FORBIDDEN
//
// No SQL. Nothing is removed here: course.mjs remove deletes the course and with it everything these write. Run it under the replay lock
// when walks are running and you run it by hand: it changes data.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  accountKey,
  Fail,
  LOCAL,
  must,
  options,
  run,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const TAG = "cancelCelse";
const FILE = resolve(LOCAL, "made", `${TAG}.json`);
const MEETING = "https://meet.example.test/iptal-denemesi";
const OTHER_MEETING = "https://meet.example.test/baska-celse";
const ELSEWHERE = "Başka bir hoca iptal etti.";
const usage =
  "usage: cancel.mjs link [--as <ACCOUNT>] | meanwhile none|moved|cancelled|revoke [--as <ACCOUNT>] [--nazir <ACCOUNT>]";

const made = () => {
  try {
    return JSON.parse(readFileSync(FILE, "utf8"));
  } catch {
    throw new Fail(
      `${FILE} does not exist: run helpers/course.mjs make ${TAG} first, in this walk's setup`
    );
  }
};

const courseOf = async (who, id) =>
  (await must(who, "GET", `/courses/${id}`)).body;
const lessonOf = (course, id) =>
  course.weeks.flatMap((w) => w.lessons).find((l) => l.id === id);

run("cancel", async () => {
  const [verb, ...rest] = process.argv.slice(2);
  if (verb === "link") {
    const o = options(rest, { values: ["as"] });
    if (o.rest.length) throw new Fail(usage, 2);
    const who = o.as ?? "MUDERRIS";
    const { course: id, lessons } = made();
    const course = await courseOf(who, id);
    await must(who, "PATCH", `/lessons/${lessons[0]}`, {
      version: course.version,
      meetingUrl: MEETING,
    });
    console.log(`cancel link ${lessons[0]}`);
    return;
  }
  if (verb === "meanwhile") {
    const [mode, ...args] = rest;
    const o = options(args, { values: ["as", "nazir"] });
    if (
      !["none", "moved", "cancelled", "revoke"].includes(mode) ||
      o.rest.length
    )
      throw new Fail(usage, 2);
    const who = o.as ?? "MUDERRIS";
    const { course: id, lessons } = made();
    if (mode === "none") {
      // nothing happens elsewhere
    } else if (mode === "moved") {
      const course = await courseOf(who, id);
      await must(who, "PATCH", `/lessons/${lessons[1]}`, {
        version: course.version,
        meetingUrl: OTHER_MEETING,
      });
    } else if (mode === "cancelled") {
      const course = await courseOf(who, id);
      if (!lessonOf(course, lessons[0])?.cancelledAt)
        await must(who, "POST", `/lessons/${lessons[0]}/cancel`, {
          version: course.version,
          reason: ELSEWHERE,
        });
    } else {
      const nazir = o.nazir ?? "dersNazir";
      const list = (await must(who, "GET", `/courses/${id}/nazirs`)).body;
      const post = (list.items ?? []).find((p) => p.user?.id === subOf(nazir));
      if (!post)
        throw new Fail(
          `${accountKey(nazir)} holds no post in ${id}: nothing to revoke`
        );
      await must(who, "PATCH", `/courses/${id}/nazirs/${post.id}`, {
        permissions: [],
        endsAt: null,
      });
    }
    console.log(`meanwhile ${mode}`);
    return;
  }
  throw new Fail(usage, 2);
});
