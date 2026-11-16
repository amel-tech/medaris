// Makes what tedris.course.grades needs and the seed has not got, and takes it away again (the flow's setup and teardown): a published
// course of its own in the second köşk, the walk's talebe holding a seat in it, and, as the hoca, two exams, two memorisation
// homeworks and the results and marks the Notlarım tab reads.
//
//   node ../tedris/course/grades/grades-data.mjs make full     the course, its two exams, two memorisations, the results and marks
//   node ../tedris/course/grades/grades-data.mjs make bare     the course with a week and nothing to grade (the empty note)
//   node ../tedris/course/grades/grades-data.mjs passive on|off  the hoca's role rows are revoked or given back (a passive scope)
//   node ../tedris/course/grades/grades-data.mjs remove        the course and everything under it is deleted
//
// What `make full` leaves, as tedrisat's own routes make it (the exam actions of tedrisat-learning.yaml, as the müderris):
//   - "Ara sınav", out of 20, three days ago: 17 entered for the talebe, and the results RELEASED (POST /lessons/:id/exam-results/release)
//   - "Dönem sınavı", out of 100, yesterday: 64 entered for the talebe, the results NOT released. This is e2e exam#2's closed exam: the
//     score is in the database and must not come to the page
//   - "Birinci ezber", marked Tam (PUT /lessons/:id/evaluations/:userId) and "İkinci ezber", not marked yet (Bekliyor)
// Released results cannot be released again (exam-results-are-released-once), so every walk makes its own course and its own exam, and
// `remove` deletes the course (DELETE /courses/:id as the başnazım, which takes the exams, results and marks with it).
//
// Why a course of its own: the seeded courses are other flows' data, and releasing an exam there could not be taken back. The course
// lives in the second köşk, "Kubbealtı Köşkü", where the seed has no course; its title is the one thing `make` and `remove` look it
// up by (tedris.course.readProgramme makes its course in the same köşk under another title), so a walk that crashed leaves nothing in
// the way of the next. The talebe is `applicantG`, who holds no seat anywhere
// (a spare: a woman with every profile attribute, no enrolment and no notification) and is left with none.
//
// SQL is used for one thing only, `passive`: no route takes the last müderris out of a course, so the role rows are revoked in the
// database, as tedris.course.readProgramme's helper does. The course's ids are written to graphs/.local/course-grades.json, which the
// binding reads as {grades.course}. Prints `grades-data <mode> <what was done>`. Nothing secret is printed.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { query } from "../../../bindings/helpers/db.mjs";
import {
  accountKey,
  Fail,
  LOCAL,
  must,
  nameOf,
  run,
  seed,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const TITLE = "Notlar denemesi";
const FILE = resolve(LOCAL, "course-grades.json");
const TALEBE = "applicantG";
const DAY = 86_400_000;

// An instant `days` from now at 18:00 UTC (21:00 in Istanbul), the hour the seed's own celses have.
const at = (days) => {
  const d = new Date(Date.now() + days * DAY);
  d.setUTCHours(18, 0, 0, 0);
  return d.toISOString();
};
// The same day as `YYYY-MM-DD` for the batch route, which takes a date and a clock in the course's zone.
const dateOf = (days) => at(days).slice(0, 10);

const idsOf = async () => {
  const out = await query(
    `select id from courses where title = '${TITLE}' and kosk_id = '${seed().kosk2}'`
  );
  return out
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l).id);
};

const remove = async () => {
  const ids = await idsOf();
  for (const id of ids)
    await must("systemAdmin", "DELETE", `/courses/${id}`, undefined, [404]);
  return ids.length;
};

const week = (n, title, lessons) => ({ weekNumber: n, title, lessons });
const lesson = (title, days) => ({
  title,
  type: "LIVE",
  durationMinutes: 60,
  scheduledAt: at(days),
});

