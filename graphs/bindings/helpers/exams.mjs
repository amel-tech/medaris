// An online exam of a walk's own course (MDRS-299), made through the API as the course's hoca, and the talebe's sitting of it.
// The course comes from `course.mjs make <course tag>`; the exam lives and dies with it.
//
//   node helpers/exams.mjs make <tag> --course <course tag> [--title T] [--minutes n] [--questions n] [--instructions T]
//                               [--no-zeroth] [--incomplete] [--two-right] [--publish now|+<minutes>] [--late <minutes>] [--as ACCOUNT]
//   node helpers/exams.mjs take <tag> <ACCOUNT> [--zeroth <n>] [--right <n>] [--open]
//   node helpers/exams.mjs close <tag> [--as ACCOUNT]
//   node helpers/exams.mjs release <tag> [--as ACCOUNT]
//   node helpers/exams.mjs state <tag> [--as ACCOUNT]
//   node helpers/exams.mjs remove <tag>
//
// make    Opens the exam `Deneme sınavı <tag>` on the course, gives it a length (--minutes, default 20) and --questions (default 3)
//         complete SINGLE questions, "Soru n", each in the course's topic "Deneme konusu", whose right option is "Doğru n" beside "Yanlış n-a" and "Yanlış n-b", their points
//         shared as the code shares them (100 in all). The köşk's courses have no medrese whose zeroth question would apply, so the
//         course is given its own ("Bu hadisi daha önce duydun mu?": "Evet" / "Hayır" / "Emin değilim") unless --no-zeroth.
//         --incomplete leaves the last question without a right option, so publishing names it; --two-right gives question 1 a
//         second right option, "Doğru 1-b", so its form asks how it is answered and scored. --publish publishes it: `now`
//         opens it at once, `+<minutes>` at that many minutes from now (rounded to the minute), each with --late minutes to start
//         (default 10). Prints {"tag","title","course","exam","lesson","status","startsAt","latestStartAt","questions":[..]} on one
//         line and writes it to graphs/.local/made/<tag>.json, a data source (`{made.exam}`, `{made.lesson}`). Making a tag again
//         removes the old record first (the exam itself stays with its course until the course goes).
// take    The talebe sits it through the API, as the page does: answers the zeroth question with option --zeroth (default 1), starts,
//         answers the first --right questions (default all) with the right option and the rest with a wrong one, and finishes,
//         unless --open, which leaves the attempt running. Prints `take <tag> <ACCOUNT> FINISHED|IN_PROGRESS right=<n>/<m>`.
// close   "Sınavı erken kapat" as the hoca: no attempt may start or go on. Prints `close <tag> CLOSED`.
// release Opens the results to the talebe, as "Sonuçları talebelere aç" does (POST /lessons/:id/exam-results/release). The API
//         asks nothing of the exam's state: a scheduled or open exam is released too (EXM-RSLT-1). Prints `release <tag> released`.
// state   The exam's status as the hoca reads it: `state <tag> DRAFT|SCHEDULED|OPEN|CLOSED`.
// remove  Deletes the notifications that point at the exam's celse and the mails it sent (subject `Deneme sınavı <tag>`),
//         and the record. Run it before `course.mjs remove <course tag>`, which deletes the course with the exam and its celse.
//         Safe to run twice: `none`.

import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { query } from "./db.mjs";
import {
  accountKey,
  Fail,
  LOCAL,
  MAILPIT,
  must,
  options,
  run,
} from "./lib.mjs";

const MADE = resolve(LOCAL, "made");
const usage =
  "usage: exams.mjs make <tag> --course <course tag> [--title T] [--minutes n] [--questions n] [--instructions T] [--no-zeroth] [--incomplete] [--two-right] [--publish now|+<minutes>] [--late <minutes>] [--as ACCOUNT] | take <tag> <ACCOUNT> [--zeroth <n>] [--right <n>] [--open] | close <tag> [--as ACCOUNT] | release <tag> [--as ACCOUNT] | state <tag> [--as ACCOUNT] | remove <tag>";

const fileOf = (tag) => resolve(MADE, `${tag}.json`);
const titleOf = (tag) => `Deneme sınavı ${tag}`;
const read = (tag) => {
  const file = fileOf(tag);
  if (!existsSync(file))
    throw new Fail(`no exam recorded as ${tag}: run make first`);
  return JSON.parse(readFileSync(file, "utf8"));
};
const whole = (v, name, min = 0) => {
  if (!/^\d+$/.test(v ?? "") || Number(v) < min)
    throw new Fail(`--${name} is a whole number from ${min}, not ${v}`, 2);
  return Number(v);
};

