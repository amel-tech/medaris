// An exam for nazar.evaluation.examScores to enter scores on, planned in a course the walk made with helpers/course.mjs, and the way back.
//
//   node ../nazar/evaluation/examScores/exam-data.mjs plan <tag> [--max <n>] [--released] [--hoca <ACCOUNT>]
//
// <tag> is the tag the course was made under (`course.mjs make <tag> --weeks 1 --lessons 1 --hoca MUDERRIS --talebe ...`): this reads
// graphs/.local/made/<tag>.json and writes into it, so `course.mjs remove <tag>` takes the exam away with the course and clears the notifications
// that point at it. Nothing is removed here: DELETE /courses/:id (as the başnazım, course.mjs remove) deletes the exam and its results with
// the course, and a second `plan` on a course that already has its exam does nothing. The audit rows the writes leave (exam_result.save,
// exam.release) stay: no route removes them.
//
// What `plan` does, through tedrisat's HTTP API as the course's hoca (`MUDERRIS`, or --hoca), as the planner's "Sınav" does
// (POST /courses/:id/sessions/batch with `exam`, tedrisat-sessions.yaml createSessionBatch):
//   - plans one celse titled "Ara sınav", out of 100 (--max), yesterday at 10:00 in Istanbul, so it is over: scores are entered after an
//     exam and nothing in tedrisat asks for a time (exam-result-rules). A celse already over sends no EXAM_SCHEDULED notification, and no
//     invitation, so the talebe's mailboxes stay as they were. It lands in "Hafta 1" (placeInWeeks takes a date before the first dated week
//     to week 1).
//   - writes `exam` (the celse's id), `examTitle` and `examMax` into the made file and adds the celse's id to its `lessons`.
//   - with --released: also enters 90 for the first of the made file's talebe and releases the results (POST .../exam-results/release), so
//     the walk meets an exam whose results are open already. A release cannot be taken back (exam-results-are-released-once): the course
//     is the walk's own, and course.mjs remove deletes it.
// Prints `exam-data plan <lessonId> out of <max>` (and ` released` with --released). Nothing secret is printed.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  Fail,
  LOCAL,
  must,
  options,
  run,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const DAY = 86_400_000;
const TITLE = "Ara sınav";
const usage =
  "usage: exam-data.mjs plan <tag> [--max <n>] [--released] [--hoca <ACCOUNT>]";

// yesterday's calendar day in Istanbul, as YYYY-MM-DD, and its ISO weekday (1 = Monday)
const yesterday = () => {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() - DAY));
  const [y, m, d] = day.split("-").map(Number);
  return { day, weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7 };
};

run("exam-data", async () => {
  const o = options(process.argv.slice(2), {
    values: ["max", "hoca"],
    flags: ["released"],
  });
  const [verb, tag, ...extra] = o.rest;
  if (verb !== "plan" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,40}$/.test(tag ?? ""))
    throw new Fail(usage, 2);
  if (extra.length) throw new Fail(usage, 2);
  const max = o.max === undefined ? 100 : Number(o.max);
  if (!Number.isInteger(max) || max < 1 || max > 1000)
    throw new Fail("--max is a whole number from 1 to 1000", 2);
  const hoca = o.hoca ?? "MUDERRIS";

  const file = resolve(LOCAL, "made", `${tag}.json`);
  let made;
  try {
    made = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new Fail(
      `${file} is missing: make the course first (helpers/course.mjs make ${tag} --weeks 1 --lessons 1 ...)`
    );
  }
  if (made.exam) {
    console.log(`exam-data plan ${made.exam} out of ${made.examMax} (again)`);
    return;
  }

  const { day, weekday } = yesterday();
  const planned = (
    await must(hoca, "POST", `/courses/${made.course}/sessions/batch`, {
      weekdays: [weekday],
      startTime: "10:00",
      timeZone: "Europe/Istanbul",
      startDate: day,
      count: 1,
      title: TITLE,
      durationMinutes: 60,
      exam: { maxScore: max },
    })
  ).body;
  const lessonId = planned.lessons?.[0]?.id;
  if (!lessonId) throw new Fail("the batch answered with no celse");
  made.exam = lessonId;
  made.examTitle = TITLE;
  made.examMax = max;
  made.lessons = [...(made.lessons ?? []), lessonId];
  writeFileSync(file, `${JSON.stringify(made)}\n`, { mode: 0o600 });

  let said = "";
  if (o.released) {
    const [first] = Object.keys(made.talebe ?? {});
    if (!first) throw new Fail("--released needs a talebe in the course");
    await must(
      hoca,
      "PUT",
      `/lessons/${lessonId}/exam-results/${subOf(first)}`,
      {
        score: 90,
        absent: false,
      }
    );
    await must(hoca, "POST", `/lessons/${lessonId}/exam-results/release`);
    said = " released";
  }
  console.log(`exam-data plan ${lessonId} out of ${max}${said}`);
});
