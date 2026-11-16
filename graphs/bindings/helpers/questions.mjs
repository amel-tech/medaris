// The walk data of nazar.questions.answer and of the ders nazırı page of nazar.access.dersNazirPages, made and removed through tedrisat's HTTP API: questions the spare talebe asked in a
// course of the walk's own, some of them answered by its hoca. It is the binding's `setup`, `teardown`, events and effects:
// `node helpers/questions.mjs <verb> ...` from graphs/bindings/.
//
//   up <tag> [--talebe ACCOUNT] [--hoca ACCOUNT] [--waiting n] [--answered n]
//        The course is the one `helpers/course.mjs make <tag> ... --talebe <ACCOUNT>` made (graphs/.local/made/<tag>.json), whose
//        talebe holds a seat. The talebe asks the waiting questions first, then the answered ones, each answered at once by the hoca
//        (POST /lessons/:id/questions, then PUT /questions/:id/answer), all on the course's first celse ("Hafta 1 · Celse 1"). The
//        first answered question is the e2e's (apps/nazar/e2e/questions-seed.ts): "Muzâride hurûf-i mudâraa kaç tanedir?", answered
//        "Dört tanedir: eyn harfleri."; the first waiting one is "Fe‘ale bâbında mâzînin aynü’l-fiili neden fethalıdır?". Further
//        ones are "Deneme sorusu NN" and "Deneme cevabı NN". Writes graphs/.local/made/<tag>Q.json {tag, course, lesson, talebe,
//        hoca, followed, waiting: [ids], answered: [ids]}, which a binding reads as a data source; `followed` is the id of the first
//        card the page draws (the first waiting question, else the oldest answered one). Defaults: the talebe APPLICANT_E, the hoca
//        MUDERRIS, one waiting, one answered. Prints `questions up <tag>: <n> waiting, <m> answered`.
//   drop <tag>
//        The talebe deletes the followed question (DELETE /questions/:id, which the author may do at any time), as the talebe does
//        in tedris while the hoca's page is open. Prints `questions drop <tag>`; a question already gone is fine.
//   count <tag>
//        Reads the course's questions as the hoca (GET /courses/:id/questions, every page) and prints `questions count <tag>: <n>
//        waiting, <m> answered`. A read, for an `effects` check.
//   down <tag>
//        Removes graphs/.local/made/<tag>Q.json. The questions themselves go with the course: `helpers/course.mjs remove <tag>`
//        (the API's course delete runs course-purge.ts, which deletes lesson_questions before the lessons). `none` when there is
//        nothing recorded.
//
// Only the API is used. The seed's own question (TALEBE's, on "Bina ve İzhar Şerhi") is never touched. Run it under the replay lock
// when walks are running and you run it by hand. Nothing secret is printed.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { Fail, LOCAL, must, options, run } from "./lib.mjs";

const MADE = resolve(LOCAL, "made");
const usage =
  "usage: questions.mjs up <tag> [--talebe ACCOUNT] [--hoca ACCOUNT] [--waiting n] [--answered n] | drop <tag> | count <tag> | down <tag>";

const WAITING = "Fe‘ale bâbında mâzînin aynü’l-fiili neden fethalıdır?";
const ANSWERED = "Muzâride hurûf-i mudâraa kaç tanedir?";
const ANSWER = "Dört tanedir: eyn harfleri.";

const courseFile = (tag) => resolve(MADE, `${tag}.json`);
const dataFile = (tag) => resolve(MADE, `${tag}Q.json`);
const pad = (n) => String(n).padStart(2, "0");

function read(file, hint) {
  if (!existsSync(file)) throw new Fail(`${file} does not exist: ${hint}`);
  return JSON.parse(readFileSync(file, "utf8"));
}

const count = (value, name) => {
  const n = value === undefined ? undefined : Number(value);
  if (n !== undefined && !(Number.isInteger(n) && n >= 0 && n <= 60))
    throw new Fail(`--${name} is a whole number from 0 to 60, not ${value}`, 2);
  return n;
};

async function up(tag, o) {
  const course = read(
    courseFile(tag),
    `run helpers/course.mjs make ${tag} ... --talebe <ACCOUNT> first`
  );
  const lesson = course.lessons?.[0];
  if (!course.course || !lesson)
    throw new Fail(`${courseFile(tag)} has no course or no celse`);
  const talebe = o.talebe ?? "APPLICANT_E";
  const hoca = o.hoca ?? "MUDERRIS";
  const nWaiting = count(o.waiting, "waiting") ?? 1;
  const nAnswered = count(o.answered, "answered") ?? 1;
  const ask = async (body) =>
    (await must(talebe, "POST", `/lessons/${lesson}/questions`, { body })).body
      .id;
  const waiting = [];
  const answered = [];
  // the waiting ones are asked first, so that after one of them is answered and the page is read again it is still the first card
  for (let i = 0; i < nWaiting; i++)
    waiting.push(
      await ask(i === 0 ? WAITING : `Deneme sorusu ${pad(i + 1)} b`)
    );
  for (let i = 0; i < nAnswered; i++) {
    const id = await ask(i === 0 ? ANSWERED : `Deneme sorusu ${pad(i + 1)}`);
    await must(hoca, "PUT", `/questions/${id}/answer`, {
      body: i === 0 ? ANSWER : `Deneme cevabı ${pad(i + 1)}`,
    });
    answered.push(id);
  }
  mkdirSync(MADE, { recursive: true, mode: 0o700 });
  writeFileSync(
    dataFile(tag),
    `${JSON.stringify({
      tag,
      course: course.course,
      lesson,
      talebe,
      hoca,
      followed: waiting[0] ?? answered[0] ?? null,
      waiting,
      answered,
    })}\n`,
    { mode: 0o600 }
  );
  console.log(
    `questions up ${tag}: ${waiting.length} waiting, ${answered.length} answered`
  );
}

async function drop(tag) {
  const data = read(dataFile(tag), `run questions.mjs up ${tag} first`);
  if (!data.followed) throw new Fail(`${tag} has no question to drop`);
  await must(
    data.talebe,
    "DELETE",
    `/questions/${data.followed}`,
    undefined,
    [404]
  );
  console.log(`questions drop ${tag}`);
}

async function counts(tag) {
  const data = read(dataFile(tag), `run questions.mjs up ${tag} first`);
  let cursor;
  let waiting = 0;
  let answered = 0;
  do {
    const page = (
      await must(
        data.hoca,
        "GET",
        `/courses/${data.course}/questions?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`
      )
    ).body;
    for (const q of page.items ?? []) q.answer ? answered++ : waiting++;
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  console.log(
    `questions count ${tag}: ${waiting} waiting, ${answered} answered`
  );
}

function down(tag) {
  const file = dataFile(tag);
  if (!existsSync(file)) return console.log("none");
  rmSync(file);
  console.log(`questions down ${tag}`);
}

run("questions", async () => {
  const o = options(process.argv.slice(2), {
    values: ["talebe", "hoca", "waiting", "answered"],
  });
  const [verb, tag, ...extra] = o.rest;
  if (!verb || !tag || extra.length) throw new Fail(usage, 2);
  if (verb === "up") return up(tag, o);
  if (verb === "drop") return drop(tag);
  if (verb === "count") return counts(tag);
  if (verb === "down") return down(tag);
  throw new Fail(usage, 2);
});