const TOPIC = "Deneme konusu";
const ZEROTH = {
  text: "Bu hadisi daha önce duydun mu?",
  options: ["Evet", "Hayır", "Emin değilim"],
};

async function make(tag, o) {
  if (!o.course)
    throw new Fail(
      "--course <course tag> is needed (a course of course.mjs make)",
      2
    );
  const courseFile = fileOf(o.course);
  if (!existsSync(courseFile))
    throw new Fail(
      `no course recorded as ${o.course}: run course.mjs make ${o.course} first`
    );
  const course = JSON.parse(readFileSync(courseFile, "utf8")).course;
  const as = o.as ?? "MUDERRIS";
  const minutes = o.minutes === undefined ? 20 : whole(o.minutes, "minutes", 1);
  const count =
    o.questions === undefined ? 3 : whole(o.questions, "questions", 0);
  const late = o.late === undefined ? 10 : whole(o.late, "late", 0);
  if (o.publish !== undefined && !/^(now|\+\d+)$/.test(o.publish))
    throw new Fail(`--publish is now or +<minutes>, not ${o.publish}`, 2);
  if (existsSync(fileOf(tag))) await remove(tag);

  if (!o["no-zeroth"])
    await must(as, "PUT", `/courses/${course}/exam-zeroth-question`, ZEROTH);
  // a question is complete only with a topic: the course's "Deneme konusu", made once and picked by the exam
  const topics = (await must(as, "GET", `/courses/${course}/exam-topics`)).body;
  const topic =
    topics.find((t) => t.name === TOPIC)?.id ??
    (await must(as, "POST", `/courses/${course}/exam-topics`, { name: TOPIC }))
      .body.id;
  const title = o.title ?? titleOf(tag);
  const exam = (
    await must(as, "POST", `/courses/${course}/online-exams`, { title })
  ).body.id;
  let version = (await must(as, "GET", `/online-exams/${exam}`)).body.version;
  version = (
    await must(as, "PATCH", `/online-exams/${exam}`, {
      version,
      durationMinutes: minutes,
      topicIds: [topic],
      ...(o.instructions ? { instructions: o.instructions } : {}),
    })
  ).body.version;
  const questions = [];
  for (let n = 1; n <= count; n++) {
    const added = await must(as, "POST", `/online-exams/${exam}/questions`, {
      version,
    });
    version = added.body.version;
    const incomplete = o.incomplete && n === count;
    const saved = await must(
      as,
      "PUT",
      `/online-exams/${exam}/questions/${added.body.question.id}`,
      {
        version,
        text: `Soru ${n}`,
        options: [
          { text: `Doğru ${n}`, correct: !incomplete },
          ...(o["two-right"] && n === 1
            ? [{ text: `Doğru ${n}-b`, correct: true }]
            : []),
          { text: `Yanlış ${n}-a`, correct: false },
          { text: `Yanlış ${n}-b`, correct: false },
        ],
        answerMode: "SINGLE",
        topicIds: [topic],
      }
    );
    version = saved.body.version;
    questions.push({
      id: saved.body.question.id,
      text: `Soru ${n}`,
      right: `Doğru ${n}`,
    });
  }

  let draft = (await must(as, "GET", `/online-exams/${exam}`)).body;
  let lesson = null;
  if (o.publish !== undefined) {
    const body = { version: draft.version, latestStartMinutes: late };
    if (o.publish !== "now") {
      const at = new Date(Date.now() + Number(o.publish.slice(1)) * 60_000);
      at.setUTCSeconds(0, 0);
      body.startsAt = at.toISOString();
    }
    draft = (await must(as, "POST", `/online-exams/${exam}/publish`, body))
      .body;
    lesson = (await must(as, "GET", `/online-exams/${exam}/results`)).body.exam
      .lessonId;
  }
  const made = {
    tag,
    title,
    course,
    courseTag: o.course,
    as: accountKey(as),
    exam,
    lesson,
    status: draft.status,
    startsAt: draft.startsAt ?? null,
    latestStartAt: draft.latestStartAt ?? null,
    problems: (draft.problems ?? []).map((p) => p.kind),
    questions,
  };
  mkdirSync(MADE, { recursive: true });
  writeFileSync(fileOf(tag), `${JSON.stringify(made)}\n`);
  return JSON.stringify(made);
}

