// Makes what tedris.learn.homeworkMemorize needs and no shared helper makes: the work a talebe handed in BEFORE the müderris switched the
// homework to "Ezber", which the card keeps (the list "Teslim ettiğin dosyalar" and the hoca's review).
//
//   node ../tedris/learn/homeworkMemorize/memorize-data.mjs earlier <tag> <ACCOUNT> note|reviewed --description <text> --note <text> [--review <text>]
//
// `<tag>` is the tag of a course helpers/course.mjs made (graphs/.local/made/<tag>.json) and `<ACCOUNT>` the talebe who holds a seat in it.
// On the course's first celse, through tedrisat's HTTP API, in this order:
//   1. the müderris sets a FILE homework (PUT /lessons/:id/assignment, kind FILE) with the description;
//   2. the talebe saves a note on it (PUT /lessons/:id/submission), which makes the talebe's LessonSubmission;
//   3. `reviewed` only: the müderris sends the review (PUT /courses/:id/submissions/:submissionId/review, a note and no file);
//   4. the müderris switches the homework to "Ezber" (PUT /lessons/:id/assignment, kind MEMORIZE), which keeps the talebe's work.
// No file is uploaded: file storage answers 503 on the local stack. The talebe's note and the review's note are the binding's `--note`
// and `--review`, so that they are written once, in the binding's samples. The course is removed by `course.mjs remove <tag>`, which takes
// the hand-in and the review with it, and the notification the review sent (SUBMISSION_REVIEWED) is cleared by the same command.
// Nothing here is idempotent on its own: `course.mjs make` starts every walk from a new course. Prints
// `memorize-data earlier <tag> <mode> (celse <id>)`. Nothing secret is printed.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  accountKey,
  Fail,
  LOCAL,
  must,
  options,
  run,
} from "../../../bindings/helpers/lib.mjs";

const usage =
  "usage: memorize-data.mjs earlier <tag> <ACCOUNT> note|reviewed --description <text> --note <text> [--review <text>]";

run("memorize-data", async () => {
  const { rest, description, note, review } = options(process.argv.slice(2), {
    values: ["description", "note", "review"],
  });
  const [mode, tag, talebe, shape, ...more] = rest;
  if (mode !== "earlier" || !tag || !talebe || more.length)
    throw new Fail(usage, 2);
  if (!["note", "reviewed"].includes(shape))
    throw new Fail(`the shape is note or reviewed, not ${shape}`, 2);
  if (!description || !note) throw new Fail(usage, 2);
  if (shape === "reviewed" && !review)
    throw new Fail("reviewed needs --review <text>", 2);

  const file = resolve(LOCAL, "made", `${tag}.json`);
  let made;
  try {
    made = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new Fail(`${file} is not there: run course.mjs make ${tag} first`);
  }
  const lesson = made.lessons?.[0];
  if (!made.course || !lesson)
    throw new Fail(`${file} holds no course or celse`);

  await must("muderris", "PUT", `/lessons/${lesson}/assignment`, {
    kind: "FILE",
    description,
  });
  const handedIn = (
    await must(talebe, "PUT", `/lessons/${lesson}/submission`, { note })
  ).body;
  if (shape === "reviewed")
    await must(
      "muderris",
      "PUT",
      `/courses/${made.course}/submissions/${handedIn.id}/review`,
      { note: review }
    );
  await must("muderris", "PUT", `/lessons/${lesson}/assignment`, {
    kind: "MEMORIZE",
    description,
  });
  console.log(
    `memorize-data earlier ${tag} ${shape} (celse ${lesson}, ${accountKey(talebe)})`
  );
});
