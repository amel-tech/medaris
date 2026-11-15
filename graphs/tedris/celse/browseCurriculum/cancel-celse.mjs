// Cancels one celse of a course that helpers/course.mjs made, as the course's hoca (the `muderris` account): the shared helper has no
// option for it, and tedris.celse.browseCurriculum needs a cancelled celse to show that the pager skips it and the popup marks it.
//
//   node ../tedris/celse/browseCurriculum/cancel-celse.mjs <tag> <n>    cancels the n-th celse of the course made under <tag> (1 is the first)
//
// Reads the ids from graphs/.local/made/<tag>.json (written by `course.mjs make <tag>`), the course's version from the API, and
// calls POST /lessons/{id}/cancel with it (the cancel route refuses a stale version). Prints `cancel-celse <title> cancelled`.
// A data-changing command: run it under the replay lock when you run it by hand. Nothing secret is printed.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Fail, LOCAL, must, run } from "../../../bindings/helpers/lib.mjs";

run("cancel-celse", async () => {
  const [tag, n, ...more] = process.argv.slice(2);
  const at = Number(n);
  if (!tag || !Number.isInteger(at) || at < 1 || more.length)
    throw new Fail("usage: cancel-celse.mjs <tag> <n>", 2);
  const made = JSON.parse(
    readFileSync(resolve(LOCAL, "made", `${tag}.json`), "utf8")
  );
  const id = made.lessons?.[at - 1];
  if (!id) throw new Fail(`the course made under ${tag} has no celse ${at}`);
  const course = (await must("SYSTEM_ADMIN", "GET", `/courses/${made.course}`))
    .body;
  const lesson = course.weeks
    .flatMap((w) => w.lessons)
    .find((l) => l.id === id);
  await must("MUDERRIS", "POST", `/lessons/${id}/cancel`, {
    version: course.version,
    reason: "Hoca yolda.",
  });
  console.log(`cancel-celse ${lesson?.title ?? id} cancelled`);
});