async function take(tag, who, o) {
  const made = read(tag);
  if (!made.lesson)
    throw new Fail(`${tag} is not published: make it with --publish`);
  const base = `/lessons/${made.lesson}/online-exam`;
  const briefing = (await must(who, "GET", base)).body;
  const z = o.zeroth === undefined ? 1 : whole(o.zeroth, "zeroth", 1);
  const zopt = briefing.zeroth?.options?.[z - 1];
  if (!zopt) throw new Fail(`the zeroth question has no option ${z}`, 2);
  await must(who, "PUT", `${base}/zeroth-answer`, { optionId: zopt.id });
  const holderId = `walk-${randomBytes(8).toString("hex")}`;
  const attempt = (await must(who, "POST", `${base}/attempt`, { holderId }))
    .body;
  const total = attempt.questions.length;
  const right =
    o.right === undefined ? total : Math.min(whole(o.right, "right"), total);
  const byId = new Map(made.questions.map((q) => [q.id, q]));
  let seq = 0;
  // in the talebe's own order: the first `right` of them are answered right
  for (const [i, q] of attempt.questions.entries()) {
    const want = byId.get(q.id)?.right;
    const pick =
      i < right
        ? q.options.find((x) => x.text === want)
        : q.options.find((x) => x.text !== want);
    if (!pick) throw new Fail(`question ${q.number} has no option to pick`);
    await must(who, "PUT", `${base}/attempt/answers/${q.id}`, {
      holderId,
      seq: ++seq,
      optionIds: [pick.id],
      skipped: false,
      currentQuestionId: q.id,
    });
  }
  let status = attempt.status;
  if (!o.open)
    status = (await must(who, "POST", `${base}/attempt/finish`, { holderId }))
      .body.status;
  return `take ${tag} ${accountKey(who)} ${status} right=${right}/${total}`;
}

async function close(tag, o) {
  const made = read(tag);
  await must(o.as ?? made.as, "POST", `/online-exams/${made.exam}/close`);
  return `close ${tag} ${(await must(o.as ?? made.as, "GET", `/online-exams/${made.exam}`)).body.status}`;
}

async function release(tag, o) {
  const made = read(tag);
  if (!made.lesson)
    throw new Fail(`${tag} is not published: make it with --publish`);
  await must(
    o.as ?? made.as,
    "POST",
    `/lessons/${made.lesson}/exam-results/release`
  );
  const r = (
    await must(o.as ?? made.as, "GET", `/online-exams/${made.exam}/results`)
  ).body;
  return `release ${tag} ${r.released ? "released" : "not released"}`;
}

async function state(tag, o) {
  const made = read(tag);
  return `state ${tag} ${(await must(o.as ?? made.as, "GET", `/online-exams/${made.exam}`)).body.status}`;
}

async function remove(tag) {
  const file = fileOf(tag);
  if (!existsSync(file)) return "none";
  const made = JSON.parse(readFileSync(file, "utf8"));
  // publishing tells each talebe and the course's calendar feed; no route deletes a notification
  const targets = [made.exam, made.lesson]
    .filter(Boolean)
    .map((x) => `'${x}'`)
    .join(", ");
  if (targets)
    await query(`delete from notifications where target_id in (${targets})`);
  const q = `subject:"${made.title}"`;
  const res = await fetch(
    `${MAILPIT}/api/v1/search?query=${encodeURIComponent(q)}`,
    {
      method: "DELETE",
      signal: AbortSignal.timeout(30_000),
    }
  );
  if (!res.ok) throw new Fail(`Mailpit answered ${res.status} to the delete`);
  rmSync(file);
  return `remove ${tag} ${made.exam}`;
}

run("exams", async () => {
  const [verb, tag, ...rest] = process.argv.slice(2);
  if (!verb || !tag) throw new Fail(usage, 2);
  let out;
  if (verb === "make") {
    const o = options(rest, {
      values: [
        "course",
        "title",
        "minutes",
        "questions",
        "instructions",
        "publish",
        "late",
        "as",
      ],
      flags: ["no-zeroth", "incomplete", "two-right"],
    });
    if (o.rest.length) throw new Fail(usage, 2);
    out = await make(tag, o);
  } else if (verb === "take") {
    const o = options(rest, { values: ["zeroth", "right"], flags: ["open"] });
    if (o.rest.length !== 1) throw new Fail(usage, 2);
    out = await take(tag, o.rest[0], o);
  } else if (verb === "close" || verb === "release" || verb === "state") {
    const o = options(rest, { values: ["as"] });
    if (o.rest.length) throw new Fail(usage, 2);
    out = await { close, release, state }[verb](tag, o);
  } else if (verb === "remove") {
    if (rest.length) throw new Fail(usage, 2);
    out = await remove(tag);
  } else throw new Fail(usage, 2);
  console.log(out);
});