const make = async (shape) => {
  await remove();
  const created = (
    await must("koskNazim", "POST", `/kosks/${seed().kosk2}/courses`, {
      title: TITLE,
      description: "Notlarım sekmesini görmek için yazılmış deneme dersi.",
      status: "PUBLISHED",
      requiresApproval: false,
      muderris: [{ userId: subOf("muderris"), name: await nameOf("muderris") }],
      weeks:
        shape === "full"
          ? [
              week(1, "Ezber", [
                lesson("Birinci ezber", -10),
                lesson("İkinci ezber", -9),
              ]),
            ]
          : [week(1, "Giriş", [lesson("Tanışma", 2)])],
    })
  ).body;
  // the talebe takes a seat: the course takes anyone, so the answer is ENROLLED at once
  await must(TALEBE, "POST", `/courses/${created.id}/enroll`);
  const ids = { course: created.id, title: TITLE, shape };

  if (shape === "full") {
    const course = (await must("koskNazim", "GET", `/courses/${created.id}`))
      .body;
    const byTitle = (t) =>
      course.weeks.flatMap((w) => w.lessons).find((l) => l.title === t);
    const first = byTitle("Birinci ezber");
    const second = byTitle("İkinci ezber");
    for (const l of [first, second])
      await must("muderris", "PUT", `/lessons/${l.id}/assignment`, {
        description: "Birinci faslı ezbere oku.",
        kind: "MEMORIZE",
      });
    // an exam is one celse the batch route plans in the week its date falls in, or in a week it adds after the last
    const plan = async (title, days, maxScore) => {
      const planned = (
        await must(
          "muderris",
          "POST",
          `/courses/${created.id}/sessions/batch`,
          {
            weekdays: [new Date(at(days)).getUTCDay() || 7],
            startTime: "21:00",
            timeZone: "Europe/Istanbul",
            startDate: dateOf(days),
            count: 1,
            title,
            durationMinutes: 60,
            exam: { maxScore },
          }
        )
      ).body;
      return planned.lessons[0].id;
    };
    const examA = await plan("Ara sınav", -3, 20);
    const examB = await plan("Dönem sınavı", -1, 100);
    const talebe = subOf(TALEBE);
    await must("muderris", "PUT", `/lessons/${examA}/exam-results/${talebe}`, {
      score: 17,
    });
    await must("muderris", "PUT", `/lessons/${examB}/exam-results/${talebe}`, {
      score: 64,
    });
    await must("muderris", "POST", `/lessons/${examA}/exam-results/release`);
    await must(
      "muderris",
      "PUT",
      `/lessons/${first.id}/evaluations/${talebe}`,
      {
        status: "FULL",
      }
    );
    Object.assign(ids, { examA, examB, first: first.id, second: second.id });
  }

  mkdirSync(LOCAL, { recursive: true });
  writeFileSync(FILE, `${JSON.stringify(ids)}\n`, { mode: 0o600 });
  return `${shape} course ${created.id}`;
};

// A scope is passive when its müderris role was held once and nobody holds it now (MDRS-136): the role rows are revoked, and an
// enrolled talebe of such a course is shut out of its content, so GET /courses/:id/my-grades answers 403 GRADES_FORBIDDEN.
const passive = async (on) => {
  const [id] = await idsOf();
  if (!id) throw new Fail("no course: run make first");
  await query(
    on
      ? `update role_assignments set revoked_at = now(), revoked_by = granted_by where role = 'MUDERRIS' and scope_id = '${id}'`
      : `update role_assignments set revoked_at = null, revoked_by = null where role = 'MUDERRIS' and scope_id = '${id}'`
  );
  return on ? "passive" : "active";
};

run("grades-data", async () => {
  const [mode, arg, ...more] = process.argv.slice(2);
  const modes = ["make", "passive", "remove"];
  if (!modes.includes(mode) || more.length || (mode === "remove") === !!arg)
    throw new Fail(
      "usage: grades-data.mjs make full|bare | passive on|off | remove",
      2
    );
  if (mode === "make" && !["full", "bare"].includes(arg))
    throw new Fail(`make takes full or bare, not ${arg}`, 2);
  if (mode === "passive" && !["on", "off"].includes(arg))
    throw new Fail(`passive takes on or off, not ${arg}`, 2);
  const done =
    mode === "make"
      ? await make(arg)
      : mode === "passive"
        ? await passive(arg === "on")
        : `${await remove()} course(s) removed`;
  console.log(`grades-data ${mode} ${done} (${accountKey(TALEBE)})`);
});
