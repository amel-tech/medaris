// The walk helper of nazar.curriculum.hideRestore: what another tab does while a question is open, and what a hide or a restore leaves in
// the database. It is the binding's `before` hooks and `effects`: `node ../nazar/curriculum/hideRestore/hide.mjs ...`, run from graphs/bindings/.
// The course is the walk's own, made by helpers/course.mjs under the tag `hideRestore` and recorded in graphs/.local/made/hideRestore.json.
//
//   race <phase> <mode>   What the hoca does "in another tab" before the walk presses the button she was asked about. `mode` is the scenario's
//                         `meanwhile` (the flow's `race`): none (does nothing), hide or restore.
//                           week    hide   hides the first live week (POST /courses/<id>/weeks/<week>/hide, as MUDERRIS), so the window that is open
//                                          for it is answered with WEEK_NOT_FOUND
//                           session hide   hides the first live celse of the first live week (DELETE /lessons/<id>), so LESSON_NOT_FOUND
//                           archive restore  brings back every row the Arşiv lists with `canRestore` (POST /archive/<type>/<id>/restore, a week
//                                          before the celses that hang from it, until none is left), so the row the walk presses is
//                                          ARCHIVE_ITEM_NOT_FOUND
//                         Any other pair prints `race <phase> <mode>: nothing to do`. Each is safe to run twice: a week or a celse already hidden
//                         or restored is 404 or 409, which is fine here.
//   state                 What a hide or a restore leaves, in one line, read from the database (no route lists a celse under a hidden week, and
//                         none counts hidden rows): `state kept=yes live-under-hidden=none held-back=yes`
//                           kept=yes             the course still has every week and celse it was made with: nothing was deleted
//                           live-under-hidden    none, or n: a live celse under a hidden week (a week hides its celses at one stroke, so none)
//                           held-back            yes while a celse is hidden under a week that is shown (the one hidden on its own earlier
//                                                and left behind when its week came back), else none
//
// Only tedrisat's HTTP API is used, except `state`, which is SQL through helpers/db.mjs (the one use: no route says it). Everything is told in one
// short line on stdout; a refusal is one line on stderr and a non-zero exit. Nothing secret is printed. Run by hand, every command takes the
// replay lock (CONVENTIONS, round R2).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { query } from "../../../bindings/helpers/db.mjs";
import {
  call,
  Fail,
  LOCAL,
  must,
  run,
} from "../../../bindings/helpers/lib.mjs";

const TAG = "hideRestore";
const HOCA = "MUDERRIS";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const usage =
  "usage: hide.mjs race week|session|archive none|hide|restore | state";

function madeCourse() {
  let made;
  try {
    made = JSON.parse(
      readFileSync(resolve(LOCAL, "made", `${TAG}.json`), "utf8")
    );
  } catch {
    throw new Fail(
      `graphs/.local/made/${TAG}.json does not exist: helpers/course.mjs make ${TAG} has not run`
    );
  }
  if (!UUID.test(made.course ?? ""))
    throw new Fail(`${TAG}.json holds no course id`);
  return made;
}

// the live weeks of the course in the order the page draws them: orderIndex, then weekNumber (curriculum.ts:27-48)
async function liveWeeks(course) {
  const body = (await must(HOCA, "GET", `/courses/${course}`)).body;
  return [...(body.weeks ?? [])]
    .sort((a, b) => a.orderIndex - b.orderIndex || a.weekNumber - b.weekNumber)
    .map((w) => ({
      ...w,
      lessons: [...(w.lessons ?? [])].sort(
        (a, b) => a.orderIndex - b.orderIndex
      ),
    }));
}

async function race(phase, mode) {
  if (mode === "none") return "race none";
  const { course } = madeCourse();
  if (phase === "week" && mode === "hide") {
    const week = (await liveWeeks(course))[0];
    if (!week) return "race week hide: no live week";
    const r = await call(
      HOCA,
      "POST",
      `/courses/${course}/weeks/${week.id}/hide`
    );
    if (![200, 201, 404, 409].includes(r.status))
      throw new Fail(`hiding the week answered ${r.status}`);
    return `race week hide ${week.title}`;
  }
  if (phase === "session" && mode === "hide") {
    const lesson = (await liveWeeks(course)).flatMap((w) => w.lessons)[0];
    if (!lesson) return "race session hide: no live celse";
    const r = await call(HOCA, "DELETE", `/lessons/${lesson.id}`);
    if (![200, 204, 404].includes(r.status))
      throw new Fail(`hiding the celse answered ${r.status}`);
    return `race session hide ${lesson.title}`;
  }
  if (phase === "archive" && mode === "restore") {
    let brought = 0;
    for (let round = 0; round < 6; round++) {
      const list = (
        await must(HOCA, "GET", `/courses/${course}/archive?limit=50`)
      ).body;
      const rows = (list.items ?? []).filter((i) => i.canRestore);
      if (!rows.length) break;
      // a week first: its celses come back with it, and a celse hidden on its own earlier then gets a row of its own
      const row = rows.find((i) => i.type === "week") ?? rows[0];
      const r = await call(
        HOCA,
        "POST",
        `/archive/${row.type}/${row.id}/restore`
      );
      if (![200, 201, 404, 409].includes(r.status))
        throw new Fail(
          `restoring ${row.type} ${row.title} answered ${r.status}`
        );
      brought++;
    }
    return `race archive restore ${brought}`;
  }
  return `race ${phase} ${mode}: nothing to do`;
}

async function state() {
  const made = madeCourse();
  const id = made.course;
  const out = await query(
    `select
       (select count(*) from course_weeks where course_id = '${id}') as weeks,
       (select count(*) from lessons l join course_weeks w on w.id = l.week_id where w.course_id = '${id}') as lessons,
       (select count(*) from lessons l join course_weeks w on w.id = l.week_id
         where w.course_id = '${id}' and w.archived_at is not null and l.archived_at is null) as live_under_hidden,
       (select count(*) from lessons l join course_weeks w on w.id = l.week_id
         where w.course_id = '${id}' and w.archived_at is null and l.archived_at is not null) as held_back`
  );
  const row = JSON.parse(out.trim().split("\n")[0]);
  const kept =
    Number(row.weeks) === (made.weeks ?? []).length &&
    Number(row.lessons) === (made.lessons ?? []).length;
  const under = Number(row.live_under_hidden);
  return `state kept=${kept ? "yes" : "NO"} live-under-hidden=${under === 0 ? "none" : under} held-back=${Number(row.held_back) > 0 ? "yes" : "none"}`;
}

run("hide", async () => {
  const [verb, a, b, ...rest] = process.argv.slice(2);
  if (
    verb === "race" &&
    ["week", "session", "archive"].includes(a) &&
    ["none", "hide", "restore"].includes(b) &&
    !rest.length
  ) {
    console.log(await race(a, b));
  } else if (verb === "state" && a === undefined) {
    console.log(await state());
  } else throw new Fail(usage, 2);
});
